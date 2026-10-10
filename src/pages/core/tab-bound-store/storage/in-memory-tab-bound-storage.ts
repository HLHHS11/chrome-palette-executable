import type { TabBoundRecord, TabBoundRecordId } from "../domain/types";
import type { TabBoundState, TabBoundStorage } from "./tab-bound-storage";

/** テスト用のインメモリ実装。上の層は永続層の差を意識しない。 */
export class InMemoryTabBoundStorage<T> implements TabBoundStorage<T> {
  private records: TabBoundRecord<T>[] = [];
  private assignments = new Map<number, TabBoundRecordId>();

  async ready(): Promise<void> {}

  read(): TabBoundState<T> {
    return {
      records: this.records.map((r) => ({ ...r, binding: { ...r.binding } })),
      assignments: new Map(this.assignments),
    };
  }

  write(state: TabBoundState<T>): void {
    this.records = state.records.map((r) => ({
      ...r,
      binding: { ...r.binding },
    }));
    this.assignments = new Map(state.assignments);
  }

  /** テストから直接覗くための補助。 */
  snapshot(): {
    records: readonly TabBoundRecord<T>[];
    assignments: ReadonlyMap<number, TabBoundRecordId>;
  } {
    return { records: this.records, assignments: this.assignments };
  }
}
