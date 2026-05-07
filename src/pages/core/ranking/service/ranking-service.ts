import { CommandRanking } from "../domain/ranking";
import type { RankingRepository } from "../repository/repository";

/**
 * `applyBoost` がスコアと commandId を取り出すためのアクセサ。
 *
 * `fuzzysort.KeysResult<Command>` のような外部の型に直接依存させないため
 * accessor を引数で受ける形にしている。
 */
export type BoostAccessor<T> = {
  getCommandId: (item: T) => string;
  getRawScore: (item: T) => number;
};

/**
 * popup などから利用するファサード。
 *
 * - 起動時に `create()` で永続化済みのランキングを読み込む
 * - fuzzysort の結果を `applyBoost` で並び替える
 * - コマンド実行時に `record` で履歴を更新し永続化する
 */
export class RankingService {
  private constructor(
    private readonly ranking: CommandRanking,
    private readonly repository: RankingRepository
  ) {}

  static async create(repository: RankingRepository): Promise<RankingService> {
    const entries = await repository.load();
    return new RankingService(new CommandRanking(entries), repository);
  }

  /**
   * fuzzysort の結果に対し、各要素のスコアにブーストを加算した順で並べ替える。
   * 元の配列は破壊しない。
   */
  applyBoost<T>(
    matches: readonly T[],
    rawQuery: string,
    accessor: BoostAccessor<T>
  ): T[] {
    const boosted = matches.map((item, index) => ({
      item,
      index,
      finalScore:
        accessor.getRawScore(item) +
        this.ranking.boost(accessor.getCommandId(item), rawQuery),
    }));
    boosted.sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      // スコア同値時は元順序を保持 (stable sort 相当)
      return a.index - b.index;
    });
    return boosted.map((b) => b.item);
  }

  /**
   * コマンドの実行を記録する。ドメインを更新したのち永続化する。
   * 呼び出し側が結果を待たない場合 (popup閉鎖前など) はそのまま fire-and-forget で利用可。
   */
  async record(commandId: string, rawQuery: string): Promise<void> {
    this.ranking.record(commandId, rawQuery, Date.now());
    await this.repository.save(this.ranking.snapshot());
  }

  async reset(): Promise<void> {
    this.ranking.clear();
    await this.repository.reset();
  }
}
