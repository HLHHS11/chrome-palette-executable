import type { TabBoundRecord, TabBoundRecordId } from "../domain/types";

/** 保存内容の全体。records と assignments は常に揃えて読み書きする。 */
export interface TabBoundState<T> {
  records: TabBoundRecord<T>[];
  assignments: Map<number, TabBoundRecordId>;
}

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
 * `read` と `write` が同期なのは、読んでから書き戻すまでの間に await を挟ませない
 * ため。挟むと、同時に来た別の操作 (ウィンドウを閉じたときの各タブの detach など)
 * が同じ内容を読み、後から書き戻した側が先の変更を消してしまう。
 */
export interface TabBoundStorage<T> {
  /** 保存済みの内容を読み終えるまで待つ。`read` と `write` はこれが済んでから呼ぶ。 */
  ready(): Promise<void>;
  /** 返した値を書き換えても保存内容には響かない。 */
  read(): TabBoundState<T>;
  write(state: TabBoundState<T>): void;
}
