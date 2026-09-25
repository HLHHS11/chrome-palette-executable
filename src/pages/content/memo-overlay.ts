import {
  type RpcResponse,
  type RpcVoidResponseBody,
  createRuntimeRpcClient,
} from "@core/rpc";
import {
  MEMO_DEFAULT_LAYOUT,
  MEMO_DEFAULT_RIGHT_MARGIN,
  MEMO_FONT_SCALE,
} from "@pages/memo";
import type { Memo, MemoDisplayState } from "@pages/memo";

import { backgroundRoutes } from "../background/routes";

// ---------------------------------------------------------------------------
// タブに紐づくメモをページ上に表示するオーバーレイ。
//
// 設計上の制約:
// - ページ側に「メモを追加」ボタンは出さない。追加の入口はコマンドパレットだけ。
//   したがってメモが存在しないタブでは、この UI は一切描画しない。
// - 最小化は「完全に隠すこと」ではない。隠してしまうと、メモが無いのか
//   最小化されているのかを画面から区別できなくなるため、つまみだけは残す。
// - 保存された位置は動かさない。ウィンドウが狭まって画面外に出そうなときは
//   表示だけを画面内に寄せる。一時的にウィンドウを縮めただけで位置が
//   恒久的に書き換わってしまうのは、保持されている感覚を壊す。
// - ページの CSS に汚されない / ページを汚さないように Shadow DOM に閉じ込める。
//
// このファイルに限り、画面上に描く箱そのものを「付箋」と呼ぶ。寸法や位置を
// 持つのは箱であって中身ではないため。ユーザーに見せる文言では使わない。
// ---------------------------------------------------------------------------

const callRuntimeRpc = createRuntimeRpcClient<typeof backgroundRoutes>();

const HOST_ID = "chrome-palette-memo";
/** レイアウトの保存は連続操作のたびに投げず、落ち着いてから 1 回だけ送る。 */
const LAYOUT_PERSIST_DEBOUNCE_MS = 400;
const TEXT_PERSIST_DEBOUNCE_MS = 600;
const MINIMIZED_SIZE = { width: 168, height: 32 } as const;
/** 本文に合わせて伸ばせる高さの上限。ビューポートを覆うとページが読めなくなる。 */
const AUTO_HEIGHT_VIEWPORT_RATIO = 0.6;
/** ヘッダのボタンと本文の 1 行が潰れずに収まる大きさ。 */
const MIN_PANEL_SIZE = { width: 168, height: 96 };
/**
 * 大きさを変えるつまみ。`edgeX` / `edgeY` はどの辺を動かすかで、
 * -1 が左・上、1 が右・下、0 はその向きに動かさないことを表す。
 */
const RESIZE_HANDLES = [
  { name: "n", edgeX: 0, edgeY: -1 },
  { name: "s", edgeX: 0, edgeY: 1 },
  { name: "w", edgeX: -1, edgeY: 0 },
  { name: "e", edgeX: 1, edgeY: 0 },
  { name: "nw", edgeX: -1, edgeY: -1 },
  { name: "ne", edgeX: 1, edgeY: -1 },
  { name: "sw", edgeX: -1, edgeY: 1 },
  { name: "se", edgeX: 1, edgeY: 1 },
];

interface OverlayHandle {
  render(memo: Memo | null): void;
  /** 本文へカーソルを移す。 */
  focus(): void;
}

let handle: OverlayHandle | null = null;

/** content script の初期化時に呼ぶ。メモが無ければ何も描画しない。 */
export async function initMemoOverlay(): Promise<void> {
  const memo = await fetchMemo();
  if (memo) ensureHandle().render(memo);
}

/** パレットからメモを作成・更新したときに、このタブの表示を作り直す。 */
export function refreshMemoOverlay(): RpcResponse<RpcVoidResponseBody> {
  void fetchMemo()
    .then((memo) => ensureHandle().render(memo))
    .catch(() => undefined);
  return { ok: true, data: {} };
}

/** 付箋を出して本文へカーソルを移す。 */
export function focusMemoOverlay(): RpcResponse<RpcVoidResponseBody> {
  void fetchMemo()
    .then((memo) => {
      const overlay = ensureHandle();
      overlay.render(memo);
      if (memo) overlay.focus();
    })
    .catch(() => undefined);
  return { ok: true, data: {} };
}

