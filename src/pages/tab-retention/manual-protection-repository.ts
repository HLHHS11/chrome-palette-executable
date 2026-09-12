import { ChromeTabBoundStorage, TabBoundStore } from "@core/tab-bound-store";
import type {
  RematchCandidate,
  TabBinding,
  TabBoundStorage,
} from "@core/tab-bound-store";

import type { UnmatchedManualProtection } from "./types";

/** スキーマ変更に備えて版を含める。 */
const NAMESPACE = "tab-retention.manual.v1";

/**
 * 明示保持そのものには持たせる情報が無いので、いつ宣言されたかだけ残す。
 * 一覧の並びと、古い宣言の棚卸しに使える。
 */
export type ManualProtection = { protectedAt: number };

export function bindingOfTab(tab: chrome.tabs.Tab): TabBinding {
  return {
    url: tab.url ?? tab.pendingUrl ?? "",
    title: tab.title ?? "",
    index: tab.index,
    pinned: tab.pinned,
  };
}

/**
 * 明示保持の宣言の永続化と問い合わせを担うリポジトリ。
 *
 * 以前は「完全一致 URL のタブがちょうど 1 つのときだけ復元する」という規則で
 * セッションを越えていた。そのため参照用と編集用で同じページを 2 つ開いていると、
 * どちらの保持も諦めていた。ストアは URL に加えてウィンドウ内の位置・題名・固定状態まで
 * 見て突き合わせるので、この場合も取り違えずに復元できる。本当に区別が付かないときだけ
 * 宙に浮かせてユーザーに選ばせる方針は変わらない。
 */
export class ManualProtectionRepository {
  private readonly store: TabBoundStore<ManualProtection>;

  constructor(
    storage: TabBoundStorage<ManualProtection> = new ChromeTabBoundStorage(
      NAMESPACE
    )
  ) {
    this.store = new TabBoundStore<ManualProtection>({
      storage,
      // 明示保持はユーザーの宣言なので、常にセッションを越えて残す。
      survivesSession: () => true,
    });
  }

  async isProtected(tabId: number): Promise<boolean> {
    return (await this.store.get(tabId)) !== undefined;
  }

  async protect(tab: chrome.tabs.Tab & { id: number }, now: number) {
    await this.store.set(tab.id, { protectedAt: now }, bindingOfTab(tab));
  }

  async release(tabId: number): Promise<void> {
    await this.store.delete(tabId);
  }

  /** タブが閉じられたときは宣言を残したまま結びつきだけ解く。 */
  async detach(tabId: number): Promise<void> {
    await this.store.detach(tabId);
  }

  async syncBinding(tab: chrome.tabs.Tab & { id: number }): Promise<void> {
    await this.store.syncBinding(tab.id, bindingOfTab(tab));
  }

  /**
   * `chrome.tabs.onReplaced` で tabId が振り直されたとき、宣言を新しい tabId へ移す。
   * 値が無い (保持していないタブ) 場合は何もしない。
   */
  async transfer(
    fromTabId: number,
    toTab: chrome.tabs.Tab & { id: number }
  ): Promise<void> {
    const existing = await this.store.get(fromTabId);
    if (!existing) return;
    await this.store.delete(fromTabId);
    await this.store.set(toTab.id, existing, bindingOfTab(toTab));
  }

  /**
   * 新しいブラウザセッションで、宣言を開いているタブへ結び直す。
   * 戻り値は明示保持として復活した tabId の集合。
   */
  async rematch(tabs: readonly (chrome.tabs.Tab & { id: number })[]) {
    const candidates: RematchCandidate[] = tabs.map((tab) => ({
      tabId: tab.id,
      binding: bindingOfTab(tab),
    }));
    const outcome = await this.store.rematch(candidates);
    return new Set(outcome.matched.values());
  }

  /** 現在どのタブにも結びついていない宣言。 */
  async listUnmatched(): Promise<UnmatchedManualProtection[]> {
    const orphans = await this.store.orphans();
    return orphans
      .map((record) => ({
        recordId: record.id,
        url: record.binding.url,
        title: record.binding.title,
        protectedAt: record.value.protectedAt,
      }))
      .sort((a, b) => b.protectedAt - a.protectedAt);
  }

  async adopt(recordId: string, tabId: number): Promise<boolean> {
    return this.store.adoptOrphan(recordId, tabId);
  }

  async forget(recordId: string): Promise<boolean> {
    return this.store.forgetOrphan(recordId);
  }

  /**
   * 旧形式 (URL の集合として持っていた明示保持) の取り込み。
   *
   * どの URL も宙に浮いた宣言として作るだけで、タブへの結びつけは
   * 通常どおり `rematch` に任せる。旧形式は tabId を持たず、持っていても
   * ブラウザ再起動を跨いだ tabId は別のタブを指しうるため、ここで結びつけては
   * ならない。既に同じ URL の宣言を持っているものは飛ばすので、起動のたびに
   * 呼ばれても宣言は増えない。
   */
  async seedFromLegacyUrls(
    urls: readonly string[],
    now: number
  ): Promise<void> {
    const known = new Set(
      (await this.store.allRecords()).map((record) => record.binding.url)
    );
    for (const url of urls) {
      if (url.length === 0 || known.has(url)) continue;
      known.add(url);
      await this.store.createOrphan(
        { protectedAt: now },
        { url, title: "", index: -1, pinned: false }
      );
    }
  }
}
