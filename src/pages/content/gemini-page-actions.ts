import { RpcResponse, RpcVoidResponseBody } from "@core/rpc";

import {
  simulateMouseClick,
  simulateMouseClickSequence,
  waitForSelector,
} from "../lib/dom/selector";
import { startUserKeydownOverlay } from "./common/user-keydown-overlay";

type SelectGeminiModelParams = {
  model: "instant" | "thinking" | "pro";
};

export async function selectGeminiModel(
  params: SelectGeminiModelParams
): Promise<RpcResponse<RpcVoidResponseBody>> {
  const menuButton = document.querySelector<HTMLElement>(
    'button[data-test-id="bard-mode-menu-button"]'
  );
  if (!menuButton) {
    return {
      ok: false,
      error: "モデル選択ドロップダウンボタンが見つかりません。",
    };
  }
  simulateMouseClick(menuButton);

  // NOTE: UI上の文言 (test id末尾の日本語含む) が変更されたら、ここも修正が必要になる！
  const optionTestId = (() => {
    switch (params.model) {
      case "instant":
        return "bard-mode-option-高速モード";
      case "thinking":
        return "bard-mode-option-思考モード";
      case "pro":
        return "bard-mode-option-pro";
    }
  })();

  const modelOption = await (async () => {
    try {
      return await waitForSelector(`[data-test-id="${optionTestId}"]`, {
        timeoutMs: 3000,
      });
    } catch {
      return null;
    }
  })();
  if (!modelOption) {
    return { ok: false, error: "モデル選択のメニュー項目が見つかりません。" };
  }
  simulateMouseClick(modelOption);
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

export async function openGeminiFileUpload(): Promise<
  RpcResponse<RpcVoidResponseBody>
> {
  activeFileUploadCleanup?.();
  activeFileUploadCleanup = null;

  // NOTE: UI上の文言が変更されたら、ここも修正が必要になる！
  const menuToggleButton = document.querySelector<HTMLElement>(
    'button[aria-label="[ファイルをアップロード] メニューを開く"]'
  );
  if (!menuToggleButton) {
    return {
      ok: false,
      error: "アップロードメニューを開くボタンが見つかりません。",
    };
  }
  simulateMouseClick(menuToggleButton);

  // メニュー展開後にレンダリングされるので waitForSelector で出現を待つ。
  // NOTE: UI上の文言が変更されたら、ここも修正が必要になる！
  const uploadItem = await (async () => {
    try {
      return await waitForSelector(
        '[aria-label="ファイルをアップロード. ドキュメント、データ、コードファイル"]',
        { timeoutMs: 3000 }
      );
    } catch {
      return null;
    }
  })();
  if (!(uploadItem instanceof HTMLElement)) {
    return {
      ok: false,
      error: "アップロードメニュー項目が見つかりません。",
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
