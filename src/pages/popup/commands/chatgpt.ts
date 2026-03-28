import { inputSignal } from "~/util/signals";

import { Command } from "./general";

const [, setInputValue] = inputSignal;

async function runToggleChatGptSidebar(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      world: "ISOLATED",
      func: () => {
        const closeBtn = document.querySelector<HTMLButtonElement>(
          'button[aria-label="サイドバーを閉じる"]'
        );
        const openBtn = document.querySelector<HTMLButtonElement>(
          'button[aria-label="サイドバーを開く"]'
        );

        // 閉じるボタンは常時存在し、さらに aria-expanded 属性から最新状態が読み取れるので、それによって判断
        const isExpanded = closeBtn?.getAttribute("aria-expanded") === "true";
        if (isExpanded) {
          if (!closeBtn) throw new Error("閉じるボタンが見つかりません。");
          closeBtn.click();
        } else {
          if (!openBtn) throw new Error("開くボタンが見つかりません。");
          openBtn.click();
        }
      },
    });
    window.close();
  } catch (e) {
    console.error(e);
    setInputValue("エラーが発生しました。");
  }
}

export default function getChatgptCommands(
  pageUrl: URL | undefined
): Command[] {
  const isChatGptPage = pageUrl?.hostname === "chatgpt.com";
  if (!isChatGptPage) return [];

  return [
    {
      title: "ChatGPT: Toggle Side Bar",
      subtitle: `ChatGPT: サイドバーをトグル`,
      command: runToggleChatGptSidebar,
    },
  ];
}
