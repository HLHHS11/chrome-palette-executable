import { createRuntimeRpcClient } from "@core/rpc";

import { backgroundRoutes } from "../background/routes";

const callRuntimeRpc = createRuntimeRpcClient<typeof backgroundRoutes>();

const LONG_PRESS_THRESHOLD_MS = 300;

/**
 * Cmd (Meta) の長押しを検出して、サービスワーカーに「タブ番号表示」「復元」を依頼する。
 *
 * 仕様:
 * - Meta keydown から 300ms 経過しても押下継続中なら長押し成立として `tabNumbering.show` を呼ぶ。
 * - 長押し成立前に「Meta 以外のキーが押される」または「Meta が keyup される」とキャンセル。
 *   これにより Cmd+他キー の通常ショートカット (Cmd+T 等) には干渉しない。
 * - 長押し成立後に Meta keyup されたら `tabNumbering.hide` を呼ぶ。
 * - 長押し成立後の Cmd+数字 (Chrome 標準でタブ切替が走る) では keyup を取り逃すことがあるが、
 *   それは service worker 側の onActivated 自動 hide + safety timeout でカバーされる。
 */
export function initTabNumberingHints(): void {
  let pressTimerId: number | null = null;
  let isHintActive = false;

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
      return;
    }

    if (isHintActive || pressTimerId !== null) return;
    pressTimerId = window.setTimeout(() => {
      pressTimerId = null;
      isHintActive = true;
      void callRuntimeRpc({ name: "tabNumbering.show" });
    }, LONG_PRESS_THRESHOLD_MS);
  });

  window.addEventListener("keyup", (e) => {
    if (!isMetaKeyEvent(e)) return;
    cancelPressTimer();
    if (isHintActive) {
      isHintActive = false;
      void callRuntimeRpc({ name: "tabNumbering.hide" });
    }
  });

  window.addEventListener("blur", () => {
    cancelPressTimer();
    if (isHintActive) {
      isHintActive = false;
      void callRuntimeRpc({ name: "tabNumbering.hide" });
    }
  });
}
