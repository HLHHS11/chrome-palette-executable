import { GLOBAL_QUERY, computeBoost, entryKey } from "./score";
import type { CommandId, NormalizedQuery, RankingEntry } from "./types";

/**
 * コマンドパレットのキーワード別ランキングを表す Aggregate Root。
 *
 * - `(commandId, query)` ペアごとにヒット数と最終使用時刻を保持する
 * - クエリが空文字 ("") のエントリはグローバル MRU を兼ねる
 * - I/O には依存せず、永続化はリポジトリ層に委譲する
 */
export class CommandRanking {
  private readonly entries: Map<string, RankingEntry>;

  constructor(initial: readonly RankingEntry[] = []) {
    this.entries = new Map(
      initial.map((e) => [entryKey(e.commandId, e.query), { ...e }])
    );
  }

  /**
   * クエリの正規化規則。trim + toLowerCase のみ。
   * 言語特化の正規化は行わない (英単語中心の利用を想定)。
   */
  static normalizeQuery(raw: string): NormalizedQuery {
    return raw.trim().toLowerCase();
  }

  /**
   * 実行イベントを記録する。`(commandId, query)` と
   * グローバル MRU `(commandId, "")` の両方を更新する。
   */
  record(commandId: CommandId, rawQuery: string, now: number): void {
    const query = CommandRanking.normalizeQuery(rawQuery);
    this.upsert(commandId, query, now);
    if (query !== GLOBAL_QUERY) {
      this.upsert(commandId, GLOBAL_QUERY, now);
    }
  }

  /**
   * fuzzysort のスコアに加算するブースト値を返す。
   */
  boost(commandId: CommandId, rawQuery: string): number {
    const query = CommandRanking.normalizeQuery(rawQuery);
    return computeBoost(this.entries, commandId, query);
  }

  /** 永続化用にエントリの不変スナップショットを返す。 */
  snapshot(): RankingEntry[] {
    return Array.from(this.entries.values(), (e) => ({ ...e }));
  }

  /** メモリ上のエントリをすべて破棄する。 */
  clear(): void {
    this.entries.clear();
  }

  private upsert(
    commandId: CommandId,
    query: NormalizedQuery,
    now: number
  ): void {
    const key = entryKey(commandId, query);
    const existing = this.entries.get(key);
    if (existing) {
      existing.hitCount += 1;
      existing.lastUsedAt = now;
      return;
    }
    this.entries.set(key, {
      commandId,
      query,
      hitCount: 1,
      lastUsedAt: now,
    });
  }
}
