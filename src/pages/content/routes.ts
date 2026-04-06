import type { RpcRoute } from "../lib/rpc/types";
import {
  disableChatGptWebSearch,
  enableChatGptWebSearch,
  selectChatGptModel,
  toggleChatGptSidebar,
} from "./chatgpt-page-actions";

export const routes = [
  { name: "chatgpt.enableWebSearch", handler: enableChatGptWebSearch },
  { name: "chatgpt.disableWebSearch", handler: disableChatGptWebSearch },
  { name: "chatgpt.toggleSidebar", handler: toggleChatGptSidebar },
  { name: "chatgpt.selectModel", handler: selectChatGptModel },
] as const satisfies readonly RpcRoute[];
