import { registerRoutes } from "../lib/rpc/dispatcher";
import { startChatGptNotifier } from "./chatgpt-notifier";
import { routes } from "./routes";

console.log("[chrome-palette] content initialized: v0.0.1");
registerRoutes(routes);
startChatGptNotifier();
