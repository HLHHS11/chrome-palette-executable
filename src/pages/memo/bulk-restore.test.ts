import type { TabBoundRecord } from "@core/tab-bound-store";
import { strict as assert } from "node:assert";
import { describe, it } from "vitest";

import { planBulkRestore } from "./bulk-restore";
import type { Memo } from "./types";

const SECOND = 1000;
const DAY = 24 * 60 * 60 * SECOND;
const closedAt = 2_000_000_000_000;

function orphan(
  id: string,
  url: string,
  detachedAt: number,
  { text = "メモ", index = 0 }: { text?: string; index?: number } = {}
): TabBoundRecord<Memo> {
  return {
    id,
    value: {
      text,
      layout: {
        x: 0,
        y: 0,
        width: 280,
        height: 180,
        fontScale: 1,
        state: "normal",
      },
    },
    binding: { url, title: "", index, pinned: false },
    detachedAt,
    updatedAt: detachedAt,
  };
}

function tab(tabId: number, url: string, index = 0) {
  return { tabId, binding: { url, title: "", index, pinned: false } };
}

describe("planBulkRestore", () => {
  it("まとめて閉じたメモを同じ URL のタブへ戻す", () => {
    const plan = planBulkRestore(
      [
        orphan("a", "https://a.example/", closedAt),
        orphan("b", "https://b.example/", closedAt + 5),
      ],
      [tab(10, "https://a.example/"), tab(11, "https://b.example/")]
    );
    assert.deepEqual(
      plan,
      new Map([
        ["a", 10],
        ["b", 11],
      ])
    );
  });

  it("前のメモとの間隔が 30 秒を超えたところで打ち切る", () => {
    const plan = planBulkRestore(
      [
        orphan("latest", "https://a.example/", closedAt),
        orphan("chained", "https://b.example/", closedAt - 25 * SECOND),
        // chained からは 25 秒、latest からは 50 秒。間隔で測るので含める。
        orphan("chained2", "https://c.example/", closedAt - 50 * SECOND),
        orphan("old", "https://d.example/", closedAt - DAY),
      ],
      [
        tab(10, "https://a.example/"),
        tab(11, "https://b.example/"),
        tab(12, "https://c.example/"),
        tab(13, "https://d.example/"),
      ]
    );
    assert.deepEqual([...plan.keys()].sort(), [
      "chained",
      "chained2",
      "latest",
    ]);
  });

  it("行き先の無いメモは、まとまりを測るときにも数えない", () => {
    // 戻し先の無い新しいメモが居座ると、その前のまとまりに届かなくなる。
    const plan = planBulkRestore(
      [
        orphan("homeless", "https://gone.example/", closedAt),
        orphan("earlier", "https://a.example/", closedAt - DAY),
      ],
      [tab(10, "https://a.example/")]
    );
    assert.deepEqual(plan, new Map([["earlier", 10]]));
  });

  it("同じ URL が複数あれば、元の位置順に空いているタブへ割り当てる", () => {
    const plan = planBulkRestore(
      [
        orphan("second", "https://a.example/", closedAt, { index: 5 }),
        orphan("first", "https://a.example/", closedAt, { index: 2 }),
        orphan("extra", "https://a.example/", closedAt, { index: 9 }),
      ],
      [tab(21, "https://a.example/", 7), tab(20, "https://a.example/", 1)]
    );
    // タブが 2 つしか無いので、3 件目は孤児のまま残る。
    assert.deepEqual(
      plan,
      new Map([
        ["first", 20],
        ["second", 21],
      ])
    );
  });

  it("本文の無いメモは戻さない", () => {
    const plan = planBulkRestore(
      [orphan("empty", "https://a.example/", closedAt, { text: "" })],
      [tab(10, "https://a.example/")]
    );
    assert.equal(plan.size, 0);
  });
});
