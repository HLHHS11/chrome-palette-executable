/**
 * メモの表示状態。
 *
 * 「最小化」を完全非表示にしてはいけない。そうすると
 * 「最小化されているからメモが見えない」のか
 * 「そもそもメモが無い」のかを画面から区別できなくなるため、
 * 最小化状態でも存在を示す小さなつまみを残す。
 */
export type MemoDisplayState = "minimized" | "normal";

export interface MemoLayout {
  /** ビューポート左上からの位置 (px)。 */
  x: number;
  y: number;
  /** `normal` 状態での寸法 (px)。ユーザーがリサイズすると更新される。 */
  width: number;
  height: number;
  fontScale: number;
  state: MemoDisplayState;
  /**
   * まだページ上で位置を決めていない印。
   *
   * 既定位置は「右寄り・高さは中央」だが、それはビューポートの寸法を
   * 見ないと px に落とせない。メモを作るのは background なので、
   * 実際の座標はメモを初めて描くときにオーバーレイが確定させ、この印を外す。
   *
   * 省略されている場合は「既に置かれている」とみなす。この印が無かった頃の
   * データには実座標が入っており、ユーザーが動かした位置かもしれないため、
   * 勝手に置き直してはいけない。
   */
  awaitingPlacement?: boolean;
}

export interface Memo {
  text: string;
  layout: MemoLayout;
}

/**
 * ページはよくリロードされる。位置や寸法を保存しないと
 * 動かしたメモが毎回元に戻ってしまい、移動機能自体が使いものにならない。
 * レイアウトはメモ本体と同じレコードに載せるので、保存コストは実質ゼロ。
 */
export const MEMO_DEFAULT_LAYOUT: MemoLayout = {
  // ビューポートを測れなかったときに使う予備の座標。通常は
  // `awaitingPlacement` が立っているので、描画時に上書きされる。
  x: 24,
  y: 24,
  width: 280,
  height: 180,
  fontScale: 1,
  state: "normal",
  awaitingPlacement: true,
};

/** 既定位置を決めるときに、ビューポートの右端から空ける余白 (px)。 */
export const MEMO_DEFAULT_RIGHT_MARGIN = 24;

export const MEMO_FONT_SCALE = {
  min: 0.8,
  max: 2,
  step: 0.1,
} as const;

/** 一覧 UI や検索に渡すための、タブと結びついた状態のメモ。 */
export interface MemoSummary {
  tabId: number;
  text: string;
}

/** どのタブにも結びついていないメモ。セッション復元で行き場を失ったもの。 */
export interface OrphanMemo {
  recordId: string;
  text: string;
  url: string;
  title: string;
  updatedAt: number;
}
