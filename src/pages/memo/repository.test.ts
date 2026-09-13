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
    const orphans = await repository.listOrphansForUrl("https://example.com/");
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
    assert.deepEqual(
      await repository.listOrphansForUrl("https://example.com/"),
      []
    );
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

describe("MemoRepository: 既定レイアウト", () => {
  it("新しいメモは位置未確定の印を持つ", async () => {
    const { repository } = createRepository();

    // 「右寄り・高さは中央」はビューポートを見ないと px にできないので、
    // background で作る時点では確定させられない。
    assert.equal(repository.emptyMemo().layout.awaitingPlacement, true);
  });

  it("位置を確定させたメモは、印が外れたまま読み戻される", async () => {
    stubTabs([{ id: 1 }]);
    const { repository } = createRepository();
    const placed = repository.emptyMemo();
    placed.layout = {
      ...placed.layout,
      x: 900,
      y: 300,
      awaitingPlacement: false,
    };
    await repository.save(1, placed);

    const loaded = await repository.findByTabId(1);

    assert.equal(loaded?.layout.awaitingPlacement, false);
    assert.equal(loaded?.layout.x, 900);
  });
});

describe("MemoRepository: 引き継ぎ候補の絞り込み", () => {
  it("同じ URL で書かれたメモだけを候補にする", async () => {
    stubTabs([
      { id: 1, url: "https://claude.ai/chat/aaa", title: "キーバインドの話" },
      { id: 2, url: "https://claude.ai/chat/bbb", title: "コピーモードの話" },
      { id: 3, url: "https://youtube.com/watch?v=zzz", title: "動画" },
    ]);
    const { repository } = createRepository();
    await repository.save(1, memo("キーバインドのメモ"));
    await repository.save(2, memo("コピーモードのメモ"));
    await repository.save(3, memo("動画のメモ"));
    await repository.detach(1);
    await repository.detach(2);
    await repository.detach(3);

    const candidates = await repository.listOrphansForUrl(
      "https://claude.ai/chat/bbb"
    );

    // 同じサイトでも別の会話は無関係。まして別サイトのメモを引き継ぐ意味はない。
    assert.deepEqual(
      candidates.map((orphan) => orphan.text),
      ["コピーモードのメモ"]
    );
  });

  it("本文が空のメモは候補に並べない", async () => {
    stubTabs([{ id: 1, url: "https://example.com/" }]);
    const { repository } = createRepository();
    await repository.save(1, memo(""));
    await repository.detach(1);

    assert.deepEqual(
      await repository.listOrphansForUrl("https://example.com/"),
      []
    );
  });

  it("同じ URL の候補は新しいものが先に並ぶ", async () => {
    stubTabs([
      { id: 1, url: "https://example.com/" },
      { id: 2, url: "https://example.com/" },
    ]);
    const { repository, storage } = createRepository();
    await repository.save(1, memo("古い方"));
    await repository.save(2, memo("新しい方"));
    await repository.detach(1);
    await repository.detach(2);
    const records = await storage.loadRecords();
    records[0].updatedAt = 1_000;
    records[1].updatedAt = 2_000;
    await storage.saveRecords(records);

    const candidates = await repository.listOrphansForUrl(
      "https://example.com/"
    );

    assert.deepEqual(
      candidates.map((orphan) => orphan.text),
      ["新しい方", "古い方"]
    );
  });
});
