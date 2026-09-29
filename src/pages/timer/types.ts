/**
 * 発火したときの鳴らし方。
 *
 * `persistent` は、利用者が止めるまで鳴り続ける。席を外している間に
 * 通知が画面から消えてしまっても気付けるようにするための選択肢。
 */
export type TimerSound = "default" | "silent" | "persistent";

/** 発火済みのタイマーは、利用者が片付けるまで残る。 */
export type TimerStatus = "pending" | "fired";

export interface Timer {
  id: string;
  /** 空を許す。時間だけを入れて作った場合は空になる。 */
  title: string;
  startedAt: number;
  /** 期限 (epoch ms)。 */
  deadline: number;
  sound: TimerSound;
  status: TimerStatus;
  firedAt?: number;
}

/**
 * ページ上に出す箱の位置。タブにつき 1 つで足りるので、
 * タイマー 1 本ごとではなくタブ単位で持つ。
 */
export interface TimerOverlayLayout {
  x: number;
  y: number;
  /**
   * まだページ上で位置を決めていない印。
   *
   * 既定位置は「右上」だが、それはビューポートの寸法を見ないと px に
   * 落とせない。タイマーを作るのは background なので、実際の座標は
   * 初めて描くときにオーバーレイが確定させ、この印を外す。
   */
  awaitingPlacement?: boolean;
}

/** タブ 1 枚ぶんの保存単位。 */
export interface TabTimers {
  timers: Timer[];
  layout: TimerOverlayLayout;
}

/** まだ 1 本も仕掛けていないタブの保存単位。 */
export function emptyTabTimers(): TabTimers {
  return { timers: [], layout: { ...TIMER_DEFAULT_LAYOUT } };
}

/**
 * 保存されている 1 レコードを、保存の仕組みから切り離して表したもの。
 *
 * タイマーはタブが閉じられた後も期限を待つので、結びつきの有無と
 * 結びついていたタブの手がかりを、値と一緒に受け取れる形にしておく。
 */
export interface TimerRecord {
  recordId: string;
  /** どのタブにも結びついていなければ undefined。 */
  tabId?: number;
  tabTitle: string;
  url: string;
  value: TabTimers;
}

export const TIMER_DEFAULT_LAYOUT: TimerOverlayLayout = {
  // ビューポートを測れなかったときに使う予備の座標。通常は
  // `awaitingPlacement` が立っているので、描画時に上書きされる。
  x: 24,
  y: 24,
  awaitingPlacement: true,
};

/** 既定位置を決めるときに、ビューポートの端から空ける余白 (px)。 */
export const TIMER_DEFAULT_MARGIN = 24;

/** 一覧 UI が使う、タブと結びついた状態のタイマー。 */
export interface TimerEntry {
  /** どのタブにも結びついていなければ undefined。タブを閉じた後がこれにあたる。 */
  tabId?: number;
  /** 結びついていたタブの題名。一覧で「何のタイマーか」を補う。 */
  tabTitle: string;
  /** 結びついていたタブの URL。閉じられていた場合に開き直すのに使う。 */
  url: string;
  timer: Timer;
}

/** 発火したタイマーと、通知から戻る先。 */
export interface FiredTimer {
  timer: Timer;
  tabId?: number;
  tabTitle: string;
  url: string;
}
