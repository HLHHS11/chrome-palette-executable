import { InMemoryTabBoundStorage } from "@core/tab-bound-store";
import { strict as assert } from "node:assert";
import { describe, it } from "vitest";

import { ManualProtectionRepository } from "./manual-protection-repository";
import type { ManualProtection } from "./manual-protection-repository";

const now = 2_000_000_000_000;

type Tab = chrome.tabs.Tab & { id: number };

function tab(overrides: Partial<Tab> & { id: number }): Tab {
  return {
    url: "https://example.com/",
    title: "Example",
    index: 0,
    pinned: false,
    ...overrides,
  } as Tab;
}

function createStore() {
  const repository = new InMemoryTabBoundStorage<ManualProtection>();
  return new ManualProtectionRepository(repository);
}

describe("ManualProtectionRepository", () => {
  it("閉じたタブの宣言は残り、開き直せば結び直される", async () => {
    const store = createStore();
    await store.protect(tab({ id: 1, url: "https://example.com/spec" }), now);

    await store.detach(1);
    assert.equal(await store.isProtected(1), false);
    assert.equal((await store.listUnmatched()).length, 1);

    const restored = await store.rematch([
      tab({ id: 99, url: "https://example.com/spec" }),
    ]);

    assert.deepEqual([...restored], [99]);
    assert.deepEqual(await store.listUnmatched(), []);
  });

  it("同じ URL の 2 つのタブを、ウィンドウ内の位置で区別して復元する", async () => {
    const store = createStore();
    await store.protect(
      tab({ id: 1, url: "https://docs.example.com/", index: 5 }),
      now
    );
    await store.detach(1);

    const restored = await store.rematch([
      tab({ id: 10, url: "https://docs.example.com/", index: 0 }),
      tab({ id: 11, url: "https://docs.example.com/", index: 5 }),
    ]);

    // 参照用と編集用を取り違えないことがこの機能の肝。
    assert.deepEqual([...restored], [11]);
  });

  it("本当に区別が付かないときは、推測せず宙に浮かせる", async () => {
    const store = createStore();
    await store.protect(
      tab({ id: 1, url: "https://docs.example.com/", index: 3, title: "Docs" }),
      now
    );
    await store.detach(1);

    const restored = await store.rematch([
      tab({
        id: 10,
        url: "https://docs.example.com/",
        index: 2,
        title: "別物",
      }),
      tab({
        id: 11,
        url: "https://docs.example.com/",
        index: 4,
        title: "別物",
      }),
    ]);

    assert.deepEqual([...restored], []);
    assert.equal((await store.listUnmatched()).length, 1);
  });

  it("保持を解除した宣言は宙に浮かず、消える", async () => {
    const store = createStore();
    await store.protect(tab({ id: 1 }), now);

    await store.release(1);

    assert.equal(await store.isProtected(1), false);
    assert.deepEqual(await store.listUnmatched(), []);
  });

  it("onReplaced で tabId が振り直されても宣言を引き継ぐ", async () => {
    const store = createStore();
    await store.protect(tab({ id: 1 }), now);

    await store.transfer(1, tab({ id: 2 }));

    assert.equal(await store.isProtected(1), false);
    assert.equal(await store.isProtected(2), true);
  });
});

describe("ManualProtectionRepository: 旧形式からの移行", () => {
  it("旧形式の URL を宙に浮いた宣言として取り込む", async () => {
    const store = createStore();

    await store.seedFromLegacyUrls(
      ["https://a.example.com/", "https://b.example.com/"],
      now
    );

    assert.deepEqual(
      (await store.listUnmatched()).map((item) => item.url).sort(),
      ["https://a.example.com/", "https://b.example.com/"]
    );
  });

  it("起動のたびに呼ばれても宣言が増えない", async () => {
    const store = createStore();
    await store.seedFromLegacyUrls(["https://a.example.com/"], now);

    await store.seedFromLegacyUrls(["https://a.example.com/"], now);

    assert.equal((await store.listUnmatched()).length, 1);
  });

  it("既にタブへ結びついている URL は取り込まない", async () => {
    const store = createStore();
    await store.protect(tab({ id: 1, url: "https://a.example.com/" }), now);

    await store.seedFromLegacyUrls(["https://a.example.com/"], now);

    assert.deepEqual(await store.listUnmatched(), []);
  });

  it("取り込んだ宣言は、開いているタブへ結び直される", async () => {
    const store = createStore();
    await store.seedFromLegacyUrls(["https://a.example.com/"], now);

    const restored = await store.rematch([
      tab({ id: 7, url: "https://a.example.com/" }),
      tab({ id: 8, url: "https://other.example.com/" }),
    ]);

    assert.deepEqual([...restored], [7]);
  });
});
