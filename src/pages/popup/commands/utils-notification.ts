import type { Command } from "@pages/core/command";
import { backgroundRoutes } from "@src/pages/background/routes";
import { createRuntimeRpcClient } from "@src/pages/lib/rpc/client";

import { inputSignal } from "~/util/signals";

const [, setInputValue] = inputSignal;
const callRuntimeRpc = createRuntimeRpcClient<typeof backgroundRoutes>();

async function runSendHelloWorldNotification(): Promise<void> {
  const res = await callRuntimeRpc({
    name: "common.notify",
    options: {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/128x128.png"),
      title: "Hello World",
      message: "This is a test notification from command palette.",
    },
  });

  if (!res.ok) {
    setInputValue(`エラーが発生しました。${res.error}`);
    console.error(res.error);
    setTimeout(() => window.close(), 3000);
    return;
  }

  window.close();
}

export default function utilsNotificationSuggestions(): Command[] {
  return [
    {
      title: "Utils: Hello World通知を送信",
      subtitle: "Utils: Send Hello World Notification",
      command: runSendHelloWorldNotification,
    },
  ];
}
