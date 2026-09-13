import { ChromeTabBoundStorage, TabBoundStore } from "@core/tab-bound-store";
import type {
  RematchCandidate,
  RematchOutcome,
  TabBinding,
  TabBoundStorage,
} from "@core/tab-bound-store";

import { MEMO_DEFAULT_LAYOUT } from "./types";
import type { Memo, MemoLayout, MemoSummary, OrphanMemo } from "./types";

/** スキーマ変更に備えて版を含める。改名しても保存済みを落とさないよう据え置き。 */
const NAMESPACE = "tab-memo.v1";

/** タブから外れたメモを抱えておく期間。無期限だと閉じるたびに積み上がって減らない。 */
const ORPHAN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function bindingOf(tab: chrome.tabs.Tab): TabBinding {
  return {
    url: tab.url ?? "",
    title: tab.title ?? "",
    index: tab.index,
    pinned: tab.pinned,
  };
}

/**
 * 廃止した最大化状態で保存されたメモを通常表示として読む。
 * 読むだけの操作で保存値は書き換えない。
 */
function sanitizeLayout(layout: MemoLayout): MemoLayout {
  if (layout.state === "minimized" || layout.state === "normal") return layout;
  return { ...layout, state: "normal" };
}

function sanitizeMemo(memo: Memo): Memo {
  return { ...memo, layout: sanitizeLayout(memo.layout) };
}

/**
 * メモの永続化と問い合わせ。どのキーにどう並んでいるかは内側に閉じる。
 *
 * タブとの結びつけに使う手がかり (URL・位置・題名) は呼び出し側の関心事では
 * ないので、tabId を渡せば中でタブから補う。
 */
export class MemoRepository {
  private readonly store: TabBoundStore<Memo>;

  constructor(
    storage: TabBoundStorage<Memo> = new ChromeTabBoundStorage(NAMESPACE)
  ) {
    this.store = new TabBoundStore<Memo>({
      storage,
      // メモはユーザーが明示的に書いたものなので、常にセッションを越えて残す。
      survivesSession: () => true,
      orphanTtlMs: ORPHAN_TTL_MS,
    });
  }

  async findByTabId(tabId: number): Promise<Memo | undefined> {
    const memo = await this.store.get(tabId);
    return memo ? sanitizeMemo(memo) : undefined;
  }

  /** 既定レイアウトの空メモ。まだメモが無いタブに書き込むときの土台。 */
  emptyMemo(): Memo {
    return { text: "", layout: { ...MEMO_DEFAULT_LAYOUT } };
  }

  async save(tabId: number, memo: Memo): Promise<void> {
    const tab = await chrome.tabs.get(tabId);
    await this.store.set(tabId, memo, bindingOf(tab));
  }

  async delete(tabId: number): Promise<void> {
    await this.store.delete(tabId);
  }

  /** タブを閉じたときは結びつきだけ解く。復元されれば再結合できる。 */
  async detach(tabId: number): Promise<void> {
    await this.store.detach(tabId);
  }

  /** 再結合の手がかりを更新する。タブが既に無ければ何もしない。 */
  async refreshBinding(tabId: number): Promise<void> {
    const tab = await chrome.tabs.get(tabId).catch(() => undefined);
    if (!tab) return;
    await this.store.syncBinding(tabId, bindingOf(tab));
  }

  /**
   * 本文のあるメモだけを、結びついている tabId 付きで返す。
   * 開いただけで何も書いていないものが検索に引っかかると邪魔なので除く。
   */
  async listAttachedSummaries(): Promise<MemoSummary[]> {
    const attached = await this.store.attachedRecords();
    const summaries: MemoSummary[] = [];
    for (const [tabId, record] of attached) {
      if (record.value.text.length === 0) continue;
      summaries.push({ tabId, text: record.value.text });
    }
    return summaries;
  }

  /**
   * 指定した URL のタブが引き継げる、宙に浮いたメモ。新しいものを先に返す。
   *
   * 絞り込みは自動の再結合と同じく URL の完全一致。同じサイトでも別のページ
   * (別の会話・別の動画) は互いに無関係で、混ぜると選びたいものが埋もれる。
   *
   * 増える一方にならないよう、読むついでに期限切れを片付ける。
   */
  async listOrphansForUrl(url: string): Promise<OrphanMemo[]> {
    await this.store.pruneExpiredOrphans();
    const orphans = await this.store.orphans();
    return orphans
      .filter(
        (record) => record.binding.url === url && record.value.text.length > 0
      )
      .map((record) => ({
        recordId: record.id,
        text: record.value.text,
        url: record.binding.url,
        title: record.binding.title,
        updatedAt: record.updatedAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async attachOrphan(recordId: string, tabId: number): Promise<boolean> {
    return this.store.adoptOrphan(recordId, tabId);
  }

  async deleteOrphan(recordId: string): Promise<boolean> {
    return this.store.forgetOrphan(recordId);
  }

  async rematch(
    candidates: readonly RematchCandidate[]
  ): Promise<RematchOutcome> {
    return this.store.rematch(candidates);
  }

  /** 開いているタブを再結合の候補に整える。 */
  candidatesOf(tabs: readonly chrome.tabs.Tab[]): RematchCandidate[] {
    return tabs.flatMap((tab) =>
      tab.id === undefined ? [] : [{ tabId: tab.id, binding: bindingOf(tab) }]
    );
  }
}
