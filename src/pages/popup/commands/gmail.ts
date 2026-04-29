import type { Command } from "@core/command";
import { createTabsRpcClient } from "@core/rpc";
import type { routes } from "@src/pages/content/routes";

import { inputSignal } from "~/util/signals";

const [, setInputValue] = inputSignal;

const callTabsRpc = createTabsRpcClient<typeof routes>();

async function runArchiveOnGmail(): Promise<void> {
  const res = await callTabsRpc({ name: "gmail.archive" });
  if (!res.ok) {
    setInputValue(`エラーが発生しました。${res.error}`);
    console.error(res.error);
    setTimeout(() => window.close(), 3000);
    return;
  }

  window.close();
}

export default function getGmailCommands(pageUrl: URL | undefined): Command[] {
  const isGmailPage = pageUrl?.hostname === "mail.google.com";
  if (!isGmailPage) return [];

  return [
    {
      title: "Gmail: アーカイブ（キー待ち）",
      subtitle: "Gmail: Archive after Enter/Space",
      handler: runArchiveOnGmail,
    },
  ];
}
