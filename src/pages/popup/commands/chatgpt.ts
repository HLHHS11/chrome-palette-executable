import type { routes } from "@src/pages/content/routes";
import { createRpcClient } from "@src/pages/lib/rpc/client";

import { inputSignal } from "~/util/signals";

import { Command } from "./general";

const [, setInputValue] = inputSignal;

const rpc = createRpcClient<typeof routes>();

async function runEnableChatGptWebSearch(): Promise<void> {
  const res = await rpc({ name: "chatgpt.enableWebSearch" });

  if (!res.ok) {
    setInputValue(`エラーが発生しました。${res.error}`);
    console.error(res.error);
    setTimeout(() => window.close(), 3000);
    return;
  }

  window.close();
}

async function runDisableChatGptWebSearch(): Promise<void> {
  const res = await rpc({ name: "chatgpt.disableWebSearch" });
  if (!res.ok) {
    setInputValue(`エラーが発生しました。${res.error}`);
    console.error(res.error);
    setTimeout(() => window.close(), 3000);
    return;
  }

  window.close();
}

async function runToggleChatGptSidebar(): Promise<void> {
  const res = await rpc({ name: "chatgpt.toggleSidebar" });
  if (!res.ok) {
    setInputValue(`エラーが発生しました。${res.error}`);
    console.error(res.error);
    setTimeout(() => window.close(), 3000);
    return;
  }

  window.close();
}

export default function getChatgptCommands(
  pageUrl: URL | undefined
): Command[] {
  const isChatGptPage = pageUrl?.hostname === "chatgpt.com";
  if (!isChatGptPage) return [];

  return [
    {
      title: `ChatGPT: サイドバーをトグル`,
      subtitle: "ChatGPT: Toggle Side Bar",
      command: runToggleChatGptSidebar,
    },
    {
      title: `ChatGPT: ウェブ検索を有効化`,
      subtitle: "ChatGPT: Enable Web Search",
      command: runEnableChatGptWebSearch,
    },
    {
      title: `ChatGPT: ウェブ検索を無効化`,
      subtitle: "ChatGPT: Disable Web Search",
      command: runDisableChatGptWebSearch,
    },
  ];
}
