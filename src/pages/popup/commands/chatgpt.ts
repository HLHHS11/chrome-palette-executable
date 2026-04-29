import type { RpcCommand } from "@core/command";
import type { ExtractRpcRequest } from "@core/rpc";
import type { routes } from "@src/pages/content/routes";

type ContentRpcMessage = ExtractRpcRequest<(typeof routes)[number]>;

export default function getChatgptCommands(
  pageUrl: URL | undefined
): RpcCommand<ContentRpcMessage>[] {
  const isChatGptPage = pageUrl?.hostname === "chatgpt.com";
  if (!isChatGptPage) return [];

  return [
    {
      title: `ChatGPT: サイドバーをトグル`,
      subtitle: "ChatGPT: Toggle Side Bar",
      message: { name: "chatgpt.toggleSidebar" },
    },
    {
      title: `ChatGPT: ウェブ検索を有効化`,
      subtitle: "ChatGPT: Enable Web Search",
      message: { name: "chatgpt.enableWebSearch" },
    },
    {
      title: `ChatGPT: ウェブ検索を無効化`,
      subtitle: "ChatGPT: Disable Web Search",
      message: { name: "chatgpt.disableWebSearch" },
    },
    {
      title: "ChatGPT: Instant (GPT-5.3) モデルを選択",
      subtitle: "ChatGPT: Select Instant Model",
      message: {
        name: "chatgpt.selectModel",
        model: "gpt-5.3",
      },
    },
    {
      title: "ChatGPT: Thinking (GPT-5.5, Standard) モデルを選択",
      subtitle: "ChatGPT: Select Thinking Standard Model",
      message: {
        name: "chatgpt.selectModel",
        model: "gpt-5.5-thinking",
        thinkingEffort: "standard",
      },
    },
    {
      title: "ChatGPT: Thinking (GPT-5.5, Extended) モデルを選択",
      subtitle: "ChatGPT: Select Thinking Extended Model",
      message: {
        name: "chatgpt.selectModel",
        model: "gpt-5.5-thinking",
        thinkingEffort: "extended",
      },
    },
    {
      title: "ChatGPT: ファイルを添付",
      subtitle: "ChatGPT: Attach File",
      message: { name: "chatgpt.openFileAttach" },
    },
    {
      title: "ChatGPT: 回答生成を停止",
      subtitle: "ChatGPT: Stop Generation",
      message: { name: "chatgpt.stopGeneration" },
      keybind: [
        {
          metaKey: true,
          shiftKey: true,
          key: "Backspace",
          preventDefault: true,
        },
      ],
    },
  ];
}