async function fetchMemo(): Promise<Memo | null> {
  const res = await callRuntimeRpc({ name: "memo.get" }).catch(() => null);
  if (!res || !("ok" in res) || !res.ok || !("data" in res)) return null;
  return res.data.memo;
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
  // open: Vimium 等が activeElement を辿って textarea を見つけ、入力中はショートカットを抑制できるようにする。
  const shadow = host.attachShadow({ mode: "open" });
  shadow.appendChild(buildStyle());

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.setAttribute("role", "note");

  const header = document.createElement("div");
  header.className = "header";
  const grip = document.createElement("span");
  grip.className = "grip";
  grip.textContent = "メモ";
  const actions = document.createElement("div");
  actions.className = "actions";
  // 最小化中に残すのは「元の大きさに戻す」だけ。
  const smaller = iconButton("A-", "文字を小さく", "font");
  const larger = iconButton("A+", "文字を大きく", "font");
  const toggleMinimize = iconButton("—", "最小化");
  actions.append(smaller, larger, toggleMinimize);
  header.append(grip, actions);

  const textarea = document.createElement("textarea");
  textarea.className = "body";
  textarea.spellcheck = false;
  // 空の付箋が出ることがあるので、その状態でも壊れて見えないようにする。
  textarea.placeholder = "メモを入力";

  panel.append(header, textarea);
  shadow.appendChild(panel);

  let current: Memo | null = null;
  let layoutTimer: number | null = null;
  let textTimer: number | null = null;

  const persistLayout = (): void => {
    if (!current) return;
    const layout = current.layout;
    if (layoutTimer !== null) clearTimeout(layoutTimer);
    layoutTimer = window.setTimeout(() => {
      layoutTimer = null;
      void callRuntimeRpc({
        name: "memo.updateLayout",
        layout,
      }).catch(() => undefined);
    }, LAYOUT_PERSIST_DEBOUNCE_MS);
  };

  /**
   * 本文を収めるのに要る高さ。寸法を自分で決めた付箋では伸ばさない。
   * 手で決めた大きさを勝手に変えられるのは、調整機能そのものを壊す。
   *
   * 伸ばした結果は保存しない。保存されている寸法は既定のまま、
   * 見せ方だけを本文に合わせる。本文が減れば既定の高さまで戻る。
   */
  const autoHeight = (layout: Memo["layout"]): number => {
    const { width, height } = MEMO_DEFAULT_LAYOUT;
    if (layout.width !== width || layout.height !== height) {
      return layout.height;
    }
    // 伸ばす前の本文の高さを知りたいので、いったん潰してから測る。
    const keptFlex = textarea.style.flex;
    const keptHeight = textarea.style.height;
    textarea.style.flex = "0 0 auto";
    textarea.style.height = "0";
    const bodyHeight = textarea.scrollHeight;
    textarea.style.flex = keptFlex;
    textarea.style.height = keptHeight;

    const frame =
      header.offsetHeight + (panel.offsetHeight - panel.clientHeight);
    const limit = Math.max(
      height,
      window.innerHeight * AUTO_HEIGHT_VIEWPORT_RATIO
    );
    return Math.round(Math.min(Math.max(height, frame + bodyHeight), limit));
  };

  /** その状態で実際に描く寸法。最小化中は保存寸法ではなくつまみの大きさ。 */
  const sizeOf = (layout: Memo["layout"]): { width: number; height: number } =>
    layout.state === "minimized"
      ? MINIMIZED_SIZE
      : { width: layout.width, height: autoHeight(layout) };

  /** 保存位置ではなく、いま実際に描かれる位置。ドラッグの起点にも使う。 */
  const visiblePosition = (
    layout: Memo["layout"]
  ): { x: number; y: number } => {
    const { width, height } = sizeOf(layout);
    return clampToViewport(layout.x, layout.y, width, height);
  };

  const apply = (): void => {
    if (!current) {
      panel.style.display = "none";
      return;
    }
    const { fontScale, state } = current.layout;
    panel.style.display = "flex";
    panel.dataset.state = state;
    // 高さは本文を測って決めるので、文字サイズと本文を先に当てておく。
    textarea.style.fontSize = `${fontScale}rem`;
    // 入力中に外部からの更新で値を差し戻すとカーソルが飛ぶので触らない。
    if (!isEditing()) textarea.value = current.text;
    const { width, height } = sizeOf(current.layout);
    const { x, y } = clampToViewport(
      current.layout.x,
      current.layout.y,
      width,
      height
    );
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    panel.style.width = `${width}px`;
    panel.style.height = `${height}px`;
    toggleMinimize.textContent = state === "minimized" ? "▣" : "—";
    toggleMinimize.title =
      state === "minimized" ? "元の大きさに戻す" : "最小化";
    // 最小化中でも「メモがある」ことは分かる必要があるので、
    // 本文の先頭をつまみに出しておく。
    grip.textContent = state === "minimized" ? previewOf(current.text) : "メモ";
  };

  const mutateLayout = (patch: Partial<Memo["layout"]>): void => {
    if (!current) return;
    current = { ...current, layout: { ...current.layout, ...patch } };
    apply();
    persistLayout();
  };

  toggleMinimize.addEventListener("click", () => {
    if (!current) return;
    const next: MemoDisplayState =
      current.layout.state === "minimized" ? "normal" : "minimized";
    mutateLayout({ state: next });
  });

  const stepFontScale = (direction: 1 | -1): void => {
    if (!current) return;
    const { min, max, step } = MEMO_FONT_SCALE;
    const raw = current.layout.fontScale + direction * step;
    const rounded = Math.round(raw * 10) / 10;
    mutateLayout({ fontScale: Math.min(max, Math.max(min, rounded)) });
  };
  larger.addEventListener("click", () => stepFontScale(1));
  smaller.addEventListener("click", () => stepFontScale(-1));

  // 起点は保存寸法ではなく、いま見えている箱。本文に合わせて伸びている
  // 最中に掴んでも、その大きさから続けて変えられるようにする。
  const visibleBox = (): PanelBox | null => {
    if (!current || current.layout.state !== "normal") return null;
    const { x, y } = visiblePosition(current.layout);
    return { x, y, width: panel.offsetWidth, height: panel.offsetHeight };
  };
  for (const { name, edgeX, edgeY } of RESIZE_HANDLES) {
    const resizer = document.createElement("div");
    resizer.className = `resizer ${name}`;
    panel.appendChild(resizer);
    bindResize(resizer, edgeX, edgeY, visibleBox, (box) => mutateLayout(box));
  }

  // 起点は保存位置ではなく表示位置。寄せて表示している最中に掴んだとき、
  // 保存位置から動き始めて飛ぶのを防ぐ。動かした先はそのまま保存する。
  bindDrag(
    header,
    panel,
    () => (current ? visiblePosition(current.layout) : null),
    (x, y) => mutateLayout({ x, y })
  );

  textarea.addEventListener("input", () => {
    if (!current) return;
    current = { ...current, text: textarea.value };
    apply();
    if (textTimer !== null) clearTimeout(textTimer);
    const text = textarea.value;
    textTimer = window.setTimeout(() => {
      textTimer = null;
      void callRuntimeRpc({ name: "memo.setText", text }).catch(
        () => undefined
      );
    }, TEXT_PERSIST_DEBOUNCE_MS);
  });

  // ページ側のキーバインドにメモの入力を奪われないようにする。
  for (const type of ["keydown", "keyup", "keypress"] as const) {
    textarea.addEventListener(type, (e) => e.stopPropagation());
  }

  // ウィンドウの大きさが変わったら描き直す。保存はしないので、
  // 元の大きさに戻れば元の位置に戻る。
  let resizeFrame: number | null = null;
  window.addEventListener("resize", () => {
    if (resizeFrame !== null) return;
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = null;
      apply();
    });
  });

  document.documentElement.appendChild(host);

  // 入力中かどうか。Shadow DOM 内の focus は外から見ると host に見えるため、
  // shadow 側の activeElement で判定する。
  const isEditing = (): boolean =>
    document.activeElement === host && shadow.activeElement === textarea;

  /**
   * 既定位置はビューポートを見ないと決まらないので、初めて描くここで確定させる。
   * 高さは本文を測らないと決まらないため、一度描いてから呼ぶ。
   */
  const resolvePlacement = (): boolean => {
    if (!current?.layout.awaitingPlacement) return false;
    const { width, height } = sizeOf(current.layout);
    const { x, y } = initialPosition(width, height);
    current = {
      ...current,
      layout: { ...current.layout, x, y, awaitingPlacement: false },
    };
    return true;
  };

  return {
    render(memo) {
      current = memo;
      // 位置を決める前の描画は測るためのもの。描き直しは同じ処理の中で
      // 済むので、予備の座標のまま画面に出ることはない。
      apply();
      if (resolvePlacement()) {
        apply();
        persistLayout();
      }
    },
    focus() {
      if (!current) return;
      textarea.focus();
      // 末尾にカーソルを置く。追記が普通で、全選択して打ち直すことは少ない。
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    },
  };
}

