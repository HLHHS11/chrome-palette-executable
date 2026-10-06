/**
 * メモの色。一覧のハイライトと付箋本体で共有する。
 *
 * パステル調で、現行の黄色付箋を基準に 5 色。quick 入力ではこの英名をそのまま使う。
 */
export type MemoColor = "yellow" | "red" | "green" | "blue" | "purple";

export const MEMO_DEFAULT_COLOR: MemoColor = "yellow";

export const MEMO_COLORS: readonly MemoColor[] = [
  "yellow",
  "red",
  "green",
  "blue",
  "purple",
];

export const MEMO_COLOR_LABELS: Record<MemoColor, string> = {
  yellow: "Yellow",
  red: "Red",
  green: "Green",
  blue: "Blue",
  purple: "Purple",
};

/** ページ上の付箋に塗る色。付箋は常に明るいパステルで見せる。 */
export type MemoOverlayPalette = {
  background: string;
  border: string;
  text: string;
  headerBackground: string;
  headerBorder: string;
  actionColor: string;
};

/**
 * 付箋本体の塗り。一覧側の CSS 変数とは別に持つ。
 * Shadow DOM 内ではテーマ変数が届かないので、ここで完結させる。
 */
export const MEMO_OVERLAY_PALETTE: Record<MemoColor, MemoOverlayPalette> = {
  yellow: {
    background: "#fffbe6",
    border: "#d9c88a",
    text: "#303030",
    headerBackground: "#f5e9b8",
    headerBorder: "#e0d195",
    actionColor: "#5a4a12",
  },
  red: {
    background: "#fff1f0",
    border: "#e8b4b0",
    text: "#303030",
    headerBackground: "#f5d4d0",
    headerBorder: "#e0b8b4",
    actionColor: "#5a2a28",
  },
  green: {
    background: "#f0fff4",
    border: "#b0d9b8",
    text: "#303030",
    headerBackground: "#d0ebd4",
    headerBorder: "#b8d9bc",
    actionColor: "#285a32",
  },
  blue: {
    background: "#f0f7ff",
    border: "#b0c8e8",
    text: "#303030",
    headerBackground: "#d0e0f5",
    headerBorder: "#b8cce0",
    actionColor: "#28486a",
  },
  purple: {
    background: "#f9f0ff",
    border: "#d0b8e0",
    text: "#303030",
    headerBackground: "#e8d4f0",
    headerBorder: "#d4c0e0",
    actionColor: "#4a286a",
  },
};

export function isMemoColor(value: unknown): value is MemoColor {
  return (
    value === "yellow" ||
    value === "red" ||
    value === "green" ||
    value === "blue" ||
    value === "purple"
  );
}

/** 古い保存データや不正値は既定色に落とす。 */
export function normalizeMemoColor(value: unknown): MemoColor {
  return isMemoColor(value) ? value : MEMO_DEFAULT_COLOR;
}

/**
 * quick 入力用。前後の空白を除き、小文字化した名前だけを認める。
 * 空や未知の名前は null。
 */
export function parseMemoColor(input: string): MemoColor | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  return isMemoColor(trimmed) ? trimmed : null;
}
