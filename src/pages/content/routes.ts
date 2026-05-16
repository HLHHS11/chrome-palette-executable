import type { RpcRoute } from "@core/rpc";

import {
  disableChatGptWebSearch,
  enableChatGptWebSearch,
  openChatGptFileAttach,
  selectChatGptModel,
  stopChatGptGeneration,
  toggleChatGptSidebar,
} from "./chatgpt-page-actions";
import { selectClaudeModel } from "./claude-page-actions";
import {
  openGeminiFileUpload,
  selectGeminiModel,
  stopGeminiGeneration,
} from "./gemini-page-actions";
import { startGmailArchiveMode } from "./gmail-page-actions";
import { exportGoogleDocsAsMarkdown } from "./google-docs-page-actions";
import { getSelectionTextDirective } from "./link-copy-page-actions";
import { selectRovoModel, stopRovoGeneration } from "./rovo-page-actions";
import {
  applyTabNumberingTitle,
  restoreTabNumberingTitle,
} from "./tab-numbering";
import { getPageText } from "./tab-search-page-actions";

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
  { name: "rovo.stopGeneration", handler: stopRovoGeneration },
  { name: "rovo.selectModel", handler: selectRovoModel },
  { name: "claude.selectModel", handler: selectClaudeModel },
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
  { name: "tabSearch.getPageText", handler: getPageText },
] as const satisfies readonly RpcRoute[];
