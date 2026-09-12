import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { tabContentSearcher } from "./tab-content-searcher";
import type { TabSnapshot } from "./types";

function snapshot(overrides: Partial<TabSnapshot>): TabSnapshot {
  return {
    tabId: 1,
    windowId: 1,
    title: "Untitled",
    url: "https://example.com/",
    host: "example.com",
    path: "/",
    text: "",
    reachable: true,
    ...overrides,
  };
}

describe("tabContentSearcher: メモ", () => {
  it("本文にも題名にも無い語でも、メモに書いてあれば見つかる", () => {
    const hits = tabContentSearcher.run("領収書", [
      snapshot({ tabId: 1, title: "Invoice", text: "nothing relevant here" }),
      snapshot({
        tabId: 2,
        title: "Invoice",
        text: "nothing relevant here",
        memo: "領収書の下書き",
      }),
    ]);

    assert.deepEqual(
      hits.map((hit) => hit.item.tabId),
      [2]
    );
  });

  it("メモに当たった行は本文ヒット 0 でも減点されない", () => {
    const [withMemo] = tabContentSearcher.run("deploy", [
      snapshot({ tabId: 1, memo: "deploy 手順のメモ" }),
    ]);
    const [withBodyOnly] = tabContentSearcher.run("deploy", [
      snapshot({ tabId: 2, text: "deploy runbook" }),
    ]);

    // メモは本文より強い手がかりとして扱う。
    assert.ok(withMemo.score > withBodyOnly.score);
  });

  it("同じページを開いた 2 つのタブを、メモの有無で区別して並べる", () => {
    const hits = tabContentSearcher.run("編集中", [
      snapshot({ tabId: 1, text: "shared page body", lastAccessed: 200 }),
      snapshot({
        tabId: 2,
        text: "shared page body",
        memo: "編集中なので閉じない",
        lastAccessed: 100,
      }),
    ]);

    assert.deepEqual(
      hits.map((hit) => hit.item.tabId),
      [2]
    );
  });

  it("メモ内のマッチ位置をハイライトとして返す", () => {
    const [hit] = tabContentSearcher.run("下書き", [
      snapshot({ memo: "請求書の下書き" }),
    ]);

    assert.deepEqual(hit.highlights?.memo, [[4, 7]]);
  });

  it("メモが無いタブでは memo ハイライトを付けない", () => {
    const [hit] = tabContentSearcher.run("body", [snapshot({ text: "body" })]);

    assert.equal(hit.highlights?.memo, undefined);
  });
});
