import { inputSignal } from "~/util/signals";

import { Command } from "./general";

const [, setInputValue] = inputSignal;

/** chatgpt.com および *.chatgpt.com を chatgpt.com/* とみなす */
function isChatGptPage(tabUrl: string | undefined): boolean {
  if (!tabUrl) return false;
  try {
    const { hostname } = new URL(tabUrl);
    return hostname === "chatgpt.com";
  } catch {
    return false;
  }
}

async function runChatgptSidebarToggle(): Promise<void> {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (!tab?.id) {
    setInputValue("アクティブなタブがありません。");
    return;
  }
  if (!isChatGptPage(tab.url)) {
    setInputValue(
      "chatgpt.com を開いたタブでパレットを開いてから実行してください。"
    );
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "ISOLATED",
      func: () => {
        const btn = document.querySelector(
          'button[aria-label="サイドバーを閉じる"]'
        );
        if (!(btn instanceof HTMLElement)) return;
        // 常に存在するトグルボタン。開閉は aria-expanded で判別（true = 展開中）
        const wasExpanded = btn.getAttribute("aria-expanded") === "true";
        btn.click();
        return wasExpanded;
      },
    });
  } catch (err) {
    console.error(err);
    setInputValue("スクリプト注入に失敗しました（permissions を確認）。");
    return;
  }
  window.close();
}

export default function chatgptSuggestions(
  activeTabUrl: string | undefined
): Command[] {
  if (!isChatGptPage(activeTabUrl)) return [];
  return [
    {
      title: "ChatGPT: Toggle Side Bar",
      subtitle: `ChatGPT: サイドバーをトグル`,
      command: runChatgptSidebarToggle,
    },
  ];
}
