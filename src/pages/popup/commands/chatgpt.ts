import {
  CHATGPT_ENABLE_WEB_SEARCH_MESSAGE_TYPE,
  CHATGPT_TOGGLE_SIDEBAR_MESSAGE_TYPE,
  type ChatGptContentResponse,
} from "@src/pages/content/protocol";

import { inputSignal } from "~/util/signals";

import { Command } from "./general";

const [, setInputValue] = inputSignal;

// TODO: #1 このへんのRPCの仕組みひどいので修正する
async function sendChatGptPageMessage(
  type:
    | typeof CHATGPT_ENABLE_WEB_SEARCH_MESSAGE_TYPE
    | typeof CHATGPT_TOGGLE_SIDEBAR_MESSAGE_TYPE
): Promise<void> {
  const tabId = await chrome.tabs
    .query({
      active: true,
      lastFocusedWindow: true,
    })
    .then(([tab]) => {
      if (typeof tab.id === "undefined")
        throw new Error("アクティブなタブが取得できません。");

      return tab.id;
    });

  // TODO: #1 asを使わないといけない状況を避ける。SDKを作ること。
  const response = (await chrome.tabs.sendMessage(tabId, {
    type,
  })) as ChatGptContentResponse | undefined;

  if (!response?.ok) {
    throw new Error(
      response && "error" in response ? response.error : "操作に失敗しました。"
    );
  }
}

async function runEnableChatGptWebSearch(): Promise<void> {
  try {
    await sendChatGptPageMessage(CHATGPT_ENABLE_WEB_SEARCH_MESSAGE_TYPE);
    setInputValue("ChatGPT: ウェブ検索を有効化しました。");
    setTimeout(() => window.close(), 300);
  } catch (e) {
    console.error(e);
    setInputValue(`エラーが発生しました。${e}`);
  }
}

async function runToggleChatGptSidebar(): Promise<void> {
  try {
    await sendChatGptPageMessage(CHATGPT_TOGGLE_SIDEBAR_MESSAGE_TYPE);
    setTimeout(() => window.close(), 1000);
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
      title: `ChatGPT: サイドバーをトグル`,
      subtitle: "ChatGPT: Toggle Side Bar",
      command: runToggleChatGptSidebar,
    },
    {
      title: `ChatGPT: ウェブ検索を有効化`,
      subtitle: "ChatGPT: Enable Web Search",
      command: runEnableChatGptWebSearch,
    },
  ];
}
