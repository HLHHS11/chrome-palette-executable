import { ChromeTabBoundStorage, TabBoundStore } from "@core/tab-bound-store";
import type {
  RematchCandidate,
  RematchOutcome,
  TabBinding,
  TabBoundStorage,
} from "@core/tab-bound-store";

import { MEMO_DEFAULT_LAYOUT } from "./types";
import type { Memo, MemoLayout, MemoSummary, OrphanMemo } from "./types";

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

/**
 * 保存済みレイアウトを現在の仕様に合わせて読み直す。
 *
 * 最大化を廃止したので、以前 `expanded` で保存されたメモは通常表示として扱う。
 * 読むだけの操作で保存値を書き換えはしない。次に何か更新されたときに
 * 自然と新しい値で上書きされる。
 */
function sanitizeLayout(layout: MemoLayout): MemoLayout {
  if (layout.state === "minimized" || layout.state === "normal") return layout;
  return { ...layout, state: "normal" };
}

function sanitizeMemo(memo: Memo): Memo {
  return { ...memo, layout: sanitizeLayout(memo.layout) };
}

/**
 * メモの永続化と問い合わせを担うリポジトリ。
 *
 * 「メモ」というリソースに対する入出力の語彙だけを外に出し、それが
 * `chrome.storage` のどのキーにどう並んでいるかは内側に閉じる。汎用の
 * `TabBoundStorage` を DI で受け取るので、テストではインメモリ実装に差し替えられる。
 *
 * タブとの結びつけに必要な手がかり (URL・位置・題名) は呼び出し側の関心事では
 * ないため、tabId を渡せば中で `chrome.tabs` から補う。
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
   *
   * 一覧 UI と検索が使う。空のメモを混ぜないのは、「Edit Memo で付箋を出した
   * だけでまだ何も書いていない」ものが検索に引っかかっても邪魔なため。
   * タブごとに読み出すのではなく 1 回で済ませる。
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

  /** どのタブにも結びついていないメモ。新しく触ったものを先に返す。 */
  async listOrphans(): Promise<OrphanMemo[]> {
    const orphans = await this.store.orphans();
    return orphans
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
