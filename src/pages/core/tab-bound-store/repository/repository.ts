import type { TabBoundRecord, TabBoundRecordId } from "../domain/types.js";

/**
 * タブ紐づけ値の永続化を抽象化するリポジトリ。
 *
 * 寿命の異なる 2 種類を扱う。
 * - records ……… ブラウザ再起動をまたいで残すべき本体。
 * - assignments … tabId との結びつき。再起動で無意味になるので残してはいけない。
 *
 * この寿命の差がそのまま `chrome.storage.local` と `chrome.storage.session` の
 * 使い分けに対応する。
 */
export interface TabBoundRepository<T> {
  loadRecords(): Promise<TabBoundRecord<T>[]>;
  saveRecords(records: readonly TabBoundRecord<T>[]): Promise<void>;
  loadAssignments(): Promise<Map<number, TabBoundRecordId>>;
  saveAssignments(
    assignments: ReadonlyMap<number, TabBoundRecordId>
  ): Promise<void>;
}
