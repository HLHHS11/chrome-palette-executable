import type { routes } from "@src/pages/content/routes";
import { createTabsRpcClient } from "@src/pages/lib/rpc/client";

import { inputSignal } from "~/util/signals";

import { Command } from "./general";

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
      command: runArchiveOnGmail,
    },
  ];
}
