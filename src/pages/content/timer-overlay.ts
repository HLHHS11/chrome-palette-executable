import { bindDrag, clampToViewport } from "@core/page-overlay";
import {
  type RpcResponse,
  type RpcVoidResponseBody,
  createRuntimeRpcClient,
} from "@core/rpc";
import { TIMER_DEFAULT_MARGIN, formatRemaining } from "@pages/timer";
import type { TabTimers, Timer } from "@pages/timer";

import type { backgroundRoutes } from "../background/routes";

// ---------------------------------------------------------------------------
// このタブに仕掛けられたタイマーを、ページ上に表示するオーバーレイ。
//
// 設計上の制約:
// - 鳴り終えたタイマーは、利用者が片付けるまで消えない。OS の通知は数秒で
//   画面から消えることがあり、消えない通知の役割をこちらが担うため。
// - 残り時間は「期限 - 現在時刻」で毎回計算する。裏に回ったタブでは Chrome が
//   タイマーを間引くので、経過を自前で数えると時刻がずれる。
// - 大きさは中身に合わせる。調整は受け付けない。タイトルは省略せず折り返す。
// - ページの CSS に汚されない / ページを汚さないように Shadow DOM に閉じ込める。
// ---------------------------------------------------------------------------

const callRuntimeRpc = createRuntimeRpcClient<typeof backgroundRoutes>();

const HOST_ID = "chrome-palette-timer";
/** 残り時間を描き直す間隔。秒の変わり目に遅れて見えない程度に細かく刻む。 */
const TICK_MS = 500;
const LAYOUT_PERSIST_DEBOUNCE_MS = 400;

interface OverlayHandle {
  render(value: TabTimers): void;
}

let handle: OverlayHandle | null = null;

/** content script の初期化時に呼ぶ。タイマーが無ければ何も描画しない。 */
export async function initTimerOverlay(): Promise<void> {
  const value = await fetchTimers();
  if (value && value.timers.length > 0) ensureHandle().render(value);
}

/** パレットや background からの変更を、このタブの表示に反映する。 */
export function refreshTimerOverlay(): RpcResponse<RpcVoidResponseBody> {
  void fetchTimers()
    .then((value) => {
      if (value) ensureHandle().render(value);
    })
    .catch(() => undefined);
  return { ok: true, data: {} };
}

async function fetchTimers(): Promise<TabTimers | null> {
  const res = await callRuntimeRpc({ name: "timer.listForTab" }).catch(
    () => null
  );
  if (!res || !("ok" in res) || !res.ok || !("data" in res)) return null;
  return res.data;
}

function ensureHandle(): OverlayHandle {
  if (!handle) handle = createOverlay();
  return handle;
}

