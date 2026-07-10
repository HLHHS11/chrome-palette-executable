import { RpcResponse, RpcVoidResponseBody } from "@core/rpc";

import {
  simulateMouseClick,
  simulateMouseClickSequence,
  waitForXPath,
} from "../lib/dom/selector";
import { startUserKeydownOverlay } from "./common/user-keydown-overlay";

type SelectGeminiModelParams = {
  tier: "flash" | "flash-lite" | "pro";
  mode: "instant" | "thinking";
};

// Gemini のモデル行はバージョン表記付きラベル (例: 「3.5 Flash」) の span として出る。
// CSS で安定したフックが無いため XPath で取得する。日本語 UI・上記ラベル文言前提。
const GEMINI_MODEL_TIER_XPATH: Record<SelectGeminiModelParams["tier"], string> =
  {
    "flash-lite": "//span[contains(., 'Flash-Lite')]",
    flash: "//span[contains(., 'Flash') and not(contains(., 'Flash-Lite'))]",
    pro: "//span[contains(., ' Pro')]",
  };

const ENHANCED_THINKING_MODE_ROW_XPATH =
  "//*[@data-test-id='gem-mode-menu']//gem-menu-item[.//span[normalize-space(.)='強化版思考モード']]";
const GEMINI_MODEL_MENU_BUTTON = 'button[data-test-id="bard-mode-menu-button"]';

function openGeminiModelMenu(): RpcResponse<RpcVoidResponseBody> | undefined {
  const menuButton = document.querySelector<HTMLElement>(
    GEMINI_MODEL_MENU_BUTTON
  );
  if (!menuButton) {
    return {
      ok: false,
      error: "モデル選択ドロップダウンボタンが見つかりません。",
    };
  }
  simulateMouseClick(menuButton);
  return undefined;
}

export async function selectGeminiModel(
  params: SelectGeminiModelParams
): Promise<RpcResponse<RpcVoidResponseBody>> {
  const stop = openGeminiModelMenu();
  if (stop) return stop;

  const tierXpath = GEMINI_MODEL_TIER_XPATH[params.tier];
  let tierEl: Element;
  try {
    tierEl = await waitForXPath(tierXpath, { timeoutMs: 3000 });
  } catch {
    return { ok: false, error: "モデル名の項目が見つかりません。" };
  }
  simulateMouseClick(tierEl);

  await new Promise<void>((r) => setTimeout(r, 150));

  const stop2 = openGeminiModelMenu();
  if (stop2) return stop2;

  let thinkingModeEl: Element;
  try {
    thinkingModeEl = await waitForXPath(ENHANCED_THINKING_MODE_ROW_XPATH, {
      timeoutMs: 3000,
    });
  } catch {
    return {
      ok: false,
      error: "強化版思考モードの項目が見つかりません。",
    };
  }

  const thinkingModeContent = thinkingModeEl.querySelector(
    ":scope > gem-menu-item-content"
  );
  if (!thinkingModeContent) {
    return {
      ok: false,
      error: "強化版思考モードの選択状態が確認できません。",
    };
  }
  const thinkingModeSelected =
    thinkingModeContent.classList.contains("selected");
  const wantThinking = params.mode === "thinking";
  if (thinkingModeSelected !== wantThinking) {
    simulateMouseClick(thinkingModeEl);
  } else {
    const closeStop = openGeminiModelMenu();
    if (closeStop) return closeStop;
  }

  return { ok: true, data: {} };
}

export function toggleGeminiSidebar(): RpcResponse<RpcVoidResponseBody> {
  const closeBtn = document.querySelector<HTMLElement>(
    'button[aria-label="サイドバーを閉じる"]'
  );
  if (closeBtn) {
    simulateMouseClick(closeBtn);
    return { ok: true, data: {} };
  }

  const openBtn = document.querySelector<HTMLButtonElement>(
    'button[aria-label="サイドバーを開く"]'
  );
  if (!openBtn) {
    return { ok: false, error: "開くボタンが見つかりません。" };
  }
  if (openBtn.disabled) {
    return { ok: false, error: "サイドバーを開くボタンが無効です。" };
  }
  simulateMouseClick(openBtn);
  return { ok: true, data: {} };
}

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

let activeFileUploadCleanup: (() => void) | null = null;

export async function openGeminiFileAttach(): Promise<
  RpcResponse<RpcVoidResponseBody>
> {
  activeFileUploadCleanup?.();
  activeFileUploadCleanup = null;

  const menuToggleButton = document.querySelector<HTMLElement>(
    '[aria-label="アップロードとツール"]'
  );
  if (!menuToggleButton) {
    return {
      ok: false,
      error: "「アップロードとツール」ボタンが見つかりません。",
    };
  }
  simulateMouseClick(menuToggleButton);

  let uploadItem: Element;
  try {
    uploadItem = await waitForXPath(
      "//span[normalize-space(.)='ファイルをアップロード']",
      { timeoutMs: 3000 }
    );
  } catch {
    return {
      ok: false,
      error: "「ファイルをアップロード」の項目が見つかりません。",
    };
  }
  if (!(uploadItem instanceof HTMLElement)) {
    return {
      ok: false,
      error: "「ファイルをアップロード」の項目が見つかりません。",
    };
  }

  // OSのファイル選択ダイアログを開くには trusted な user gesture が必要なため、
  // 次のキー入力を起点に同期的にクリックを実行する。
  activeFileUploadCleanup = startUserKeydownOverlay({
    modeDomIdPrefix: "chrome-palette-gemini-file-upload",
    message:
      "Enter / Space でファイル選択を開きます。その他のキーでキャンセルします。",
    execute: () => {
      uploadItem.focus();
      simulateMouseClickSequence(uploadItem);
    },
  });

  return { ok: true, data: {} };
}
