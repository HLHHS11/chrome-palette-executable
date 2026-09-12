import type { TabBoundRecord, TabBoundRecordId } from "../domain/types";
import type { TabBoundStorage } from "./tab-bound-storage";

/** テスト用のインメモリ実装。上の層は永続層の差を意識しない。 */
export class InMemoryTabBoundStorage<T> implements TabBoundStorage<T> {
  private records: TabBoundRecord<T>[] = [];
  private assignments = new Map<number, TabBoundRecordId>();

  async loadRecords(): Promise<TabBoundRecord<T>[]> {
    return this.records.map((r) => ({ ...r, binding: { ...r.binding } }));
  }

  async saveRecords(records: readonly TabBoundRecord<T>[]): Promise<void> {
    this.records = records.map((r) => ({ ...r, binding: { ...r.binding } }));
  }

  async loadAssignments(): Promise<Map<number, TabBoundRecordId>> {
    return new Map(this.assignments);
  }

  async saveAssignments(
    assignments: ReadonlyMap<number, TabBoundRecordId>
  ): Promise<void> {
    this.assignments = new Map(assignments);
  }

  /** テストから直接覗くための補助。 */
  snapshot(): {
    records: readonly TabBoundRecord<T>[];
    assignments: ReadonlyMap<number, TabBoundRecordId>;
  } {
    return { records: this.records, assignments: this.assignments };
  }
}
