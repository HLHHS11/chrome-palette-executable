import { inputSignal } from "~/util/signals";

import { Command } from "./general";

const [, setInputValue] = inputSignal;

const GEMINI_ORIGIN = "https://gemini.google.com";

function isGeminiPage(tabUrl: string | undefined): boolean {
  if (tabUrl === undefined) return false;
  return tabUrl.startsWith(GEMINI_ORIGIN);
}

async function runGeminiSideNavClick(): Promise<void> {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (!tab?.id) {
    setInputValue("アクティブなタブがありません。");
    return;
  }
  if (!tab.url?.startsWith(GEMINI_ORIGIN)) {
    setInputValue(
      "gemini.google.com を開いたタブでパレットを開いてから実行してください。"
    );
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "ISOLATED",
      func: () => {
        const el = document.querySelector(
          'button[data-test-id="side-nav-menu-button"]'
        );
        (el as HTMLButtonElement | null)?.click();
      },
    });
  } catch (err) {
    console.error(err);
    setInputValue("スクリプト注入に失敗しました（permissions を確認）。");
    return;
  }
  window.close();
}

/** 一覧に載せるのは Gemini 表示中のタブだけ（YouTube などでは出さない） */
export default function geminiSuggestions(
  activeTabUrl: string | undefined
): Command[] {
  if (!isGeminiPage(activeTabUrl)) return [];
  return [
    {
      title: "Gemini: サイドバーをトグル",
      subtitle: `Gemini: Toggle Side Bar`,
      command: runGeminiSideNavClick,
    },
  ];
}
