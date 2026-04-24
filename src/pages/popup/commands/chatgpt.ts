import type { Command } from "@pages/core/command";
import type { routes } from "@src/pages/content/routes";
import { createTabsRpcClient } from "@src/pages/lib/rpc/client";

import { inputSignal } from "~/util/signals";

const [, setInputValue] = inputSignal;

const callTabsRpc = createTabsRpcClient<typeof routes>();

async function runEnableChatGptWebSearch(): Promise<void> {
  const res = await callTabsRpc({ name: "chatgpt.enableWebSearch" });

  if (!res.ok) {
    setInputValue(`エラーが発生しました。${res.error}`);
    console.error(res.error);
    setTimeout(() => window.close(), 3000);
    return;
  }

  window.close();
}

async function runDisableChatGptWebSearch(): Promise<void> {
  const res = await callTabsRpc({ name: "chatgpt.disableWebSearch" });
  if (!res.ok) {
    setInputValue(`エラーが発生しました。${res.error}`);
    console.error(res.error);
    setTimeout(() => window.close(), 3000);
    return;
  }

  window.close();
}

async function runToggleChatGptSidebar(): Promise<void> {
  const res = await callTabsRpc({ name: "chatgpt.toggleSidebar" });
  if (!res.ok) {
    setInputValue(`エラーが発生しました。${res.error}`);
    console.error(res.error);
    setTimeout(() => window.close(), 3000);
    return;
  }

  window.close();
}

async function runSelectInstantModel(): Promise<void> {
  const res = await callTabsRpc({
    name: "chatgpt.selectModel",
    model: "gpt-5.3",
  });
  if (!res.ok) {
    setInputValue(`エラーが発生しました。${res.error}`);
    console.error(res.error);
    setTimeout(() => window.close(), 3000);
    return;
  }

  window.close();
}

async function runSelectThinkingStandard(): Promise<void> {
  const res = await callTabsRpc({
    name: "chatgpt.selectModel",
    model: "gpt-5.5-thinking",
    thinkingEffort: "standard",
  });
  if (!res.ok) {
    setInputValue(`エラーが発生しました。${res.error}`);
    console.error(res.error);
    setTimeout(() => window.close(), 3000);
    return;
  }

  window.close();
}

async function runOpenChatGptFileAttach(): Promise<void> {
  const res = await callTabsRpc({ name: "chatgpt.openFileAttach" });
  if (!res.ok) {
    setInputValue(`エラーが発生しました。${res.error}`);
    console.error(res.error);
    setTimeout(() => window.close(), 3000);
    return;
  }

  window.close();
}

async function runSelectThinkingExtended(): Promise<void> {
  const res = await callTabsRpc({
    name: "chatgpt.selectModel",
    model: "gpt-5.5-thinking",
    thinkingEffort: "extended",
  });
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
    {
      title: "ChatGPT: Instant (GPT-5.3) モデルを選択",
      subtitle: "ChatGPT: Select Instant Model",
      command: runSelectInstantModel,
    },
    {
      title: "ChatGPT: Thinking (GPT-5.5, Standard) モデルを選択",
      subtitle: "ChatGPT: Select Thinking Standard Model",
      command: runSelectThinkingStandard,
    },
    {
      title: "ChatGPT: Thinking (GPT-5.5, Extended) モデルを選択",
      subtitle: "ChatGPT: Select Thinking Extended Model",
      command: runSelectThinkingExtended,
    },
    {
      title: "ChatGPT: ファイルを添付",
      subtitle: "ChatGPT: Attach File",
      command: runOpenChatGptFileAttach,
    },
  ];
}
