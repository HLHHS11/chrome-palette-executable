import type { RpcCommand } from "@core/command";
import type { ExtractRpcRequest } from "@core/rpc";
import type { SelectClaudeModelParams } from "@src/pages/content/claude-page-actions";
import type { routes } from "@src/pages/content/routes";

type ContentRpcMessage = ExtractRpcRequest<(typeof routes)[number]>;

export function getClaudeRpcCommands(
  pageUrl: URL | undefined
): RpcCommand<ContentRpcMessage>[] {
  if (pageUrl?.hostname !== "claude.ai") return [];

  const models = [
    { model: "claude-opus-5-5", label: "Opus 5.5" },
    { model: "claude-sonnet-5-5", label: "Sonnet 5.5" },
    { model: "claude-haiku-5-5", label: "Haiku 5.5" },
    { model: "claude-fable-5-1", label: "Fable 5.1" },
  ] satisfies { model: SelectClaudeModelParams["model"]; label: string }[];
  const efforts = [
    { effort: "low", label: "低", labelEn: "Low" },
    { effort: "medium", label: "中", labelEn: "Medium" },
    { effort: "high", label: "高", labelEn: "High" },
    { effort: "xhigh", label: "超高", labelEn: "Extra High" },
    { effort: "max", label: "最大", labelEn: "Max" },
  ] satisfies {
    effort: SelectClaudeModelParams["effort"];
    label: string;
    labelEn: string;
  }[];

  const selectModelCommands = models.flatMap((m) =>
    efforts.map(
      (e): RpcCommand<ContentRpcMessage> => ({
        title: `Claude: ${m.label} (エフォート: ${e.label}) を選択`,
        subtitle: `Claude: Select ${m.label} with ${e.labelEn} Effort`,
        message: {
          name: "claude.selectModel",
          model: m.model,
          effort: e.effort,
        },
      })
    )
  );

  return [
    ...selectModelCommands,
    {
      title: "Claude: 回答生成を停止",
      subtitle: "Claude: Stop Generation",
      message: { name: "claude.stopGeneration" },
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
