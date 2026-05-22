import type { RankingEntry } from "../domain/types";
import type { RankingRepository } from "./repository";

/**
 * テストや一時的なフォールバック用のインメモリ実装。
 * `RankingService` は永続層の差異を意識しないため、ここで挙動を観察できる。
 */
export class InMemoryRankingRepository implements RankingRepository {
  private entries: RankingEntry[] = [];

  async load(): Promise<RankingEntry[]> {
    return this.entries.map((e) => ({ ...e }));
  }

  async save(entries: readonly RankingEntry[]): Promise<void> {
    this.entries = entries.map((e) => ({ ...e }));
  }

  async reset(): Promise<void> {
    this.entries = [];
  }
}
