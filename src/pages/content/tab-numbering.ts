import {
  type RpcResponse,
  type RpcVoidResponseBody,
  createRuntimeRpcClient,
} from "@core/rpc";

import { backgroundRoutes } from "../background/routes";

// ---------------------------------------------------------------------------
// background から各タブで実行するための RPC handler 群。
// background は chrome.tabs.sendMessage 経由でこれらを呼び、 document.title の
// 番号付け接頭辞 ("N. ") を付与 / 復元する。
// ---------------------------------------------------------------------------

const NUMBERED_TITLE_PREFIX = /^\d+\. /;

type ApplyTabNumberingTitleParams = {
  number: number;
};

export function applyTabNumberingTitle(
  params: ApplyTabNumberingTitleParams
): RpcResponse<RpcVoidResponseBody> {
  const base = document.title.replace(NUMBERED_TITLE_PREFIX, "");
  document.title = `${params.number}. ${base}`;
  return { ok: true, data: {} };
}

export function restoreTabNumberingTitle(): RpcResponse<RpcVoidResponseBody> {
  if (NUMBERED_TITLE_PREFIX.test(document.title)) {
    document.title = document.title.replace(NUMBERED_TITLE_PREFIX, "");
  }
  return { ok: true, data: {} };
}

// ---------------------------------------------------------------------------
// Cmd (Meta) 長押し検出 → background に show/hide を依頼するエントリポイント。
//
// 仕様:
// - Meta keydown から 50ms 経過しても押下継続中なら長押し成立として `tabNumbering.show` を呼ぶ。
// - 長押し成立前に「Meta 以外のキーが押される」または「Meta が keyup される」とキャンセル。
//   これにより Cmd+他キー の通常ショートカット (Cmd+T 等) には干渉しない。
// - 長押し成立後に Meta keyup されたら `tabNumbering.hide` を呼ぶ。
// - 長押し成立後の Cmd+数字 (Chrome 標準でタブ切替が走る) では keyup を取り逃すことがあるが、
//   それは background 側の onActivated 自動 hide + safety timeout でカバーされる。
// ---------------------------------------------------------------------------

const callRuntimeRpc = createRuntimeRpcClient<typeof backgroundRoutes>();

const LONG_PRESS_THRESHOLD_MS = 50;
const META_TAP_MAX_MS = 300;
const META_DOUBLE_TAP_WINDOW_MS = 450;

export function initTabNumberingHints(): void {
  let pressTimerId: number | null = null;
  let isHintActive = false;
  let isMetaTapCandidate = false;
  let metaTapStartedAt = 0;
  let lastMetaTapAt = 0;

  const cancelPressTimer = (): void => {
    if (pressTimerId !== null) {
      clearTimeout(pressTimerId);
      pressTimerId = null;
    }
  };

  const isMetaKeyEvent = (e: KeyboardEvent): boolean =>
    e.code === "MetaLeft" || e.code === "MetaRight";

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;

    if (!isMetaKeyEvent(e)) {
      if (pressTimerId !== null) cancelPressTimer();
      isMetaTapCandidate = false;
      lastMetaTapAt = 0;
      return;
    }

    if (isHintActive || pressTimerId !== null) return;
    isMetaTapCandidate = true;
    metaTapStartedAt = Date.now();
    pressTimerId = window.setTimeout(() => {
      pressTimerId = null;
      isHintActive = true;
      void callRuntimeRpc({ name: "tabNumbering.show" })
        .then(() => undefined)
        .catch(() => undefined);
    }, LONG_PRESS_THRESHOLD_MS);
  });

  window.addEventListener("keyup", (e) => {
    if (!isMetaKeyEvent(e)) return;
    const now = Date.now();
    const tapDurationMs = now - metaTapStartedAt;
    const isShortMetaTap =
      isMetaTapCandidate && tapDurationMs <= META_TAP_MAX_MS;
    cancelPressTimer();
    if (isHintActive) {
      isHintActive = false;
      void callRuntimeRpc({ name: "tabNumbering.hide" })
        .then(() => undefined)
        .catch(() => undefined);
    }
    if (!isShortMetaTap) {
      isMetaTapCandidate = false;
      lastMetaTapAt = 0;
      return;
    }

    isMetaTapCandidate = false;
    if (
      lastMetaTapAt !== 0 &&
      now - lastMetaTapAt <= META_DOUBLE_TAP_WINDOW_MS
    ) {
      lastMetaTapAt = 0;
      void callRuntimeRpc({ name: "verticalTabs.showEphemeral" })
        .then(() => undefined)
        .catch(() => undefined);
      return;
    }
    lastMetaTapAt = now;
  });

  window.addEventListener("blur", () => {
    cancelPressTimer();
    isMetaTapCandidate = false;
    if (isHintActive) {
      isHintActive = false;
      void callRuntimeRpc({ name: "tabNumbering.hide" })
        .then(() => undefined)
        .catch(() => undefined);
    }
  });
}
