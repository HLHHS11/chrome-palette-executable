import { RpcResponse, RpcVoidResponseBody } from "@core/rpc";

import { simulateMouseClick } from "../lib/dom/selector";

export function stopGeminiGeneration(): RpcResponse<RpcVoidResponseBody> {
  // NOTE: UI上の文言が変更されたら、ここも修正が必要になる！
  const stopButton = document.querySelector<HTMLElement>(
    'button[aria-label="回答を停止"]'
  );
  if (!stopButton) {
    return { ok: false, error: "回答生成停止ボタンが見つかりません。" };
  }
  simulateMouseClick(stopButton);
  return { ok: true, data: {} };
}
