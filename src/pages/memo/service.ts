import { MemoRepository } from "./repository";
import { MEMO_FONT_SCALE } from "./types";
import type {
  Memo,
  MemoDisplayState,
  MemoLayout,
  MemoSummary,
  OrphanMemo,
} from "./types";

function clampFontScale(scale: number): number {
  const { min, max } = MEMO_FONT_SCALE;
  if (!Number.isFinite(scale)) return 1;
  return Math.min(max, Math.max(min, scale));
}

/**
 * メモに対する操作の意味を決める層。
 * 保存場所や問い合わせ方には立ち入らず、振る舞いの規則だけを持つ。
 */
export class MemoService {
  constructor(
    private readonly repository: MemoRepository = new MemoRepository()
  ) {}

  async get(tabId: number): Promise<Memo | undefined> {
    return this.repository.findByTabId(tabId);
  }

  /** 本文を書き込む。まだメモが無いタブなら既定レイアウトで作る。 */
  async setText(tabId: number, text: string): Promise<Memo> {
    const current = await this.repository.findByTabId(tabId);
    const memo: Memo = { ...(current ?? this.repository.emptyMemo()), text };
    await this.repository.save(tabId, memo);
    return memo;
  }

  /** 移動・リサイズ・文字サイズ変更を保存する。本文は変えない。 */
  async updateLayout(
    tabId: number,
    patch: Partial<MemoLayout>
  ): Promise<Memo | undefined> {
    const current = await this.repository.findByTabId(tabId);
    if (!current) return undefined;
    const layout: MemoLayout = {
      ...current.layout,
      ...patch,
      fontScale: clampFontScale(patch.fontScale ?? current.layout.fontScale),
    };
    const memo: Memo = { ...current, layout };
    await this.repository.save(tabId, memo);
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
    const current = await this.repository.findByTabId(tabId);
    if (!current) return undefined;
    return this.updateLayout(tabId, {
      state: current.layout.state === "minimized" ? "normal" : "minimized",
    });
  }

  /**
   * 編集できる状態のメモを用意する。無ければ空のまま作る。
   * 最小化されたままではカーソルを置く場所が無いので、通常表示に戻す。
   */
  async prepareForEditing(tabId: number): Promise<Memo> {
    const current = await this.repository.findByTabId(tabId);
    if (!current) return this.setText(tabId, "");
    if (current.layout.state !== "minimized") return current;
    return (await this.setDisplayState(tabId, "normal")) ?? current;
  }

  async remove(tabId: number): Promise<void> {
    await this.repository.delete(tabId);
  }

  /**
   * タブを閉じたときは結びつきだけ解く。復元されれば再結合できる。
   * ただし何も書かれていないメモは抱えておく意味がないので捨てる。
   */
  async detach(tabId: number): Promise<void> {
    const memo = await this.repository.findByTabId(tabId);
    if (memo && memo.text.length === 0) {
      await this.repository.delete(tabId);
      return;
    }
    await this.repository.detach(tabId);
  }

  /** タブの URL や位置が変わったら、再結合の手がかりを更新しておく。 */
  async syncBinding(tabId: number): Promise<void> {
    await this.repository.refreshBinding(tabId);
  }

  /** 一覧 UI と検索が使う、本文のあるメモの一覧。 */
  async listSummaries(): Promise<MemoSummary[]> {
    return this.repository.listAttachedSummaries();
  }

  /** そのタブが引き継げる、宙に浮いたメモ。同じ URL のものだけ。 */
  async listOrphansFor(tabId: number): Promise<OrphanMemo[]> {
    const tab = await chrome.tabs.get(tabId).catch(() => undefined);
    const url = tab?.url ?? tab?.pendingUrl;
    if (!url) return [];
    return this.repository.listOrphansForUrl(url);
  }

  async adoptOrphan(recordId: string, tabId: number): Promise<boolean> {
    return this.repository.attachOrphan(recordId, tabId);
  }

  async forgetOrphan(recordId: string): Promise<boolean> {
    return this.repository.deleteOrphan(recordId);
  }

  /**
   * セッション復元後にメモを開いているタブへ結び直す。
   * 決めきれなかったものは宙に浮いたまま残し、ユーザーに選ばせる。
   */
  async rematchAll(): Promise<{ matched: number; unmatched: number }> {
    const tabs = await chrome.tabs.query({});
    const outcome = await this.repository.rematch(
      this.repository.candidatesOf(tabs)
    );
    return {
      matched: outcome.matched.size,
      unmatched: outcome.unmatched.length,
    };
  }
}
