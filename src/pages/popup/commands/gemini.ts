import type { Command } from "@pages/core/command";

import { inputSignal } from "~/util/signals";

const [, setInputValue] = inputSignal;

async function runToggleGeminiSideBar(): Promise<void> {
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
        if (!toggleButton) throw new Error("トグルボタンが見つかりません。");

        toggleButton.click();
      },
    });
    window.close();
  } catch (e) {
    console.error(e);
    setInputValue("エラーが発生しました。");
  }
}

export default function getGeminiCommands(pageUrl: URL | undefined): Command[] {
  const isGeminiPage = pageUrl?.hostname === "gemini.google.com";
  if (!isGeminiPage) return [];

  return [
    {
      title: "Gemini: サイドバーをトグル",
      subtitle: `Gemini: Toggle Side Bar`,
      command: runToggleGeminiSideBar,
    },
  ];
}
