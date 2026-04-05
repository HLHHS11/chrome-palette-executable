import {
  simulateMouseClick,
  waitForSelector,
  waitUntilValue,
} from "../lib/dom/selector";
import { RpcResponse, VoidResponseBody } from "../lib/rpc/types";

// TODO: #1 REVERT symbolを返すのは型チェックのため
export async function enableChatGptWebSearch(): Promise<
  RpcResponse<VoidResponseBody>
> {
  // NOTE: 既にメニューが開いている状態で本コマンドを実行すると、メニューが閉じてしまう。
  // 再度実行すれば良いので今 (260405 Issue #1) 時点では無視するが、丁寧に作り込みたいならメニューの開閉状況確認のロジックを入れても良い。
  const optionMenuButton = await waitForSelector("button.composer-btn");
  simulateMouseClick(optionMenuButton);

  const optionMenu = await waitForSelector(
    'div[role="menu"][data-state="open"]'
  );

  const webSearchButtonResult = await waitUntilValue(() => {
    const items = optionMenu.querySelectorAll('div[role="menuitemradio"]');
    const maybeWebSearchItem = [...items].find((e) => {
      // NOTE: UI上の文言が変更されたら、ここも修正が必要になる！
      const isWebSearch = e.textContent?.includes("ウェブ検索") ?? false;
      return isWebSearch;
    });

    return typeof maybeWebSearchItem !== "undefined"
      ? { status: "found", value: maybeWebSearchItem }
      : { status: "pending", value: null };
  });

  if (webSearchButtonResult.status !== "found") {
    throw new Error("ウェブ検索のメニュー項目が見つかりません。");
  }

  simulateMouseClick(webSearchButtonResult.value);
  return { ok: true, data: {} };
}

export function disableChatGptWebSearch(): RpcResponse<VoidResponseBody> {
  const btn = document.querySelector<HTMLButtonElement>(
    'button[aria-label="検索：クリックして削除"]'
  );
  // 無効化ボタンが見つからない場合は何もしない
  if (!btn) return { ok: false, error: "無効化ボタンが見つかりません。" };
  btn.click();

  return { ok: true, data: {} };
}

export function toggleChatGptSidebar(): RpcResponse<VoidResponseBody> {
  const closeBtn = document.querySelector(
    'button[aria-label="サイドバーを閉じる"]'
  );
  const openBtn = document.querySelector(
    'button[aria-label="サイドバーを開く"]'
  );

  const isExpanded = closeBtn?.getAttribute("aria-expanded") === "true";
  if (isExpanded) {
    if (!closeBtn)
      return { ok: false, error: "閉じるボタンが見つかりません。" };
    simulateMouseClick(closeBtn);
  } else {
    if (!openBtn) return { ok: false, error: "開くボタンが見つかりません。" };
    simulateMouseClick(openBtn);
  }

  return { ok: true, data: {} };
}
