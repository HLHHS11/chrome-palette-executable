import { inputSignal } from "~/util/signals";

import { Command } from "./general";

const [, setInputValue] = inputSignal;

async function runChatgptSidebarToggle(): Promise<void> {
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

        const isExpanded = closeBtn?.getAttribute("aria-expanded") === "true";
        if (isExpanded) {
          if (!closeBtn) return;
          closeBtn.click();
        } else {
          if (!openBtn) return;
          openBtn.click();
        }
      },
    });
    window.close();
  } catch {
    setInputValue("エラーが発生しました。");
  }
}

export default function chatgptSuggestions(
  activeTabUrl: string | undefined
): Command[] {
  const isChatGptPage = (() => {
    if (typeof activeTabUrl === "undefined") return false;

    const url = new URL(activeTabUrl);
    return url.hostname === "chatgpt.com";
  })();

  if (!isChatGptPage) return [];

  return [
    {
      title: "ChatGPT: Toggle Side Bar",
      subtitle: `ChatGPT: サイドバーをトグル`,
      command: runChatgptSidebarToggle,
    },
  ];
}