/**
 * 保存された位置を、そのウィンドウで実際に見える位置へ寄せる。
 *
 * 丸めるのは表示位置だけで保存値は触らない。ウィンドウが元の幅に戻れば
 * 元の位置に戻る。付箋の方がウィンドウより大きければ 0 に寄せ、
 * 少なくともヘッダを掴める状態は保つ。
 */
function clampToViewport(
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number } {
  const maxX = Math.max(0, window.innerWidth - width);
  const maxY = Math.max(0, window.innerHeight - height);
  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(0, y), maxY),
  };
}

/**
 * 初めて描くときの位置。右寄りで、高さは中央。
 *
 * 左上に出すと、ページ側のロゴ・ナビゲーション・パンくずと重なりやすい。
 * 右の中ほどは本文の読み取りを邪魔しにくく、視線を上げれば目に入る。
 */
function initialPosition(
  width: number,
  height: number
): { x: number; y: number } {
  return clampToViewport(
    window.innerWidth - width - MEMO_DEFAULT_RIGHT_MARGIN,
    Math.round((window.innerHeight - height) / 2),
    width,
    height
  );
}

function previewOf(text: string): string {
  const head = text.trim().split("\n")[0] ?? "";
  if (head.length === 0) return "メモ (空)";
  return head.length > 14 ? `${head.slice(0, 14)}…` : head;
}

