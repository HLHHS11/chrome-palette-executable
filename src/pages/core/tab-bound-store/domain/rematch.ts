import type {
  RematchCandidate,
  RematchOutcome,
  TabBinding,
  TabBoundRecord,
  TabBoundRecordId,
} from "./types.js";

/**
 * 照合の確からしさ。優先度は title 一致 > pinned 一致 > index の近さ。
 * URL 完全一致は候補になるための前提条件であり、スコアには含めない。
 */
interface MatchScore {
  titleMatch: boolean;
  pinnedMatch: boolean;
  indexDistance: number;
}

/** 良いほうを負で返す比較関数。 */
function compareScore(a: MatchScore, b: MatchScore): number {
  if (a.titleMatch !== b.titleMatch) return a.titleMatch ? -1 : 1;
  if (a.pinnedMatch !== b.pinnedMatch) return a.pinnedMatch ? -1 : 1;
  return a.indexDistance - b.indexDistance;
}

function scoreOf(record: TabBinding, candidate: TabBinding): MatchScore {
  return {
    titleMatch: record.title === candidate.title,
    pinnedMatch: record.pinned === candidate.pinned,
    indexDistance: Math.abs(record.index - candidate.index),
  };
}

/**
 * セッション復元後、保持しているレコードを現在開いているタブに結び直す。
 *
 * 方針は「誤って結びつけるくらいなら結びつけない」。
 * 同じ URL のタブが複数あり、どれとも同程度に一致してしまう場合は
 * 未結合のまま残す。参照用に開いているタブと編集中のタブを取り違えると、
 * 「消えてもいいメモ」と「消してはいけないメモ」が入れ替わってしまうため。
 *
 * 純粋関数。chrome API には触れない。
 */
export function rematchRecords<T>(
  records: readonly TabBoundRecord<T>[],
  candidates: readonly RematchCandidate[]
): RematchOutcome {
  const matched = new Map<TabBoundRecordId, number>();
  const unmatched: TabBoundRecordId[] = [];

  // URL 完全一致を前提条件とするため、URL ごとに独立した問題として解ける。
  const candidatesByUrl = new Map<string, RematchCandidate[]>();
  for (const candidate of candidates) {
    const bucket = candidatesByUrl.get(candidate.binding.url);
    if (bucket) bucket.push(candidate);
    else candidatesByUrl.set(candidate.binding.url, [candidate]);
  }

  for (const [url, group] of groupRecordsByUrl(records)) {
    const pool = candidatesByUrl.get(url) ?? [];
    resolveGroup(group, pool, matched, unmatched);
  }

  return { matched, unmatched };
}

function groupRecordsByUrl<T>(
  records: readonly TabBoundRecord<T>[]
): Map<string, TabBoundRecord<T>[]> {
  const byUrl = new Map<string, TabBoundRecord<T>[]>();
  for (const record of records) {
    const bucket = byUrl.get(record.binding.url);
    if (bucket) bucket.push(record);
    else byUrl.set(record.binding.url, [record]);
  }
  return byUrl;
}

/**
 * 同一 URL のレコード群と候補タブ群を突き合わせる。
 *
 * 全ペアを良い順に並べ、まだ空いている組から確定させていく貪欲法。
 * 確定の直前に「同じスコアの別候補が残っていないか」を確認し、
 * 残っていればそのレコードは曖昧と判断して未結合にする。
 */
function resolveGroup<T>(
  records: readonly TabBoundRecord<T>[],
  candidates: readonly RematchCandidate[],
  matched: Map<TabBoundRecordId, number>,
  unmatched: TabBoundRecordId[]
): void {
  if (candidates.length === 0) {
    for (const record of records) unmatched.push(record.id);
    return;
  }

  const pairs = records.flatMap((record) =>
    candidates.map((candidate) => ({
      recordId: record.id,
      tabId: candidate.tabId,
      score: scoreOf(record.binding, candidate.binding),
    }))
  );
  pairs.sort((a, b) => compareScore(a.score, b.score));

  const usedTabs = new Set<number>();
  const decided = new Set<TabBoundRecordId>();

  for (const pair of pairs) {
    if (decided.has(pair.recordId) || usedTabs.has(pair.tabId)) continue;

    const ambiguous = pairs.some(
      (other) =>
        other.recordId === pair.recordId &&
        other.tabId !== pair.tabId &&
        !usedTabs.has(other.tabId) &&
        compareScore(other.score, pair.score) === 0
    );
    if (ambiguous) {
      decided.add(pair.recordId);
      unmatched.push(pair.recordId);
      continue;
    }

    decided.add(pair.recordId);
    usedTabs.add(pair.tabId);
    matched.set(pair.recordId, pair.tabId);
  }

  for (const record of records) {
    if (!decided.has(record.id)) unmatched.push(record.id);
  }
}
