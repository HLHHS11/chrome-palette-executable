import type { HighlightSpec } from "@core/search";

/**
 * 1 件の検索結果のうち、キャッシュに乗せる最小データ。
 * Command の `handler` はシリアライズできないため、復元時に `tabId`/`windowId` から再構築する。
 */
export type CachedHit = {
  tabId: number;
  windowId: number;
  title: string;
  url: string;
  host: string;
  path: string;
  favicon?: string;
  score: number;
  highlights?: HighlightSpec;
};

type CachedState = {
  query: string;
  hits: CachedHit[];
  computedAt: number;
};

const KEY = "tab-search:state";
const TTL_MS = 60_000;

export class ResultCacheStore {
  private isAvailable(): boolean {
    return (
      typeof chrome !== "undefined" &&
      !!chrome.storage &&
      !!chrome.storage.session
    );
  }

  async loadFresh(): Promise<{ query: string; hits: CachedHit[] } | null> {
    if (!this.isAvailable()) return null;
    try {
      const obj = await chrome.storage.session.get(KEY);
      const v = obj[KEY] as CachedState | undefined;
      if (!v) return null;
      if (Date.now() - v.computedAt > TTL_MS) return null;
      return { query: v.query, hits: v.hits };
    } catch {
      return null;
    }
  }

  save(query: string, hits: CachedHit[]): void {
    if (!this.isAvailable()) return;
    const value: CachedState = { query, hits, computedAt: Date.now() };
    void chrome.storage.session.set({ [KEY]: value });
  }

  clear(): void {
    if (!this.isAvailable()) return;
    void chrome.storage.session.remove(KEY);
  }
}
