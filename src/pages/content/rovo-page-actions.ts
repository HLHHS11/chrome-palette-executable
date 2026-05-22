import { RpcResponse, RpcVoidResponseBody } from "@core/rpc";

import {
  simulateMouseClick,
  waitForSelector,
  waitUntilValue,
} from "../lib/dom/selector";

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

type SelectRovoModelParams = {
  model: "auto" | "instant" | "thinking" | "deep-research";
};

// NOTE: Rovo UI 上のラベル文言 (英語表記) が変更されたら、ここも修正が必要になる！
const ROVO_MODEL_LABEL: Record<SelectRovoModelParams["model"], string> = {
  auto: "Let Rovo decide",
  instant: "Quick answers",
  thinking: "Think deeper",
  "deep-research": "Deep Research",
};

export async function selectRovoModel(
  params: SelectRovoModelParams
): Promise<RpcResponse<RpcVoidResponseBody>> {
  const menuTrigger = await waitForSelector(
    'button[data-testid="reasoning-mode-menu-trigger"]',
    { timeoutMs: 3000 }
  ).catch(() => null);
  if (!(menuTrigger instanceof HTMLElement)) {
    return { ok: false, error: "モデル選択メニューが見つかりません。" };
  }
  simulateMouseClick(menuTrigger);

  const targetLabel = ROVO_MODEL_LABEL[params.model];
  const menuItemResult = await waitUntilValue(() => {
    const items = document.querySelectorAll<HTMLElement>(
      'button[role="menuitem"]'
    );
    const found = [...items].find((item) =>
      item.textContent?.includes(targetLabel)
    );
    return typeof found !== "undefined"
      ? { status: "found", value: found }
      : { status: "pending", value: null };
  });

  if (menuItemResult.status !== "found") {
    return {
      ok: false,
      error: `モデル「${targetLabel}」の項目が見つかりません。`,
    };
  }
  simulateMouseClick(menuItemResult.value);
  return { ok: true, data: {} };
}
