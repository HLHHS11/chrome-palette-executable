/**
 * 時・分・秒の入力欄と、画面に出す残り時間の文字列との相互変換。
 *
 * 入力欄は文字列しか持てず、一方でタイマーは期限 (epoch ms) しか持たない。
 * その差を吸収する変換をここにまとめ、副作用を持たせない。
 */

export interface DurationFields {
  hours: string;
  minutes: string;
  seconds: string;
}

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * 入力欄 3 つを継続時間 (ms) に変換する。
 *
 * 空欄は 0 として扱う。数字以外が混ざっている場合と、合計が 0 以下に
 * なる場合は `null` を返す。すなわち「作ってはいけない入力」をここで弾く。
 * 分や秒が 60 を超える入力は、そのまま足し合わせる (90 分 = 1 時間 30 分)。
 */
export function toDurationMs(fields: DurationFields): number | null {
  const parts = [
    { raw: fields.hours, unit: HOUR_MS },
    { raw: fields.minutes, unit: MINUTE_MS },
    { raw: fields.seconds, unit: SECOND_MS },
  ];

  let total = 0;
  for (const { raw, unit } of parts) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    if (!/^\d+$/.test(trimmed)) return null;
    total += Number(trimmed) * unit;
  }
  return total > 0 ? total : null;
}

/**
 * 残り時間を時計の形にする。1 時間未満なら `12:34`、超えたら `1:02:03`。
 *
 * 過ぎている場合は `0:00` に丸める。負の値をそのまま見せても意味がない。
 */
export function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / SECOND_MS));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number): string => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/**
 * 一覧に添えるための、秒を落とした表記。
 *
 * タブ一覧や整理画面では秒まで読む必要がなく、毎秒書き換わる数字は
 * かえって落ち着かない。
 */
export function formatRemainingRough(remainingMs: number): string {
  if (remainingMs <= 0) return "まもなく";
  const totalMinutes = Math.ceil(remainingMs / MINUTE_MS);
  if (totalMinutes < 60) return `約${totalMinutes}分後`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `約${hours}時間後` : `約${hours}時間${minutes}分後`;
}

/** 通知の本文に入れる、設定された長さの表記。 */
export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / SECOND_MS));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}時間`);
  if (minutes > 0) parts.push(`${minutes}分`);
  if (seconds > 0) parts.push(`${seconds}秒`);
  return parts.length > 0 ? parts.join("") : "0秒";
}
