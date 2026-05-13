import { RpcResponse, RpcVoidResponseBody } from "@core/rpc";

import {
  simulateMouseClick,
  simulateMouseClickSequence,
  waitForSelector,
} from "../lib/dom/selector";
import { startUserKeydownOverlay } from "./common/user-keydown-overlay";

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
