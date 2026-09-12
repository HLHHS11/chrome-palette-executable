import { InMemoryTabBoundStorage } from "@core/tab-bound-store";
import { strict as assert } from "node:assert";
import { afterEach, describe, it, vi } from "vitest";

import { MemoRepository } from "./repository";
import type { Memo } from "./types";

/** 結びつけの手がかりは `chrome.tabs` から補われるので、そこだけ差し替える。 */
function stubTabs(tabs: readonly Partial<chrome.tabs.Tab>[]): void {
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  vi.stubGlobal("chrome", {
    tabs: {
      get: async (tabId: number) => {
        const tab = byId.get(tabId);
        if (!tab) throw new Error(`No tab with id ${tabId}`);
        return { index: 0, pinned: false, title: "", url: "", ...tab };
      },
    },
  });
}

function memo(text: string): Memo {
  return {
    text,
    layout: {
      x: 0,
      y: 0,
      width: 280,
      height: 180,
      fontScale: 1,
      state: "normal",
    },
  };
}

function createRepository() {
  const storage = new InMemoryTabBoundStorage<Memo>();
  return { repository: new MemoRepository(storage), storage };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MemoRepository", () => {
  it("本文のあるメモだけを一覧に出す", async () => {
    stubTabs([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const { repository } = createRepository();
    await repository.save(1, memo("買うもの"));
    await repository.save(2, memo(""));
    await repository.save(3, memo("あとで読む"));

    const summaries = await repository.listAttachedSummaries();

    // 空のメモは「Edit Memo で付箋を出しただけ」の状態なので検索に混ぜない。
    assert.deepEqual(
      summaries.sort((a, b) => a.tabId - b.tabId),
      [
        { tabId: 1, text: "買うもの" },
        { tabId: 3, text: "あとで読む" },
      ]
    );
  });

  it("タブを閉じたメモは一覧から外れ、孤児として残る", async () => {
    stubTabs([{ id: 1, url: "https://example.com/", title: "Example" }]);
    const { repository } = createRepository();
    await repository.save(1, memo("消えては困る"));

    await repository.detach(1);

    assert.deepEqual(await repository.listAttachedSummaries(), []);
    const orphans = await repository.listOrphans();
    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].text, "消えては困る");
    assert.equal(orphans[0].title, "Example");
  });

  it("削除したメモは孤児にもならず消える", async () => {
    stubTabs([{ id: 1 }]);
    const { repository } = createRepository();
    await repository.save(1, memo("いらない"));

    await repository.delete(1);

    assert.equal(await repository.findByTabId(1), undefined);
    assert.deepEqual(await repository.listOrphans(), []);
  });

  it("廃止した expanded 状態は通常表示として読む", async () => {
    stubTabs([{ id: 1 }]);
    const { repository, storage } = createRepository();
    await repository.save(1, memo("古い形式"));
    // 最大化を廃止する前の保存値を直接作る。
    const stored = await storage.loadRecords();
    stored[0].value.layout.state = "expanded" as never;
    await storage.saveRecords(stored);

    const loaded = await repository.findByTabId(1);

    assert.equal(loaded?.layout.state, "normal");
  });

  it("一覧は 1 回の読み出しで済ませる", async () => {
    stubTabs([{ id: 1 }, { id: 2 }]);
    const { repository, storage } = createRepository();
    await repository.save(1, memo("a"));
    await repository.save(2, memo("b"));
    const loadRecords = vi.spyOn(storage, "loadRecords");

    await repository.listAttachedSummaries();

    // タブごとに引くと開いているタブ数だけ読み出しが走ってしまう。
    assert.equal(loadRecords.mock.calls.length, 1);
  });
});
