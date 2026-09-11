import {
  type RpcResponse,
  type RpcVoidResponseBody,
  createRuntimeRpcClient,
} from "@core/rpc";
import { TAB_MEMO_EXPANDED_SIZE, TAB_MEMO_FONT_SCALE } from "@pages/tab-memo";
import type { TabMemo, TabMemoDisplayState } from "@pages/tab-memo";

import { backgroundRoutes } from "../background/routes";

// ---------------------------------------------------------------------------
// タブに紐づくメモをページ上に表示するオーバーレイ。
//
// 設計上の制約:
// - ページ側に「メモを追加」ボタンは出さない。追加の入口はコマンドパレットだけ。
//   したがってメモが存在しないタブでは、この UI は一切描画しない。
// - 最小化は「完全に隠すこと」ではない。隠してしまうと、メモが無いのか
//   最小化されているのかを画面から区別できなくなるため、つまみだけは残す。
// - ページの CSS に汚されない / ページを汚さないように Shadow DOM に閉じ込める。
// ---------------------------------------------------------------------------

const callRuntimeRpc = createRuntimeRpcClient<typeof backgroundRoutes>();

const HOST_ID = "chrome-palette-tab-memo";
/** レイアウトの保存は連続操作のたびに投げず、落ち着いてから 1 回だけ送る。 */
const LAYOUT_PERSIST_DEBOUNCE_MS = 400;
const TEXT_PERSIST_DEBOUNCE_MS = 600;
const MINIMIZED_SIZE = { width: 168, height: 32 } as const;

interface OverlayHandle {
  render(memo: TabMemo | null): void;
}

let handle: OverlayHandle | null = null;

/** content script の初期化時に呼ぶ。メモが無ければ何も描画しない。 */
export async function initTabMemoOverlay(): Promise<void> {
  const memo = await fetchMemo();
  if (memo) ensureHandle().render(memo);
}

/**
 * background から呼ばれる RPC handler。
 * コマンドパレットでメモを作成・更新したときに、このタブの表示を更新する。
 */
export function refreshTabMemoOverlay(): RpcResponse<RpcVoidResponseBody> {
  void fetchMemo()
    .then((memo) => ensureHandle().render(memo))
    .catch(() => undefined);
  return { ok: true, data: {} };
}

