import { registerRoutes } from "../lib/rpc/dispatcher";
import { startChatGptNotifier } from "./chatgpt-notifier";
import { initGmailLatestHashNavigation } from "./gmail-latest-hash";
import { routes } from "./routes";

console.log("[chrome-palette] content initialized: v0.0.9");
registerRoutes(routes);
startChatGptNotifier();
initGmailLatestHashNavigation();
