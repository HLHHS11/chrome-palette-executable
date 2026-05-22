import type { RpcCommand } from "@core/command";
import type { ExtractRpcRequest } from "@core/rpc";
import type { routes } from "@src/pages/content/routes";
import { isRovoChatPage } from "@src/pages/content/rovo-common";

type ContentRpcMessage = ExtractRpcRequest<(typeof routes)[number]>;

export function getRovoRpcCommands(
  pageUrl: URL | undefined
): RpcCommand<ContentRpcMessage>[] {
  if (!pageUrl || !isRovoChatPage(pageUrl)) return [];

  return [
    {
      title: "Rovo: 回答生成を停止",
      subtitle: "Rovo: Stop Generation",
      message: { name: "rovo.stopGeneration" },
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
      title: "Rovo: Auto モデルを選択",
      subtitle: "Rovo: Select Auto Model",
      message: { name: "rovo.selectModel", model: "auto" },
    },
    {
      title: "Rovo: Instant モデルを選択",
      subtitle: "Rovo: Select Instant Model",
      message: { name: "rovo.selectModel", model: "instant" },
    },
    {
      title: "Rovo: Thinking モデルを選択",
      subtitle: "Rovo: Select Thinking Model",
      message: { name: "rovo.selectModel", model: "thinking" },
    },
    {
      title: "Rovo: Deep Research モデルを選択",
      subtitle: "Rovo: Select Deep Research Model",
      message: { name: "rovo.selectModel", model: "deep-research" },
    },
  ];
}
