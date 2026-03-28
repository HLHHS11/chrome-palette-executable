import { inputSignal } from "~/util/signals";

import { Command } from "./general";

const [, setInputValue] = inputSignal;

async function runGeminiSideNavClick(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      world: "ISOLATED",
      func: () => {
        const toggleButton = document.querySelector<HTMLButtonElement>(
          'button[data-test-id="side-nav-menu-button"]'
        );
        if (!toggleButton) return;
        toggleButton.click();
      },
    });
    window.close();
  } catch {
    setInputValue("エラーが発生しました。");
  }
}

/** 一覧に載せるのは Gemini 表示中のタブだけ（YouTube などでは出さない） */
export default function geminiSuggestions(
  activeTabUrl: string | undefined
): Command[] {
  const isGeminiPage = (() => {
    if (typeof activeTabUrl === "undefined") return false;
    const url = new URL(activeTabUrl);
    return url.hostname === "gemini.google.com";
  })();

  if (!isGeminiPage) return [];

  return [
    {
      title: "Gemini: サイドバーをトグル",
      subtitle: `Gemini: Toggle Side Bar`,
      command: runGeminiSideNavClick,
    },
  ];
}
