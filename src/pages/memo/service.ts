import {
  ChromeStorageTabBoundRepository,
  TabBoundStore,
} from "@core/tab-bound-store";
import type {
  RematchCandidate,
  TabBinding,
  TabBoundRepository,
} from "@core/tab-bound-store";

import { MEMO_DEFAULT_LAYOUT, MEMO_FONT_SCALE } from "./types";
import type {
  Memo,
  MemoDisplayState,
  MemoLayout,
  MemoSummary,
  OrphanMemo,
} from "./types";

/**
 * スキーマ変更に備えて版を含める。
 *
 * 機能名を Memo に改めた後もキーは `tab-memo` のまま。保存済みのメモを
 * 落とさないためで、ここは API 名ではなく保存場所の識別子。
 */
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
  const { min, max } = MEMO_FONT_SCALE;
  if (!Number.isFinite(scale)) return MEMO_DEFAULT_LAYOUT.fontScale;
  return Math.min(max, Math.max(min, scale));
}

/**
 * 保存済みレイアウトを現在の仕様に合わせて読み直す。
 *
 * 最大化を廃止したので、以前 `expanded` で保存されたメモは通常表示として扱う。
 * 保存値をその場で書き換えはしない (読むだけの操作で書き込みたくない)。
 * 次に何か更新されたときに自然と新しい値で上書きされる。
 */
function sanitizeLayout(layout: MemoLayout): MemoLayout {
  if (layout.state === "minimized" || layout.state === "normal") return layout;
  return { ...layout, state: "normal" };
}

function sanitizeMemo(memo: Memo): Memo {
  return { ...memo, layout: sanitizeLayout(memo.layout) };
}

export class MemoService {
  private readonly store: TabBoundStore<Memo>;

  constructor(repository?: TabBoundRepository<Memo>) {
    this.store = new TabBoundStore<Memo>({
      repository:
        repository ?? new ChromeStorageTabBoundRepository<Memo>(NAMESPACE),
      // メモはユーザーが明示的に書いたものなので、常にセッションを越えて残す。
      survivesSession: () => true,
    });
  }

  async get(tabId: number): Promise<Memo | undefined> {
    const memo = await this.store.get(tabId);
    return memo ? sanitizeMemo(memo) : undefined;
  }

  /**
   * 本文を書き込む。まだメモが無いタブなら既定レイアウトで作る。
   * コマンドパレットからの追加が唯一の入口なので、ここが作成点になる。
   */
  async setText(tabId: number, text: string): Promise<Memo> {
    const tab = await chrome.tabs.get(tabId);
    const current = await this.store.get(tabId);
    const memo: Memo = {
      text,
      layout: current?.layout ?? { ...MEMO_DEFAULT_LAYOUT },
    };
    await this.store.set(tabId, memo, bindingOf(tab));
    return memo;
  }

  /** 移動・リサイズ・文字サイズ変更を保存する。本文は変えない。 */
  async updateLayout(
    tabId: number,
    patch: Partial<MemoLayout>
  ): Promise<Memo | undefined> {
    const current = await this.store.get(tabId);
    if (!current) return undefined;
    const layout = sanitizeLayout({
      ...current.layout,
      ...patch,
      fontScale: clampFontScale(patch.fontScale ?? current.layout.fontScale),
    });
    const tab = await chrome.tabs.get(tabId);
    const memo: Memo = { ...current, layout };
    await this.store.set(tabId, memo, bindingOf(tab));
    return memo;
  }

  async setDisplayState(
    tabId: number,
    state: MemoDisplayState
  ): Promise<Memo | undefined> {
    return this.updateLayout(tabId, { state });
  }

  /** 最小化と通常表示を行き来する。大きさの調整はこの 1 操作で足りる。 */
  async toggleMinimized(tabId: number): Promise<Memo | undefined> {
    const current = await this.get(tabId);
    if (!current) return undefined;
    return this.updateLayout(tabId, {
      state: current.layout.state === "minimized" ? "normal" : "minimized",
    });
  }

  /**
   * 編集できる状態のメモを用意する。
   *
   * メモが無ければ空のまま作る。本文の入力はページ上の付箋で行うので、
   * ここで中身を受け取る必要はない。最小化されていたら通常表示に戻す
   * (最小化されたままではカーソルを置く場所が無い)。
   */
  async prepareForEditing(tabId: number): Promise<Memo> {
    const current = await this.get(tabId);
    if (!current) return this.setText(tabId, "");
    if (current.layout.state !== "minimized") return current;
    return (await this.setDisplayState(tabId, "normal")) ?? current;
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

  async listSummaries(): Promise<MemoSummary[]> {
    const byTabId = await this.listByTabId();
    return [...byTabId].map(([tabId, text]) => ({ tabId, text }));
  }

  async listOrphans(): Promise<OrphanMemo[]> {
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
