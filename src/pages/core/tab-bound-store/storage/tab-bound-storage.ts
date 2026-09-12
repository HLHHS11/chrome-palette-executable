import type { TabBoundRecord, TabBoundRecordId } from "../domain/types";

/**
 * タブ紐づけ値の入出力を抽象化するゲートウェイ。
 *
 * リポジトリではない。リポジトリは関心事のリソース単位 (集約ルート単位) に
 * 作るものだが、こちらは「records と assignments を名前空間の下に読み書きする」
 * という保存機構そのものの抽象で、値の型 `T` に意味を持たない。
 * DB クライアントや ORM に近い位置づけで、機能ごとのリポジトリはこれを
 * DI で受け取って自分のリソースを組み立てる。
 *
 * 寿命の異なる 2 種類を扱う。
 * - records ……… ブラウザ再起動をまたいで残すべき本体。
 * - assignments … tabId との結びつき。再起動で無意味になるので残してはいけない。
 *
 * この寿命の差がそのまま `chrome.storage.local` と `chrome.storage.session` の
 * 使い分けに対応する。
 */
export interface TabBoundStorage<T> {
  loadRecords(): Promise<TabBoundRecord<T>[]>;
  saveRecords(records: readonly TabBoundRecord<T>[]): Promise<void>;
  loadAssignments(): Promise<Map<number, TabBoundRecordId>>;
  saveAssignments(
    assignments: ReadonlyMap<number, TabBoundRecordId>
  ): Promise<void>;
}
