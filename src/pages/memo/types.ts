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
  x: 24,
  y: 24,
  width: 280,
  height: 180,
  fontScale: 1,
  state: "normal",
};

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
