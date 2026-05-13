import { registerKeybindListener } from "@core/command";
import { registerRoutes } from "@core/rpc";

import { listRpcCommands } from "../rpc-command";
import { startChatGptNotifier } from "./chatgpt-notifier";
import { startGeminiNotifier } from "./gemini-notifier";
import { initGmailLatestHashNavigation } from "./gmail-latest-hash";
import { routes } from "./routes";
import { initTabNumberingHints } from "./tab-numbering";

console.log("[chrome-palette] content initialized: v0.0.15");
registerRoutes(routes);

registerKeybindListener({
  getCommands: () =>
    listRpcCommands(new URL(location.href)).filter((command) => {
      const hasKeybind = typeof command.keybind !== "undefined";
      return hasKeybind;
    }),
});

startChatGptNotifier();
startGeminiNotifier();
initGmailLatestHashNavigation();
initTabNumberingHints();
