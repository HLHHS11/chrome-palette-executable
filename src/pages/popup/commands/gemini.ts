import type { RpcCommand } from "@core/command";
import type { ExtractRpcRequest } from "@core/rpc";
import type { routes } from "@src/pages/content/routes";

type ContentRpcMessage = ExtractRpcRequest<(typeof routes)[number]>;

export function getGeminiRpcCommands(
  pageUrl: URL | undefined
): RpcCommand<ContentRpcMessage>[] {
  const isGeminiPage = pageUrl?.hostname === "gemini.google.com";
  if (!isGeminiPage) return [];

  return [
    {
      title: "Gemini: サイドバーをトグル",
      subtitle: "Gemini: Toggle Side Bar",
      message: { name: "gemini.toggleSidebar" },
    },
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
