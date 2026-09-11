import {
  ChromeStorageTabBoundRepository,
  TabBoundStore,
} from "@core/tab-bound-store";
import type {
  RematchCandidate,
  TabBinding,
  TabBoundRepository,
} from "@core/tab-bound-store";

import {
  TAB_MEMO_DEFAULT_LAYOUT,
  TAB_MEMO_EXPANDED_SIZE,
  TAB_MEMO_FONT_SCALE,
} from "./types";
import type {
  OrphanTabMemo,
  TabMemo,
  TabMemoDisplayState,
  TabMemoLayout,
  TabMemoSummary,
} from "./types";

/** スキーマ変更に備えて版を含める。 */
const NAMESPACE = "tab-memo.v1";

function bindingOf(tab: chrome.tabs.Tab): TabBinding {
  return {
    url: tab.url ?? "",
    title: tab.title ?? "",
    index: tab.index,
    pinned: tab.pinned,
  };
}

function clampFontScale(scale: number): number {
  const { min, max } = TAB_MEMO_FONT_SCALE;
  if (!Number.isFinite(scale)) return TAB_MEMO_DEFAULT_LAYOUT.fontScale;
  return Math.min(max, Math.max(min, scale));
}

export class TabMemoService {
  private readonly store: TabBoundStore<TabMemo>;

  constructor(repository?: TabBoundRepository<TabMemo>) {
    this.store = new TabBoundStore<TabMemo>({
      repository:
        repository ?? new ChromeStorageTabBoundRepository<TabMemo>(NAMESPACE),
      // メモはユーザーが明示的に書いたものなので、常にセッションを越えて残す。
      survivesSession: () => true,
    });
  }

  async get(tabId: number): Promise<TabMemo | undefined> {
    return this.store.get(tabId);
  }

  /**
   * 本文を書き込む。まだメモが無いタブなら既定レイアウトで作る。
   * コマンドパレットからの追加が唯一の入口なので、ここが作成点になる。
   */
  async setText(tabId: number, text: string): Promise<TabMemo> {
    const tab = await chrome.tabs.get(tabId);
    const current = await this.store.get(tabId);
    const memo: TabMemo = {
      text,
      layout: current?.layout ?? { ...TAB_MEMO_DEFAULT_LAYOUT },
    };
    await this.store.set(tabId, memo, bindingOf(tab));
    return memo;
  }

  /** 移動・リサイズ・文字サイズ変更を保存する。本文は変えない。 */
  async updateLayout(
    tabId: number,
    patch: Partial<TabMemoLayout>
  ): Promise<TabMemo | undefined> {
    const current = await this.store.get(tabId);
    if (!current) return undefined;
    const layout: TabMemoLayout = {
      ...current.layout,
      ...patch,
      fontScale: clampFontScale(patch.fontScale ?? current.layout.fontScale),
    };
    const tab = await chrome.tabs.get(tabId);
    const memo: TabMemo = { ...current, layout };
    await this.store.set(tabId, memo, bindingOf(tab));
    return memo;
  }

  async setDisplayState(
    tabId: number,
    state: TabMemoDisplayState
  ): Promise<TabMemo | undefined> {
    return this.updateLayout(tabId, { state });
  }

  async remove(tabId: number): Promise<void> {
    await this.store.delete(tabId);
  }

  /** タブを閉じたときは結びつきだけ解く。復元されれば再結合できる。 */
  async detach(tabId: number): Promise<void> {
    await this.store.detach(tabId);
  }

  /** タブの URL や位置が変わったら、再結合の手がかりを更新しておく。 */
  async syncBinding(tabId: number): Promise<void> {
    const tab = await chrome.tabs.get(tabId).catch(() => undefined);
    if (!tab) return;
    await this.store.syncBinding(tabId, bindingOf(tab));
  }

  /** 一覧 UI と検索が使う、tabId → 本文の対応。 */
  async listByTabId(): Promise<Map<number, string>> {
    const tabs = await chrome.tabs.query({});
    const entries = await Promise.all(
      tabs.map(async (tab) => {
        if (tab.id === undefined) return undefined;
        const memo = await this.store.get(tab.id);
        if (!memo || memo.text.length === 0) return undefined;
        return [tab.id, memo.text] as const;
      })
    );
    return new Map(
      entries.filter((e): e is [number, string] => e !== undefined)
    );
  }

  async listSummaries(): Promise<TabMemoSummary[]> {
    const byTabId = await this.listByTabId();
    return [...byTabId].map(([tabId, text]) => ({ tabId, text }));
  }

  async listOrphans(): Promise<OrphanTabMemo[]> {
    const orphans = await this.store.orphans();
    return orphans.map((record) => ({
      recordId: record.id,
      text: record.value.text,
      url: record.binding.url,
      title: record.binding.title,
      updatedAt: record.updatedAt,
    }));
  }

  async adoptOrphan(recordId: string, tabId: number): Promise<boolean> {
    return this.store.adoptOrphan(recordId, tabId);
  }

  async forgetOrphan(recordId: string): Promise<boolean> {
    return this.store.forgetOrphan(recordId);
  }

  /**
   * セッション復元後にメモを開いているタブへ結び直す。
   * 決めきれなかったものは孤児として残り、ユーザーが選べる。
   */
  async rematchAll(): Promise<{ matched: number; unmatched: number }> {
    const tabs = await chrome.tabs.query({});
    const candidates: RematchCandidate[] = tabs.flatMap((tab) =>
      tab.id === undefined ? [] : [{ tabId: tab.id, binding: bindingOf(tab) }]
    );
    const outcome = await this.store.rematch(candidates);
    return {
      matched: outcome.matched.size,
      unmatched: outcome.unmatched.length,
    };
  }
}

export { TAB_MEMO_EXPANDED_SIZE };
