import {
  simulateMouseClick,
  waitForSelector,
  waitUntilValue,
} from "../lib/dom/selector";

export async function enableChatGptWebSearch(): Promise<void> {
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
}

export function disableChatGptWebSearch(): void {
  const btn = document.querySelector<HTMLButtonElement>(
    'button[aria-label="検索：クリックして削除"]'
  );
  // 無効化ボタンが見つからない場合は何もしない
  if (!btn) return;
  btn.click();
}

export function toggleChatGptSidebar(): void {
  const closeBtn = document.querySelector(
    'button[aria-label="サイドバーを閉じる"]'
  );
  const openBtn = document.querySelector(
    'button[aria-label="サイドバーを開く"]'
  );

  const isExpanded = closeBtn?.getAttribute("aria-expanded") === "true";
  if (isExpanded) {
    if (!closeBtn) throw new Error("閉じるボタンが見つかりません。");
    simulateMouseClick(closeBtn);
  } else {
    if (!openBtn) throw new Error("開くボタンが見つかりません。");
    simulateMouseClick(openBtn);
  }
}
