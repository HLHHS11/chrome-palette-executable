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
  selectGeminiModel,
  stopGeminiGeneration,
} from "./gemini-page-actions";
import { startGmailArchiveMode } from "./gmail-page-actions";
import { exportGoogleDocsAsMarkdown } from "./google-docs-page-actions";
import { getSelectionTextDirective } from "./link-copy-page-actions";
import {
  applyTabNumberingTitle,
  restoreTabNumberingTitle,
} from "./tab-numbering-page-actions";

export const routes = [
  { name: "chatgpt.enableWebSearch", handler: enableChatGptWebSearch },
  { name: "chatgpt.disableWebSearch", handler: disableChatGptWebSearch },
  { name: "chatgpt.toggleSidebar", handler: toggleChatGptSidebar },
  { name: "chatgpt.selectModel", handler: selectChatGptModel },
  { name: "chatgpt.openFileAttach", handler: openChatGptFileAttach },
  { name: "chatgpt.stopGeneration", handler: stopChatGptGeneration },
  { name: "gemini.stopGeneration", handler: stopGeminiGeneration },
  { name: "gemini.openFileUpload", handler: openGeminiFileUpload },
  { name: "gemini.selectModel", handler: selectGeminiModel },
  { name: "gmail.archive", handler: startGmailArchiveMode },
  { name: "googleDocs.exportAsMarkdown", handler: exportGoogleDocsAsMarkdown },
  {
    name: "linkCopy.getSelectionTextDirective",
    handler: getSelectionTextDirective,
  },
  {
    name: "tabNumbering.applyTitleInFrame",
    handler: applyTabNumberingTitle,
  },
  {
    name: "tabNumbering.restoreTitleInFrame",
    handler: restoreTabNumberingTitle,
  },
] as const satisfies readonly RpcRoute[];
