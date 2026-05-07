import type { CommandId, NormalizedQuery, RankingEntry } from "./types";

/**
 * クエリ完全一致のヒットに掛かる係数。
 * 大きいほど「同一クエリでの過去選択」が強く作用する。
 */
const K_EXACT = 100;

/**
 * グローバル (クエリ非依存) MRU のヒットに掛かる係数。
 * K_EXACT より十分小さくし、曖昧クエリでの偏りを抑える。
 */
const K_GLOBAL = 5;

/** グローバル MRU を表すクエリ値。 */
export const GLOBAL_QUERY: NormalizedQuery = "";

/**
 * `(commandId, query)` ペアの内部マップキーを生成する。
 * NUL 区切りで衝突可能性のある文字列結合を避ける。
 */
export function entryKey(
  commandId: CommandId,
  query: NormalizedQuery
): string {
  return `${query}\u0000${commandId}`;
}

/**
 * fuzzysort スコアに加算するブースト値を返す。
 *
 * - 完全一致クエリのヒット数 × K_EXACT
 * - グローバル MRU のヒット数 × K_GLOBAL
 *
 * `query` が空文字 (= グローバル) のときは二重加算を避ける。
 */
export function computeBoost(
  entries: ReadonlyMap<string, RankingEntry>,
  commandId: CommandId,
  normalizedQuery: NormalizedQuery
): number {
  const globalHits = entries.get(entryKey(commandId, GLOBAL_QUERY))?.hitCount ?? 0;
  if (normalizedQuery === GLOBAL_QUERY) {
    return K_GLOBAL * globalHits;
  }
  const exactHits =
    entries.get(entryKey(commandId, normalizedQuery))?.hitCount ?? 0;
  return K_EXACT * exactHits + K_GLOBAL * globalHits;
}
