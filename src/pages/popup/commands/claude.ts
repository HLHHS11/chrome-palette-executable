import type { RpcCommand } from "@core/command";
import type { ExtractRpcRequest } from "@core/rpc";
import type { routes } from "@src/pages/content/routes";

type ContentRpcMessage = ExtractRpcRequest<(typeof routes)[number]>;

export function getClaudeRpcCommands(
  pageUrl: URL | undefined
): RpcCommand<ContentRpcMessage>[] {
  if (pageUrl?.hostname !== "claude.ai") return [];

  return [
    {
      title: "Claude: Sonnet 4.6 (Instant) モデルを選択",
      subtitle: "Claude: Select Sonnet 4.6 Instant Model",
      message: {
        name: "claude.selectModel",
        model: "sonnet-4.6",
        mode: "instant",
      },
    },
    {
      title: "Claude: Sonnet 4.6 (Thinking) モデルを選択",
      subtitle: "Claude: Select Sonnet 4.6 Thinking Model",
      message: {
        name: "claude.selectModel",
        model: "sonnet-4.6",
        mode: "thinking",
      },
    },
    {
      title: "Claude: Opus 4.7 (Instant) モデルを選択",
      subtitle: "Claude: Select Opus 4.7 Instant Model",
      message: {
        name: "claude.selectModel",
        model: "opus-4.7",
        mode: "instant",
      },
    },
    {
      title: "Claude: Opus 4.7 (Thinking) モデルを選択",
      subtitle: "Claude: Select Opus 4.7 Thinking Model",
      message: {
        name: "claude.selectModel",
        model: "opus-4.7",
        mode: "thinking",
      },
    },
  ];
}
