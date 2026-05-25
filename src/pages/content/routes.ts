import type { RpcRoute } from "@core/rpc";

import {
  disableChatGptWebSearch,
  enableChatGptWebSearch,
  openChatGptFileAttach,
  selectChatGptModel,
  stopChatGptGeneration,
  toggleChatGptSidebar,
} from "./chatgpt-page-actions";
import { selectClaudeModel, stopClaudeGeneration } from "./claude-page-actions";
import {
  openGeminiFileAttach,
  selectGeminiModel,
  stopGeminiGeneration,
  toggleGeminiSidebar,
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
  { name: "gemini.toggleSidebar", handler: toggleGeminiSidebar },
  { name: "gemini.stopGeneration", handler: stopGeminiGeneration },
  { name: "gemini.openFileAttach", handler: openGeminiFileAttach },
  { name: "gemini.selectModel", handler: selectGeminiModel },
  { name: "rovo.stopGeneration", handler: stopRovoGeneration },
  { name: "rovo.selectModel", handler: selectRovoModel },
  { name: "claude.selectModel", handler: selectClaudeModel },
  { name: "claude.stopGeneration", handler: stopClaudeGeneration },
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
