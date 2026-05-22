import type {
  HighlightRanges,
  SearchHit,
  Searcher,
  SnippetData,
} from "@core/search";

import type { TabSnapshot } from "./types";

/**
 * スコアリング重み。本文中心 + URL パスは薄く残す方針。
 * 値は plan-cross-tab-search.md と同期させること。
 */
const W_BODY = 0.7;
const W_BODY_FREQ = 0.05;
const W_TITLE = 0.25;
const W_PATH = 0.1;
const W_HOST = 0.05;
/** 本文ヒット 0 のタブに掛けるペナルティ係数。 */
const BODY_ZERO_PENALTY = 0.5;
/** 単語境界が両側 / 片側 / なしの場合の品質係数。 */
const BOUNDARY_FULL = 1.0;
const BOUNDARY_PARTIAL = 0.55;
/** 単語の途中に食い込む部分一致。ヒットは残すが順位は下げる。 */
const BOUNDARY_NONE = 0.12;
/**
 * 単語としての一致 (両側境界) に上乗せするボーナス。
 * 品質係数だけでは埋め込み一致との差が小さくなりすぎるため、明示的に加点する。
 */
const BONUS_WORD_BODY = 0.6;
const BONUS_WORD_TITLE = 0.45;
const BONUS_WORD_PATH = 0.25;
const BONUS_WORD_HOST = 0.15;
/** 空白で区切られないクエリ (CJK 等) は indexOf ヒットを「語」相当として扱う下限。 */
const NON_LATIN_TERM_QUALITY_FLOOR = 0.85;

/** スニペットの前後文字数。 */
const SNIPPET_BEFORE = 40;
const SNIPPET_AFTER = 60;

/**
 * 単語境界かどうか (前/後の隣接文字が空白/区切り/端なら境界)。
 *
 * 真の Unicode 単語境界判定は重い & 表記揺れが多いので、ここでは
 * 「空白か、文字列端か、英数字でない一般的な区切り記号か」だけを境界とみなす。
 */
