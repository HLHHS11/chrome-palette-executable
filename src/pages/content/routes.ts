import type { RpcRoute } from "../lib/rpc/types";
import {
  disableChatGptWebSearch,
  enableChatGptWebSearch,
  openChatGptFileAttach,
  selectChatGptModel,
  toggleChatGptSidebar,
} from "./chatgpt-page-actions";
import { startGmailArchiveMode } from "./gmail-page-actions";

export const routes = [
  { name: "chatgpt.enableWebSearch", handler: enableChatGptWebSearch },
  { name: "chatgpt.disableWebSearch", handler: disableChatGptWebSearch },
  { name: "chatgpt.toggleSidebar", handler: toggleChatGptSidebar },
  { name: "chatgpt.selectModel", handler: selectChatGptModel },
  { name: "chatgpt.openFileAttach", handler: openChatGptFileAttach },
  { name: "gmail.archive", handler: startGmailArchiveMode },
] as const satisfies readonly RpcRoute[];
