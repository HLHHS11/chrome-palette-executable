import { RpcResponse, RpcVoidResponseBody } from "@core/rpc";

import {
  simulateMouseClick,
  simulateMouseClickSequence,
  waitForSelector,
  waitUntilValue,
} from "../lib/dom/selector";

export type SelectClaudeModelParams = {
  // モデル選択メニュー項目の data-model-id
  model:
    | "claude-opus-5-5"
    | "claude-sonnet-5-5"
    | "claude-haiku-5-5"
    | "claude-fable-5-1";
  // エフォートのサブメニュー項目の data-effort-id
  effort: "low" | "medium" | "high" | "xhigh" | "max";
};

const TRIGGER_SELECTOR = 'button[data-testid="model-selector-dropdown"]';
const MENU_SELECTOR = '[role="menu"][data-cds="ModelSelector"]';

async function openModelMenu(trigger: HTMLElement): Promise<Element | null> {
  // ブラウザコンソールで .click() がメニューを開けることが確認済。
  // simulateMouseClick 系では Base UI 側がメニューを開かないため、素の click() を使う。
  trigger.click();
  return await waitForSelector(MENU_SELECTOR, { timeoutMs: 3000 }).catch(
    () => null
  );
}

async function waitForMenuClosed(options?: {
  timeoutMs?: number;
}): Promise<boolean> {
  const result = await waitUntilValue<true>(
    () =>
      document.querySelector(MENU_SELECTOR)
        ? { status: "pending", value: null }
        : { status: "found", value: true },
    options
  );
  return result.status === "found";
}

function openSubmenu(menu: Element, label: string): boolean {
  const item = [
    ...menu.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ].find((el) => el.textContent?.trim().startsWith(label));
  if (!item) return false;
  // Base UI の submenu は click/pointer では安定して開かないため
  // ARIA メニュー標準どおり ArrowRight キーで開く。
  item.focus();
  const arrowRightInit: KeyboardEventInit = {
    key: "ArrowRight",
    code: "ArrowRight",
    keyCode: 39,
    bubbles: true,
    cancelable: true,
  };
  item.dispatchEvent(new KeyboardEvent("keydown", arrowRightInit));
  item.dispatchEvent(new KeyboardEvent("keyup", arrowRightInit));
  return true;
}

function dispatchEscape(): void {
  const target =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : document.body;
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    })
  );
}

export async function selectClaudeModel(
  params: SelectClaudeModelParams
): Promise<RpcResponse<RpcVoidResponseBody>> {
  const trigger = await waitForSelector(TRIGGER_SELECTOR, {
    timeoutMs: 3000,
  }).catch(() => null);
  if (!(trigger instanceof HTMLElement)) {
    return { ok: false, error: "モデル選択ドロップダウンが見つかりません。" };
  }

  // NOTE: UI 文言が変更されたら、ここも修正が必要になる！日本語 UI 前提。
  const OTHER_MODELS_MENU_LABEL = "他のモデル";
  const EFFORT_MENU_LABEL = "エフォート";

  // メニュー直下には選択中のモデルだけが並び、それ以外は「他のモデル」サブメニューにある。
  const activeModelSelector = `[data-model-id="${params.model}"][aria-checked="true"]`;
  let menu = await openModelMenu(trigger);
  if (!menu) {
    return { ok: false, error: "モデル選択メニューが開きませんでした。" };
  }

  // モデルを選ぶとメニューが閉じるので、モデル変更がある場合はモデルだけ先に変え、
  // メニューを開き直してからエフォートを合わせる。
  // (旧 UI では、モデル変更が同じメニュー内で先に操作した思考設定をモデルのデフォルトで上書きしていた)
  if (!menu.querySelector(activeModelSelector)) {
    if (!openSubmenu(menu, OTHER_MODELS_MENU_LABEL)) {
      return {
        ok: false,
        error: `「${OTHER_MODELS_MENU_LABEL}」メニュー項目が見つかりません。`,
      };
    }
    const modelItem = await waitForSelector(
      `[data-model-id="${params.model}"]`,
      { timeoutMs: 3000 }
    ).catch(() => null);
    if (!modelItem) {
      return {
        ok: false,
        error: `モデル「${params.model}」の項目が見つかりません。`,
      };
    }
    simulateMouseClickSequence(modelItem);

    if (!(await waitForMenuClosed())) {
      return { ok: false, error: "モデル切替後にメニューが閉じませんでした。" };
    }
    menu = await openModelMenu(trigger);
    if (!menu) {
      return {
        ok: false,
        error: "モデル切替後にメニューを再オープンできませんでした。",
      };
    }
    // Fable のように使用クレジットが必要なモデルは、クレジットがないと選択されずに購入案内が出る。
    if (!menu.querySelector(activeModelSelector)) {
      dispatchEscape();
      return {
        ok: false,
        error: `モデル「${params.model}」に切り替えられませんでした。使用クレジットが必要なモデルの可能性があります。`,
      };
    }
  }

  if (!openSubmenu(menu, EFFORT_MENU_LABEL)) {
    return {
      ok: false,
      error: `「${EFFORT_MENU_LABEL}」メニュー項目が見つかりません。`,
    };
  }
  const effortItem = await waitForSelector(
    `[role="menuitemradio"][data-effort-id="${params.effort}"]`,
    { timeoutMs: 3000 }
  ).catch(() => null);
  if (!effortItem) {
    return {
      ok: false,
      error: `エフォート「${params.effort}」の項目が見つかりません。`,
    };
  }
  if (effortItem.getAttribute("aria-checked") !== "true") {
    simulateMouseClickSequence(effortItem);
  }
  if (!(await waitForMenuClosed({ timeoutMs: 500 }))) {
    dispatchEscape();
  }
  return { ok: true, data: {} };
}

export function stopClaudeGeneration(): RpcResponse<RpcVoidResponseBody> {
  const stopButton = document.querySelector<HTMLElement>(
    'button[aria-label="応答を停止"]'
  );
  if (!stopButton) {
    return { ok: false, error: "回答生成停止ボタンが見つかりません。" };
  }
  simulateMouseClick(stopButton);
  return { ok: true, data: {} };
}
