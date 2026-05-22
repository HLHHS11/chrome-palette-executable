import type { RankingEntry } from "../domain/types";

/**
 * ランキングエントリの永続化を抽象化するリポジトリ。
 *
 * 実装の差し替え性とテスタビリティを目的としており、ドメイン層は
 * このインターフェースのみに依存する。
 */
export interface RankingRepository {
  load(): Promise<RankingEntry[]>;
  save(entries: readonly RankingEntry[]): Promise<void>;
  reset(): Promise<void>;
}