function createOverlay(): OverlayHandle {
  const host = document.createElement("div");
  host.id = HOST_ID;
  // ページのレイアウトに一切干渉しないよう、固定配置かつ文書フローの外に出す。
  host.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:2147483646;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.appendChild(buildStyle());

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.setAttribute("role", "status");

  const header = document.createElement("div");
  header.className = "header";
  header.textContent = "タイマー";

  const list = document.createElement("div");
  list.className = "list";
  panel.append(header, list);
  shadow.appendChild(panel);
  document.documentElement.appendChild(host);

  let current: TabTimers = { timers: [], layout: { x: 0, y: 0 } };
  let layoutTimer: number | null = null;
  /** 期限到達を background へ知らせたタイマー。同じ申告を繰り返さない。 */
  const reportedTimerIds = new Set<string>();
  const remainingElByTimerId = new Map<string, HTMLElement>();

  const persistLayout = (): void => {
    const layout = current.layout;
    if (layoutTimer !== null) clearTimeout(layoutTimer);
    layoutTimer = window.setTimeout(() => {
      layoutTimer = null;
      void callRuntimeRpc({ name: "timer.moveOverlay", layout }).catch(
        () => undefined
      );
    }, LAYOUT_PERSIST_DEBOUNCE_MS);
  };

  const place = (): void => {
    const { x, y } = clampToViewport(
      current.layout.x,
      current.layout.y,
      panel.offsetWidth,
      panel.offsetHeight
    );
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
  };

  /**
   * 既定位置はビューポートを見ないと決まらないので、初めて描くここで確定させる。
   * 右上に置くのは、付箋の既定位置 (右の中ほど) と重ねないため。
   */
  const resolvePlacement = (): void => {
    if (!current.layout.awaitingPlacement) return;
    const { x, y } = clampToViewport(
      window.innerWidth - panel.offsetWidth - TIMER_DEFAULT_MARGIN,
      TIMER_DEFAULT_MARGIN,
      panel.offsetWidth,
      panel.offsetHeight
    );
    current = {
      ...current,
      layout: { x: Math.round(x), y: Math.round(y), awaitingPlacement: false },
    };
    persistLayout();
  };

  const removeTimer = (timerId: string): void => {
    void callRuntimeRpc({ name: "timer.remove", timerId })
      .then(() => fetchTimers())
      .then((value) => {
        if (value) render(value);
      })
      .catch(() => undefined);
  };

  const buildRow = (timer: Timer): HTMLElement => {
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.status = timer.status;

    const remaining = document.createElement("span");
    remaining.className = "remaining";
    remainingElByTimerId.set(timer.id, remaining);

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = timer.title;

    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "×";
    dismiss.title = timer.status === "fired" ? "片付ける" : "止める";
    dismiss.addEventListener("click", () => removeTimer(timer.id));

    row.append(remaining, title, dismiss);
    return row;
  };

  /** 残り時間の描き直し。0 に達したら background に知らせて発火を促す。 */
  const tick = (): void => {
    const now = Date.now();
    let shouldReport = false;
    for (const timer of current.timers) {
      const element = remainingElByTimerId.get(timer.id);
      if (!element) continue;
      if (timer.status === "fired") {
        element.textContent = "終了";
        continue;
      }
      const remaining = timer.deadline - now;
      element.textContent = formatRemaining(remaining);
      if (remaining > 0 || reportedTimerIds.has(timer.id)) continue;
      reportedTimerIds.add(timer.id);
      shouldReport = true;
    }
    if (shouldReport) {
      void callRuntimeRpc({ name: "timer.reportDue" }).catch(() => undefined);
    }
  };

  const render = (value: TabTimers): void => {
    current = value;
    remainingElByTimerId.clear();
    list.replaceChildren(...value.timers.map(buildRow));
    panel.style.display = value.timers.length > 0 ? "block" : "none";
    panel.classList.toggle(
      "ringing",
      value.timers.some((timer) => timer.status === "fired")
    );
    tick();
    resolvePlacement();
    place();
  };

  bindDrag(
    header,
    panel,
    () =>
      clampToViewport(
        current.layout.x,
        current.layout.y,
        panel.offsetWidth,
        panel.offsetHeight
      ),
    (x, y) => {
      current = { ...current, layout: { x, y } };
      place();
      persistLayout();
    }
  );

  setInterval(tick, TICK_MS);
  // 裏に回っている間は描き直しが間引かれる。戻ってきた瞬間に追いつかせる。
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tick();
  });
  window.addEventListener("resize", place);

  return { render };
}

function buildStyle(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .panel {
      position: absolute;
      display: block;
      box-sizing: border-box;
      width: max-content;
      /* 長いタイトルでもページの読み取りを塞がない範囲で折り返す。 */
      max-width: 280px;
      pointer-events: auto;
      font-family: system-ui, -apple-system, "Hiragino Sans", sans-serif;
      background: #eef4ff;
      color: #1f2d3d;
      border: 1px solid #a8c0e8;
      border-radius: 8px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
      overflow: hidden;
    }
    /* 鳴り終えたタイマーを抱えている間は、遠目にも分かるようにする。 */
    .panel.ringing { border-color: #d98b26; background: #fff4e2; }
    .header {
      padding: 4px 8px;
      font-size: 11px;
      line-height: 1.4;
      background: #d9e5fa;
      border-bottom: 1px solid #bed0ec;
      cursor: move;
      user-select: none;
    }
    .panel.ringing .header { background: #fbe3bd; border-bottom-color: #ebcb95; }
    .list { display: flex; flex-direction: column; }
    .row {
      display: flex;
      align-items: baseline;
      gap: 6px;
      padding: 5px 8px;
    }
    .row + .row { border-top: 1px solid rgba(0, 0, 0, 0.08); }
    .remaining {
      font-variant-numeric: tabular-nums;
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
    }
    .row[data-status="fired"] .remaining { color: #b4690e; }
    .title {
      flex: 1 1 auto;
      font-size: 12px;
      line-height: 1.4;
      overflow-wrap: anywhere;
    }
    .row button {
      all: unset;
      cursor: pointer;
      flex: 0 0 auto;
      font-size: 12px;
      line-height: 1;
      padding: 3px 5px;
      border-radius: 4px;
      color: #4a5a72;
    }
    .row button:hover { background: rgba(0, 0, 0, 0.08); }
  `;
  return style;
}
