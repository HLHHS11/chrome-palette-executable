import { ChromeTabBoundStorage, TabBoundStore } from "@core/tab-bound-store";
import type {
  RematchCandidate,
  RematchOutcome,
  TabBinding,
  TabBoundStorage,
} from "@core/tab-bound-store";

import type { TabTimers, TimerRecord } from "./types";

/** スキーマ変更に備えて版を含める。 */
const NAMESPACE = "tab-timer.v1";

/**
 * タブから外れたタイマーを抱えておく期間。
 *
 * 期限が来れば発火して役目を終えるので、メモほど長く持つ必要はない。
 * 一方で、発火したのに気付かないまま一晩経つことはあるため、1 日は残す。
 */
const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;

function bindingOf(tab: chrome.tabs.Tab): TabBinding {
  return {
    url: tab.url ?? "",
    title: tab.title ?? "",
    index: tab.index,
    pinned: tab.pinned,
  };
}

/**
 * タイマーの永続化と問い合わせ。どのキーにどう並んでいるかは内側に閉じる。
 *
 * タブとの結びつけに使う手がかり (URL・位置・題名) は呼び出し側の関心事では
 * ないので、tabId を渡せば中でタブから補う。
 */
export class TimerRepository {
  private readonly store: TabBoundStore<TabTimers>;

  constructor(
    storage: TabBoundStorage<TabTimers> = new ChromeTabBoundStorage(NAMESPACE)
  ) {
    this.store = new TabBoundStore<TabTimers>({
      storage,
      // 再起動を跨いでも期限は期限なので、常にセッションを越えて残す。
      survivesSession: () => true,
      orphanTtlMs: ORPHAN_TTL_MS,
    });
  }

  async findByTabId(tabId: number): Promise<TabTimers | undefined> {
    return this.store.get(tabId);
  }

  async save(tabId: number, value: TabTimers): Promise<void> {
    const tab = await chrome.tabs.get(tabId);
    await this.store.set(tabId, value, bindingOf(tab));
  }

  async delete(tabId: number): Promise<void> {
    await this.store.delete(tabId);
  }

  /** タブを閉じたときは結びつきだけ解く。期限はそのまま生きている。 */
  async detach(tabId: number): Promise<void> {
    await this.store.detach(tabId);
  }

  async refreshBinding(tabId: number): Promise<void> {
    const tab = await chrome.tabs.get(tabId).catch(() => undefined);
    if (!tab) return;
    await this.store.syncBinding(tabId, bindingOf(tab));
  }

  /**
   * 保持しているタイマーを、結びついているタブの手がかりを添えて全件返す。
   *
   * 結びつきの有無で絞らないのは、タブを閉じた後のタイマーも期限を待って
   * いるためである。読み出しは 1 度にまとめる。レコードごとに引くと、
   * 保存されている数だけ往復が発生する。
   */
  async listRecords(): Promise<TimerRecord[]> {
    const [records, attached] = await Promise.all([
      this.store.allRecords(),
      this.store.attachedRecords(),
    ]);
    const tabIdByRecordId = new Map(
      [...attached].map(([tabId, record]) => [record.id, tabId])
    );
    return records.map((record) => ({
      recordId: record.id,
      tabId: tabIdByRecordId.get(record.id),
      tabTitle: record.binding.title,
      url: record.binding.url,
      value: record.value,
    }));
  }

  async saveRecordValue(recordId: string, value: TabTimers): Promise<void> {
    await this.store.setValue(recordId, value);
  }

  async pruneExpiredOrphans(): Promise<void> {
    await this.store.pruneExpiredOrphans();
  }

  async rematch(
    candidates: readonly RematchCandidate[]
  ): Promise<RematchOutcome> {
    return this.store.rematch(candidates);
  }

  candidatesOf(tabs: readonly chrome.tabs.Tab[]): RematchCandidate[] {
    return tabs.flatMap((tab) =>
      tab.id === undefined ? [] : [{ tabId: tab.id, binding: bindingOf(tab) }]
    );
  }
}