async function fetchMemo(): Promise<TabMemo | null> {
  const res = await callRuntimeRpc({ name: "tabMemo.get" }).catch(() => null);
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
  const shadow = host.attachShadow({ mode: "closed" });
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
  const smaller = iconButton("A-", "文字を小さく");
  const larger = iconButton("A+", "文字を大きく");
  const toggleSize = iconButton("⤢", "拡大 / 元のサイズ");
  const toggleMinimize = iconButton("—", "最小化 / 復帰");
  actions.append(smaller, larger, toggleSize, toggleMinimize);
  header.append(grip, actions);

  const textarea = document.createElement("textarea");
  textarea.className = "body";
  textarea.spellcheck = false;
  textarea.placeholder = "";

  panel.append(header, textarea);
  shadow.appendChild(panel);

  let current: TabMemo | null = null;
  let layoutTimer: number | null = null;
  let textTimer: number | null = null;

  const persistLayout = (): void => {
    if (!current) return;
    const layout = current.layout;
    if (layoutTimer !== null) clearTimeout(layoutTimer);
    layoutTimer = window.setTimeout(() => {
      layoutTimer = null;
      void callRuntimeRpc({
        name: "tabMemo.updateLayout",
        layout,
      }).catch(() => undefined);
    }, LAYOUT_PERSIST_DEBOUNCE_MS);
  };

  const apply = (): void => {
    if (!current) {
      panel.style.display = "none";
      return;
    }
    const { x, y, width, height, fontScale, state } = current.layout;
    panel.style.display = "flex";
    panel.dataset.state = state;
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    if (state === "minimized") {
      panel.style.width = `${MINIMIZED_SIZE.width}px`;
      panel.style.height = `${MINIMIZED_SIZE.height}px`;
    } else if (state === "expanded") {
      panel.style.width = `${TAB_MEMO_EXPANDED_SIZE.width}px`;
      panel.style.height = `${TAB_MEMO_EXPANDED_SIZE.height}px`;
    } else {
      panel.style.width = `${width}px`;
      panel.style.height = `${height}px`;
    }
    textarea.style.fontSize = `${fontScale}rem`;
    // 最小化中でも「メモがある」ことは分かる必要があるので、
    // 本文の先頭をつまみに出しておく。
    grip.textContent = state === "minimized" ? previewOf(current.text) : "メモ";
    if (!isEditing()) textarea.value = current.text;
  };

  const mutateLayout = (patch: Partial<TabMemo["layout"]>): void => {
    if (!current) return;
    current = { ...current, layout: { ...current.layout, ...patch } };
    apply();
    persistLayout();
  };

  toggleMinimize.addEventListener("click", () => {
    if (!current) return;
    const next: TabMemoDisplayState =
      current.layout.state === "minimized" ? "normal" : "minimized";
    mutateLayout({ state: next });
  });

  toggleSize.addEventListener("click", () => {
    if (!current) return;
    const next: TabMemoDisplayState =
      current.layout.state === "expanded" ? "normal" : "expanded";
    mutateLayout({ state: next });
  });

  const stepFontScale = (direction: 1 | -1): void => {
    if (!current) return;
    const { min, max, step } = TAB_MEMO_FONT_SCALE;
    const raw = current.layout.fontScale + direction * step;
    const rounded = Math.round(raw * 10) / 10;
    mutateLayout({ fontScale: Math.min(max, Math.max(min, rounded)) });
  };
  larger.addEventListener("click", () => stepFontScale(1));
  smaller.addEventListener("click", () => stepFontScale(-1));

  bindDrag(
    header,
    panel,
    () => current?.layout ?? null,
    (x, y) => mutateLayout({ x, y })
  );

  // normal 状態の手動リサイズを拾う。ResizeObserver だと状態切替でも発火するため、
  // ユーザー操作由来の変化だけを対象にする。
  textarea.addEventListener("input", () => {
    if (!current) return;
    current = { ...current, text: textarea.value };
    grip.textContent =
      current.layout.state === "minimized" ? previewOf(current.text) : "メモ";
    if (textTimer !== null) clearTimeout(textTimer);
    const text = textarea.value;
    textTimer = window.setTimeout(() => {
      textTimer = null;
      void callRuntimeRpc({ name: "tabMemo.setText", text }).catch(
        () => undefined
      );
    }, TEXT_PERSIST_DEBOUNCE_MS);
  });

  // ページ側のキーバインドにメモの入力を奪われないようにする。
  for (const type of ["keydown", "keyup", "keypress"] as const) {
    textarea.addEventListener(type, (e) => e.stopPropagation());
  }

  document.documentElement.appendChild(host);

  // 入力中かどうか。Shadow DOM 内の focus は外から見ると host に見えるため、
  // shadow 側の activeElement で判定する。
  const isEditing = (): boolean =>
    document.activeElement === host && shadow.activeElement === textarea;

  return {
    render(memo) {
      current = memo;
      // 入力中に外部からの更新で値を差し戻すとカーソルが飛ぶので触らない。
      if (memo && !isEditing()) textarea.value = memo.text;
      apply();
    },
  };
}

function previewOf(text: string): string {
  const head = text.trim().split("\n")[0] ?? "";
  if (head.length === 0) return "メモ (空)";
  return head.length > 14 ? `${head.slice(0, 14)}…` : head;
}

function iconButton(label: string, title: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.title = title;
  return button;
}

/**
 * ヘッダを掴んでの移動。移動はこの機能の必須要件なので、
 * ビューポート外に出て掴めなくなることがないよう位置を丸める。
 */
function bindDrag(
  handleEl: HTMLElement,
  panel: HTMLElement,
  readLayout: () => TabMemo["layout"] | null,
  onMove: (x: number, y: number) => void
): void {
  handleEl.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.tagName === "BUTTON") return;
    const layout = readLayout();
    if (!layout) return;

    event.preventDefault();
    handleEl.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = layout.x;
    const originY = layout.y;

    const onPointerMove = (move: PointerEvent): void => {
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      // 端まで持っていってもヘッダが必ず残るようにクランプする。
      const maxX = Math.max(0, window.innerWidth - width);
      const maxY = Math.max(0, window.innerHeight - height);
      const x = Math.min(maxX, Math.max(0, originX + move.clientX - startX));
      const y = Math.min(maxY, Math.max(0, originY + move.clientY - startY));
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
    .actions { display: flex; gap: 2px; flex: 0 0 auto; }
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
    .panel[data-state="normal"] { resize: both; }
  `;
  return style;
}
