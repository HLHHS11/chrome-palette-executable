/**
 * 検索結果のハイライト指示。
 *
 * 各フィールドに「マッチした文字レンジ `[startInclusive, endExclusive][]`」を持たせる。
 * UI はこのレンジ情報を基に `<b>` などでハイライト描画する。
 *
 * - `title` / `subtitle` / `url`: 表示対象の対応テキストへのレンジ。座標は元テキスト基準。
 * - `snippet`: 周辺テキストの抜粋本体と、その抜粋文字列内のマッチレンジ。
 *
 * いずれも省略可能。省略されたフィールドはハイライト無しでそのまま表示される。
 */
export type HighlightRanges = readonly [start: number, endExclusive: number][];

export type SnippetData = {
  /** スニペット本文（前後の "…" や空白畳みを含めた最終形）。 */
  text: string;
  /** `text` 内のマッチ位置レンジ。 */
  ranges: HighlightRanges;
};

export type HighlightSpec = {
  title?: HighlightRanges;
  subtitle?: HighlightRanges;
  url?: HighlightRanges;
  snippet?: SnippetData;
};

/**
 * 検索結果 1 件。
 *
 * `item` には検索の入力候補そのものが入る。何が入るかは Searcher の実装ごとに違う
 * (パレットコマンド検索なら Command、タブ横断検索なら TabSnapshot、など)。
 * `highlights` が描画に必要なハイライト指示。`score` は降順ソート用。
 */
export type SearchHit<T> = {
  item: T;
  score: number;
  highlights?: HighlightSpec;
};

/**
 * 検索エンジンの抽象。
 *
 * 入力クエリと候補配列から、関連度順の `SearchHit[]` を返す純粋関数として実装される
 * （副作用やブラウザ依存は呼び出し側で集約し、Searcher 本体は疎結合に保つ）。
 *
 * 候補の型 `T` は実装ごとに異なる。Command に縛られない抽象として扱うこと。
 */
export interface Searcher<T> {
  run(query: string, candidates: readonly T[]): SearchHit<T>[];
}