function iconButton(
  label: string,
  title: string,
  className?: string
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.title = title;
  if (className) button.className = className;
  return button;
}

/**
 * ヘッダを掴んでの移動。移動はこの機能の必須要件なので、
 * ビューポート外に出て掴めなくなることがないよう位置を丸める。
 */
function bindDrag(
  handleEl: HTMLElement,
  panel: HTMLElement,
  readOrigin: () => { x: number; y: number } | null,
  onMove: (x: number, y: number) => void
): void {
  handleEl.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.tagName === "BUTTON") return;
    const origin = readOrigin();
    if (!origin) return;

    event.preventDefault();
    handleEl.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = origin.x;
    const originY = origin.y;

    const onPointerMove = (move: PointerEvent): void => {
      // 端まで持っていってもヘッダが必ず残るようにクランプする。
      const { x, y } = clampToViewport(
        originX + move.clientX - startX,
        originY + move.clientY - startY,
        panel.offsetWidth,
        panel.offsetHeight
      );
      onMove(Math.round(x), Math.round(y));
    };
    const onPointerUp = (): void => {
      handleEl.removeEventListener("pointermove", onPointerMove);
      handleEl.removeEventListener("pointerup", onPointerUp);
      handleEl.removeEventListener("pointercancel", onPointerUp);
    };
    handleEl.addEventListener("pointermove", onPointerMove);
    handleEl.addEventListener("pointerup", onPointerUp);
    handleEl.addEventListener("pointercancel", onPointerUp);
  });
}

interface PanelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 辺や角をつかんでの大きさ変更。ブラウザ標準のリサイズは右下の角しか出せず、
 * 狙って掴むのに気を使うため自前で持つ。
 *
 * 上辺・左辺を動かすときは反対側の辺が動かないよう、位置も一緒に変える。
 */
