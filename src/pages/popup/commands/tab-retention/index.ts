import type { Command } from "@core/command";
import { createRuntimeRpcClient } from "@core/rpc";
import type { backgroundRoutes } from "@pages/background/routes";

import { matchCommand, setInput } from "~/util/signals";

import { faviconURL } from "../../util/favicon";

export { default as TabRetentionView } from "./TabRetentionView";

export const TAB_RETENTION_KEYWORD = "tc";

const callBackgroundRpc = createRuntimeRpcClient<typeof backgroundRoutes>();

async function currentTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (tab?.id === undefined) throw new Error("Could not get active tab.");
  return tab.id;
}

async function setCurrentTabRetention(
  retention: "normal" | "manual-protected"
): Promise<void> {
  try {
    const response = await callBackgroundRpc({
      name: "tabRetention.setProtection",
      tabId: await currentTabId(),
      retention,
    });
    if (!response.ok) throw new Error(response.error);
    window.close();
  } catch (e: unknown) {
    setInput(`エラーが発生しました。詳細: ${e}`);
  }
}

const entryCommands: Command[] = [
  {
    title: "Tabs: Cleanup",
    subtitle: "自動削除予定・保持中・最近削除したタブを表示",
    keyword: `${TAB_RETENTION_KEYWORD}>`,
    icon: faviconURL("about:blank"),
    handler: () => setInput(`${TAB_RETENTION_KEYWORD}>`),
  },
  {
    title: "Tabs: Keep Current Tab from Auto-Close",
    subtitle: "現在のタブを明示保持する",
    handler: () => setCurrentTabRetention("manual-protected"),
  },
  {
    title: "Tabs: Allow Auto-Close for Current Tab",
    subtitle: "保持と利用実績を解除し、3時間の猶予を開始する",
    handler: () => setCurrentTabRetention("normal"),
  },
];

export default function tabRetentionSuggestions(): Command[] {
  const { isCommand } = matchCommand(TAB_RETENTION_KEYWORD);
  if (isCommand) return [];
  return entryCommands;
}
