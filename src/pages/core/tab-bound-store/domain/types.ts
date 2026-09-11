/**
 * タブに値を紐づけるための汎用ドメイン型。
 *
 * tabId はブラウザセッションを越えて安定しないため、値の同一性は tabId ではなく
 * 不変の `TabBoundRecordId` が担う。tabId との結びつきは実行中のみ有効な
 * 「割り当て」として別に持つ。これは Chromium 自身が saved tab groups で
 * 採っている構造（不変 GUID を真実の源とし、ローカル ID は nullable な結びつき）
 * と同じ考え方。
 */
export type TabBoundRecordId = string;

/**
 * セッション復元後にレコードとタブを再結合するための手がかり。
 *
 * tabId・windowId・groupId はいずれも再起動で変わるため、ここには含めない。
 * 特に groupId は `session_restore.cc` が復元時に新しいトークンを採番するため、
 * 識別子として保存しても必ず不一致になる。
 */
export interface TabBinding {
  url: string;
  title: string;
  /** ウィンドウ内での 0 始まりの位置。同一 URL のタブを区別する主要な手がかり。 */
  index: number;
  pinned: boolean;
}

export interface TabBoundRecord<T> {
  id: TabBoundRecordId;
  value: T;
  /** 最後に観測したタブの状態。再結合時の照合に使う。 */
  binding: TabBinding;
  updatedAt: number;
}

/** 再結合の対象となる、現在開いているタブ。 */
export interface RematchCandidate {
  tabId: number;
  binding: TabBinding;
}

export interface RematchOutcome {
  /** recordId → tabId。確信を持って結びつけられたもののみ。 */
  matched: ReadonlyMap<TabBoundRecordId, number>;
  /**
   * 結びつけられなかったレコード。候補が無い場合と、候補が複数あって
   * 決めきれなかった場合の両方を含む。破棄せず孤児として保持する。
   */
  unmatched: readonly TabBoundRecordId[];
}
