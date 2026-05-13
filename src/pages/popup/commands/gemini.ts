import type { Command, RpcCommand } from "@core/command";
import type { ExtractRpcRequest } from "@core/rpc";
import type { routes } from "@src/pages/content/routes";

import { inputSignal } from "~/util/signals";

const [, setInputValue] = inputSignal;

type ContentRpcMessage = ExtractRpcRequest<(typeof routes)[number]>;

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
      handler: runToggleGeminiSideBar,
    },
  ];
}

export function getGeminiRpcCommands(
  pageUrl: URL | undefined
): RpcCommand<ContentRpcMessage>[] {
  const isGeminiPage = pageUrl?.hostname === "gemini.google.com";
  if (!isGeminiPage) return [];

  return [
    {
      title: "Gemini: 回答生成を停止",
      subtitle: "Gemini: Stop Generation",
      message: { name: "gemini.stopGeneration" },
      keybind: [
        {
          metaKey: true,
          shiftKey: true,
          key: "Backspace",
          preventDefault: true,
        },
      ],
    },
    {
      title: "Gemini: ファイルをアップロード",
      subtitle: "Gemini: Upload File",
      message: { name: "gemini.openFileUpload" },
    },
    {
      title: "Gemini: Instant モデルを選択",
      subtitle: "Gemini: Select Instant Model",
      message: { name: "gemini.selectModel", model: "instant" },
    },
    {
      title: "Gemini: Thinking モデルを選択",
      subtitle: "Gemini: Select Thinking Model",
      message: { name: "gemini.selectModel", model: "thinking" },
    },
    {
      title: "Gemini: Pro モデルを選択",
      subtitle: "Gemini: Select Pro Model",
      message: { name: "gemini.selectModel", model: "pro" },
    },
  ];
}