function isBoundaryChar(ch: string | undefined): boolean {
  if (ch === undefined) return true;
  return /[\s.,;:!?()[\]{}<>"'/\\|`~@#$%^&*\-_=+]/.test(ch);
}

/**
 * `text` 内で `needle` の全ヒット位置を返す。`text` / `needle` ともに小文字化済み想定。
 */
function findAllPositions(text: string, needle: string): number[] {
  if (needle.length === 0 || text.length === 0) return [];
  const out: number[] = [];
  let from = 0;
  for (;;) {
    const pos = text.indexOf(needle, from);
    if (pos === -1) break;
    out.push(pos);
    from = pos + needle.length;
  }
  return out;
}

/**
 * 与えられたヒット位置群について、最良の境界品質を返す。ヒットがなければ 0。
 */
function bestBoundaryQuality(
  text: string,
  needleLen: number,
  positions: readonly number[]
): number {
  let best = 0;
  for (const pos of positions) {
    const prev = pos > 0 ? text[pos - 1] : undefined;
    const next =
      pos + needleLen < text.length ? text[pos + needleLen] : undefined;
    const left = isBoundaryChar(prev);
    const right = isBoundaryChar(next);
    const q =
      left && right
        ? BOUNDARY_FULL
        : left || right
          ? BOUNDARY_PARTIAL
          : BOUNDARY_NONE;
    if (q > best) best = q;
    if (best === BOUNDARY_FULL) break;
  }
  return best;
}

/**
 * フィールド内でのトークン一致の「効く品質」。
 * 英数字トークンは境界判定をそのまま使い、CJK 等は語境界が曖昧なので
 * 部分一致でもある程度高く扱う (ユーザーが打った文字列そのものの出現を優先)。
 */
function effectiveMatchQuality(
  text: string,
  term: string,
  positions: readonly number[]
): number {
  if (positions.length === 0) return 0;
  const boundary = bestBoundaryQuality(text, term.length, positions);
  if (boundary >= BOUNDARY_PARTIAL) return boundary;
  if (!/[a-z0-9]/i.test(term)) {
    return Math.max(boundary, NON_LATIN_TERM_QUALITY_FLOOR);
  }
  return boundary;
}

/**
 * `text` の `hitPos` 周辺を切り出してスニペットを作る。
 *
 * - 前 SNIPPET_BEFORE 字 / 後 SNIPPET_AFTER 字を基準に開始/終了位置を決め、
 *   空白位置で開始端を縮め、空白位置で終了端を伸ばして単語頭/単語末まで取る。
 * - スニペット文字列内での全タームのマッチ位置を `ranges` として返す。
 */
function buildSnippet(
  text: string,
  textLower: string,
  hitPos: number,
  termsLower: readonly string[]
): SnippetData {
  let start = Math.max(0, hitPos - SNIPPET_BEFORE);
  let end = Math.min(text.length, hitPos + SNIPPET_AFTER);

  if (start > 0) {
    const spaceAfter = text.indexOf(" ", start);
    if (spaceAfter !== -1 && spaceAfter < hitPos) start = spaceAfter + 1;
  }
  if (end < text.length) {
    const spaceBefore = text.lastIndexOf(" ", end);
    if (spaceBefore !== -1 && spaceBefore > hitPos) end = spaceBefore;
  }

  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  const body = text.slice(start, end).replace(/\s+/g, " ");
  const snippetText = `${prefix}${body}${suffix}`;

  const snippetLower = snippetText.toLowerCase();
  const ranges: [number, number][] = [];
  for (const term of termsLower) {
    if (term.length === 0) continue;
    let from = 0;
    for (;;) {
      const pos = snippetLower.indexOf(term, from);
      if (pos === -1) break;
      ranges.push([pos, pos + term.length]);
      from = pos + term.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  return { text: snippetText, ranges };
}

/**
 * `text` 全体に対する `termsLower` の全マッチ位置→レンジ配列。
 * Entry の title / subtitle ハイライト用。
 */
function rangesForAllTerms(
  text: string,
  termsLower: readonly string[]
): HighlightRanges | undefined {
  if (text.length === 0) return undefined;
  const lower = text.toLowerCase();
  const out: [number, number][] = [];
  for (const term of termsLower) {
    if (term.length === 0) continue;
    let from = 0;
    for (;;) {
      const pos = lower.indexOf(term, from);
      if (pos === -1) break;
      out.push([pos, pos + term.length]);
      from = pos + term.length;
    }
  }
  if (out.length === 0) return undefined;
  out.sort((a, b) => a[0] - b[0]);
  return out;
}

/**
 * クエリ文字列をスペース区切りトークンに分解し、全て小文字化。空トークン除外。
 */
function tokenize(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((s) => s.length > 0);
}

/**
 * タブ横断検索の Searcher 実装。
 *
 * - 入力クエリをスペース区切り AND マルチターム解釈
 * - 各タームについて body / title / path / host にヒットしたか + 単語境界品質を見る
 * - 単語としての一致 (両側境界) にはボーナスを上乗せし、途中一致は大幅に減点
 * - 全タームが何かしらに最低1回ヒットしたタブのみ採用
 * - 本文ヒット0のタブにはペナルティ
 * - スニペットは body の最初のヒット位置から切り出す
 */
export const tabContentSearcher: Searcher<TabSnapshot> = {
  run(query, candidates) {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];

    const hits: SearchHit<TabSnapshot>[] = [];

    for (const snap of candidates) {
      const titleLower = snap.title.toLowerCase();
      const textLower = snap.text.toLowerCase();
      const pathLower = snap.path.toLowerCase();
      const hostLower = snap.host.toLowerCase();

      let totalScore = 0;
      let totalBodyHits = 0;
      let firstBodyHitPos: number | null = null;
      let allTermsHitSomewhere = true;

      for (const term of tokens) {
        const bodyPositions = findAllPositions(textLower, term);
        const titlePositions = findAllPositions(titleLower, term);
        const pathPositions = findAllPositions(pathLower, term);
        const hostPositions = findAllPositions(hostLower, term);

        if (
          bodyPositions.length === 0 &&
          titlePositions.length === 0 &&
          pathPositions.length === 0 &&
          hostPositions.length === 0
        ) {
          allTermsHitSomewhere = false;
          break;
        }

        const bodyQuality = effectiveMatchQuality(
          textLower,
          term,
          bodyPositions
        );
        const titleQuality = effectiveMatchQuality(
          titleLower,
          term,
          titlePositions
        );
        const pathQuality = effectiveMatchQuality(
          pathLower,
          term,
          pathPositions
        );
        const hostQuality = effectiveMatchQuality(
          hostLower,
          term,
          hostPositions
        );

        const termScore =
          W_BODY * bodyQuality +
          (bodyQuality >= BOUNDARY_FULL ? BONUS_WORD_BODY : 0) +
          W_BODY_FREQ * Math.log(1 + bodyPositions.length) +
          W_TITLE * titleQuality +
          (titleQuality >= BOUNDARY_FULL ? BONUS_WORD_TITLE : 0) +
          W_PATH * pathQuality +
          (pathQuality >= BOUNDARY_FULL ? BONUS_WORD_PATH : 0) +
          W_HOST * hostQuality +
          (hostQuality >= BOUNDARY_FULL ? BONUS_WORD_HOST : 0);

        totalScore += termScore;
        totalBodyHits += bodyPositions.length;
        if (firstBodyHitPos === null && bodyPositions.length > 0) {
          firstBodyHitPos = bodyPositions[0];
        }
      }

      if (!allTermsHitSomewhere) continue;

      let score = totalScore / tokens.length;
      if (totalBodyHits === 0) score *= BODY_ZERO_PENALTY;

      const snippet =
        firstBodyHitPos !== null
          ? buildSnippet(snap.text, textLower, firstBodyHitPos, tokens)
          : undefined;

      hits.push({
        item: snap,
        score,
        highlights: {
          title: rangesForAllTerms(snap.title, tokens),
          subtitle: rangesForAllTerms(snap.path, tokens),
          snippet,
        },
      });
    }

    hits.sort((a, b) => b.score - a.score);
    return hits;
  },
};
