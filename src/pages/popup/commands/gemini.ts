import type { RpcCommand } from "@core/command";
import type { ExtractRpcRequest } from "@core/rpc";
import type { routes } from "@src/pages/content/routes";

type ContentRpcMessage = ExtractRpcRequest<(typeof routes)[number]>;

type GeminiModelTier = "flash" | "flash-lite" | "pro";
type GeminiModelMode = "instant" | "thinking";

const GEMINI_MODEL_COMMANDS: {
  tier: GeminiModelTier;
  tierLabelJa: string;
  tierLabelEn: string;
  mode: GeminiModelMode;
  modeLabelJa: string;
  modeLabelEn: string;
}[] = [
  {
    tier: "flash",
    tierLabelJa: "Flash",
    tierLabelEn: "Flash",
    mode: "instant",
    modeLabelJa: "Instant",
    modeLabelEn: "Instant",
  },
  {
    tier: "flash",
    tierLabelJa: "Flash",
    tierLabelEn: "Flash",
    mode: "thinking",
    modeLabelJa: "Thinking",
    modeLabelEn: "Thinking",
  },
  {
    tier: "flash-lite",
    tierLabelJa: "Flash-Lite",
    tierLabelEn: "Flash-Lite",
    mode: "instant",
    modeLabelJa: "Instant",
    modeLabelEn: "Instant",
  },
  {
    tier: "flash-lite",
    tierLabelJa: "Flash-Lite",
    tierLabelEn: "Flash-Lite",
    mode: "thinking",
    modeLabelJa: "Thinking",
    modeLabelEn: "Thinking",
  },
  {
    tier: "pro",
    tierLabelJa: "Pro",
    tierLabelEn: "Pro",
    mode: "instant",
    modeLabelJa: "Instant",
    modeLabelEn: "Instant",
  },
  {
    tier: "pro",
    tierLabelJa: "Pro",
    tierLabelEn: "Pro",
    mode: "thinking",
    modeLabelJa: "Thinking",
    modeLabelEn: "Thinking",
  },
];

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
    ...GEMINI_MODEL_COMMANDS.map((row) => ({
      title: `Gemini: ${row.tierLabelJa}（${row.modeLabelJa}）`,
      subtitle: `Gemini: Select ${row.tierLabelEn} / ${row.modeLabelEn}`,
      message: {
        name: "gemini.selectModel" as const,
        tier: row.tier,
        mode: row.mode,
      },
    })),
  ];
}