function bindResize(
  resizer: HTMLElement,
  edgeX: number,
  edgeY: number,
  readOrigin: () => PanelBox | null,
  onResize: (box: PanelBox) => void
): void {
  resizer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const origin = readOrigin();
    if (!origin) return;

    event.preventDefault();
    resizer.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;

    const onPointerMove = (move: PointerEvent): void => {
      // 四辺の座標で考える。掴んでいない辺は動かさない。
      let left = origin.x;
      let top = origin.y;
      let right = origin.x + origin.width;
      let bottom = origin.y + origin.height;
      const movedX = move.clientX - startX;
      const movedY = move.clientY - startY;
      if (edgeX < 0) {
        left = Math.min(left + movedX, right - MIN_PANEL_SIZE.width);
      }
      if (edgeX > 0) {
        right = Math.max(right + movedX, left + MIN_PANEL_SIZE.width);
      }
      if (edgeY < 0) {
        top = Math.min(top + movedY, bottom - MIN_PANEL_SIZE.height);
      }
      if (edgeY > 0) {
        bottom = Math.max(bottom + movedY, top + MIN_PANEL_SIZE.height);
      }
      // ビューポートからはみ出した分は掴めなくなるので、中に留める。
      left = Math.max(0, left);
      top = Math.max(0, top);
      right = Math.min(window.innerWidth, right);
      bottom = Math.min(window.innerHeight, bottom);
      onResize({
        x: Math.round(left),
        y: Math.round(top),
        width: Math.round(right - left),
        height: Math.round(bottom - top),
      });
    };
    const onPointerUp = (): void => {
      resizer.removeEventListener("pointermove", onPointerMove);
      resizer.removeEventListener("pointerup", onPointerUp);
      resizer.removeEventListener("pointercancel", onPointerUp);
    };
    resizer.addEventListener("pointermove", onPointerMove);
    resizer.addEventListener("pointerup", onPointerUp);
    resizer.addEventListener("pointercancel", onPointerUp);
  });
}

function buildStyle(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .panel {
      position: absolute;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      pointer-events: auto;
      font-family: system-ui, -apple-system, "Hiragino Sans", sans-serif;
      background: #fffbe6;
      color: #303030;
      border: 1px solid #d9c88a;
      border-radius: 8px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
      overflow: hidden;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 4px 6px;
      background: #f5e9b8;
      border-bottom: 1px solid #e0d195;
      cursor: move;
      user-select: none;
      flex: 0 0 auto;
    }
    .grip {
      font-size: 12px;
      line-height: 1.4;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* 角のつまみに重なってボタンが押せなくなるのを防ぐ。 */
    .actions {
      display: flex;
      gap: 2px;
      flex: 0 0 auto;
      position: relative;
      z-index: 3;
    }
    .actions button {
      all: unset;
      cursor: pointer;
      font-size: 11px;
      line-height: 1;
      padding: 3px 5px;
      border-radius: 4px;
      color: #5a4a12;
    }
    .actions button:hover { background: rgba(0, 0, 0, 0.08); }
    .body {
      all: unset;
      flex: 1 1 auto;
      box-sizing: border-box;
      padding: 8px;
      width: 100%;
      resize: none;
      overflow: auto;
      white-space: pre-wrap;
      line-height: 1.5;
      font-family: inherit;
    }
    /* 最小化しても消さない。つまみだけ残して存在を示す。 */
    .panel[data-state="minimized"] .body { display: none; }
    .panel[data-state="minimized"] .header { border-bottom: none; }
    /* つまみの状態で文字サイズを変えることはない。残すのは復帰だけ。 */
    .panel[data-state="minimized"] .actions button.font { display: none; }
    /* 大きさを変えるつまみ。枠の内側に敷くので、角の丸みで欠けない。 */
    .resizer { position: absolute; z-index: 1; }
    .resizer.n { top: 0; left: 0; right: 0; height: 6px; cursor: ns-resize; }
    .resizer.s { bottom: 0; left: 0; right: 0; height: 6px; cursor: ns-resize; }
    .resizer.w { top: 0; bottom: 0; left: 0; width: 6px; cursor: ew-resize; }
    .resizer.e { top: 0; bottom: 0; right: 0; width: 6px; cursor: ew-resize; }
    /* 角は辺より優先して掴めるようにする。 */
    .resizer.nw, .resizer.ne, .resizer.sw, .resizer.se {
      width: 12px;
      height: 12px;
      z-index: 2;
    }
    .resizer.nw { top: 0; left: 0; cursor: nwse-resize; }
    .resizer.ne { top: 0; right: 0; cursor: nesw-resize; }
    .resizer.sw { bottom: 0; left: 0; cursor: nesw-resize; }
    .resizer.se { bottom: 0; right: 0; cursor: nwse-resize; }
    .panel[data-state="minimized"] .resizer { display: none; }
  `;
  return style;
}
