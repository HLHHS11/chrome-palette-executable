import type { RankingEntry } from "../domain/types";
import type { RankingRepository } from "./repository";

/**
 * `chrome.storage.local` 上の単一キーに `RankingEntry[]` を保存する実装。
 * スキーマの後方互換性確保のためキー名にバージョン suffix を付けている。
 */
const STORAGE_KEY = "ranking.v1";

export class ChromeStorageRankingRepository implements RankingRepository {
  async load(): Promise<RankingEntry[]> {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY];
    if (!Array.isArray(stored)) return [];
    return stored as RankingEntry[];
  }

  async save(entries: readonly RankingEntry[]): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: entries });
  }

  async reset(): Promise<void> {
    await chrome.storage.local.remove(STORAGE_KEY);
  }
}
