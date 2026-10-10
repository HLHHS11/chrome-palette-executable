import { strict as assert } from "node:assert";
import { afterEach, describe, it, vi } from "vitest";

import { storageCell } from "./storage-cell";

/** `chrome.storage.local` の代わり。書き込み回数を数えられるようにする。 */
function stubLocalStorage(initial: Record<string, unknown> = {}) {
  const saved: Record<string, unknown> = { ...initial };
  const set = vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(saved, items);
  });
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: saved[key] }),
        set,
      },
    },
  });
  return { saved, set };
}

const numbers = {
  decode: (stored: unknown) => (Array.isArray(stored) ? stored : []),
  encode: (value: number[]) => value,
};

/** セルはキーごとに使い回されるので、テストごとに別のキーを使う。 */
let seq = 0;
const freshKey = () => `test-${++seq}`;

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("storageCell", () => {
  it("保存済みの値を読み込む", async () => {
    const key = freshKey();
    stubLocalStorage({ [key]: [1, 2] });
    const cell = storageCell("local", key, numbers);

    await cell.ready();

    assert.deepEqual(cell.get(), [1, 2]);
  });

  it("同じキーには同じセルを返し、写しを共有する", async () => {
    const key = freshKey();
    stubLocalStorage();
    const a = storageCell("local", key, numbers);
    const b = storageCell("local", key, numbers);
    await a.ready();

    a.set([7]);

    assert.equal(a, b);
    assert.deepEqual(b.get(), [7]);
  });

  it("同時に来た読み書きでも、互いの変更を消さない", async () => {
    const key = freshKey();
    stubLocalStorage();
    const cell = storageCell("local", key, numbers);
    const append = async (n: number) => {
      await cell.ready();
      cell.set([...cell.get(), n]);
    };

    await Promise.all([1, 2, 3].map(append));

    assert.deepEqual(cell.get().sort(), [1, 2, 3]);
  });

  it("続けて書き換えても、ストレージへの書き込みは 1 回にまとめる", async () => {
    const key = freshKey();
    const { saved, set } = stubLocalStorage();
    const cell = storageCell("local", key, numbers);
    await cell.ready();

    cell.set([1]);
    cell.set([1, 2]);
    await nextTask();

    // 前のテストで予約された書き込みも届くので、このキーの分だけ数える。
    const writes = set.mock.calls.filter(([items]) => key in items);
    assert.equal(writes.length, 1);
    assert.deepEqual(saved[key], [1, 2]);
  });

  it("取り出した値を書き換えても写しは変わらない", async () => {
    const key = freshKey();
    stubLocalStorage({ [key]: [1] });
    const cell = storageCell("local", key, numbers);
    await cell.ready();

    cell.get().push(99);

    assert.deepEqual(cell.get(), [1]);
  });
});
