import type { RpcRoute } from "@core/rpc";

import {
  disableChatGptWebSearch,
  enableChatGptWebSearch,
  openChatGptFileAttach,
  selectChatGptModel,
  stopChatGptGeneration,
  toggleChatGptSidebar,
} from "./chatgpt-page-actions";
import {
  openGeminiFileUpload,
  stopGeminiGeneration,
} from "./gemini-page-actions";
import { startGmailArchiveMode } from "./gmail-page-actions";

export const routes = [
  { name: "chatgpt.enableWebSearch", handler: enableChatGptWebSearch },
  { name: "chatgpt.disableWebSearch", handler: disableChatGptWebSearch },
  { name: "chatgpt.toggleSidebar", handler: toggleChatGptSidebar },
  { name: "chatgpt.selectModel", handler: selectChatGptModel },
  { name: "chatgpt.openFileAttach", handler: openChatGptFileAttach },
  { name: "chatgpt.stopGeneration", handler: stopChatGptGeneration },
  { name: "gemini.stopGeneration", handler: stopGeminiGeneration },
  { name: "gemini.openFileUpload", handler: openGeminiFileUpload },
  { name: "gmail.archive", handler: startGmailArchiveMode },
] as const satisfies readonly RpcRoute[];
