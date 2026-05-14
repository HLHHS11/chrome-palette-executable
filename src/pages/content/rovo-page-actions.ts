import { RpcResponse, RpcVoidResponseBody } from "@core/rpc";

import { simulateMouseClick } from "../lib/dom/selector";

// 回答生成中の停止ボタンには aria-label / data-testid が無く、
// 子孫の VisuallyHidden span の「生成を停止」テキストでしか同定できない。
// CSS セレクタでは祖先指定が書きにくいため XPath で取得する。日本語 UI 前提。
const STOP_BUTTON_XPATH =
  '//*[@data-testid="chat-input-wrapper"]//*[normalize-space(text())="生成を停止"]/ancestor::button[1]';

export function stopRovoGeneration(): RpcResponse<RpcVoidResponseBody> {
  const node = document.evaluate(
    STOP_BUTTON_XPATH,
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  ).singleNodeValue;
  if (!(node instanceof HTMLButtonElement)) {
    return { ok: false, error: "回答生成停止ボタンが見つかりません。" };
  }
  simulateMouseClick(node);
  return { ok: true, data: {} };
}
