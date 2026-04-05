import type { RpcRoute } from "../lib/rpc/types";
import {
  disableChatGptWebSearch,
  enableChatGptWebSearch,
  toggleChatGptSidebar,
} from "./chatgpt-page-actions";

export const routes = [
  {
    message: { name: "chatgpt.enableWebSearch" },
    handler: enableChatGptWebSearch,
  },
  {
    message: { name: "chatgpt.disableWebSearch" },
    handler: disableChatGptWebSearch,
  },
  {
    message: { name: "chatgpt.toggleSidebar" },
    handler: toggleChatGptSidebar,
  },
] as const satisfies readonly RpcRoute[];
