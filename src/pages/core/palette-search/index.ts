import type { Command } from "@core/command";
import type { RankingService } from "@core/ranking";
import type {
  HighlightRanges,
  HighlightSpec,
  SearchHit,
  Searcher,
} from "@core/search";
import fuzzysort from "fuzzysort";

/**
 * fuzzysort.go の `keys` 配列。index と意味の対応は固定:
 * - 0: title
 * - 1: subtitle
 * - 2: url
 */
const FUZZY_KEYS = ["title", "subtitle", "url"] as const;

/**
 * 連続するインデックス配列 (例: `[1,2,3,7,8]`) を半開区間 (`[[1,4],[7,9]]`) に畳む。
 * fuzzysort の `indexes` フィールドは「マッチした各文字位置」なので、
 * 連続する箇所はひと続きのハイライトとして扱いたい。
 */
function indexesToRanges(
  indexes: ReadonlyArray<number>
): HighlightRanges | undefined {
  if (indexes.length === 0) return undefined;
  const out: [number, number][] = [];
  let start = indexes[0];
  let prev = indexes[0];
  for (let i = 1; i < indexes.length; i++) {
    const cur = indexes[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    out.push([start, prev + 1]);
    start = cur;
    prev = cur;
  }
  out.push([start, prev + 1]);
  return out;
}

export type PaletteSearcherOptions = {
  /** 履歴ブーストを加える場合に渡す。未指定なら fuzzysort 生スコアのみで並べる。 */
  rankingService?: RankingService;
  /** 結果上限。InfiniteScroll 1 ページ分の件数に対応させる想定。 */
  limit: number;
};

/**
 * コマンドパレットのデフォルト検索エンジン。
 *
 * fuzzysort で `title` / `subtitle` / `url` を曖昧マッチし、`rankingService` が
 * 与えられていれば実行履歴に基づくブーストを加算して並べ替える。返り値は
 * `SearchHit<Command>[]` に詰め替え、各ヒットは `HighlightSpec` を伴う。
 *
 * core エンジンであり、特定のユースケース (tab-search など) には依存しない。
 */
export class PaletteSearcher implements Searcher<Command> {
  constructor(private readonly options: PaletteSearcherOptions) {}

  run(query: string, candidates: readonly Command[]): SearchHit<Command>[] {
    const rawMatches = fuzzysort.go(query, candidates, {
      threshold: -10000,
      limit: this.options.limit,
      all: true,
      keys: FUZZY_KEYS,
    });

    const service = this.options.rankingService;
    const orderedMatches = service
      ? service.applyBoost(rawMatches, query, {
          getCommandId: (m) => m.obj.title,
          getRawScore: (m) => m.score,
        })
      : [...rawMatches];

    return orderedMatches.map((match): SearchHit<Command> => {
      const titleResult = match[0];
      const subtitleResult = match[1];
      const urlResult = match[2];
      const highlights: HighlightSpec = {
        title: indexesToRanges(titleResult?.indexes ?? []),
        subtitle: indexesToRanges(subtitleResult?.indexes ?? []),
        url: indexesToRanges(urlResult?.indexes ?? []),
      };
      return {
        item: { ...match.obj, highlights },
        score: match.score,
        highlights,
      };
    });
  }
}
