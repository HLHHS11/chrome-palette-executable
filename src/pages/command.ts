import type { Command, LegacyCommand } from "./core/command";
import audibleTabSuggestions from "./popup/commands/audio";
import bookmarkThisSuggestions from "./popup/commands/bookmark-this";
import bookmarkSuggestions from "./popup/commands/bookmarks";
import extenionsSuggestions from "./popup/commands/extensions";
import geminiSuggestions from "./popup/commands/gemini";
import generalSuggestions from "./popup/commands/general";
import gmailSuggestions from "./popup/commands/gmail";
import historySuggestions from "./popup/commands/history";
import tabSearchSuggestions from "./popup/commands/tab-search";
import switchTabSuggestions from "./popup/commands/tabs";
import themeSuggestions from "./popup/commands/themes";
import utilsCopyTabLinkSuggestions from "./popup/commands/utils-copy-tab-link";
import utilsNotificationSuggestions from "./popup/commands/utils-notification";
import websitesSuggestions from "./popup/commands/website-search";
import youtubeSuggestions from "./popup/commands/youtube";
import { listRpcCommands } from "./rpc-command";

/**
 * @deprecated Command がレガシー定義に基づいているため。
 */
export function listLegacyCommands(pageUrl: URL | undefined): LegacyCommand[] {
  return [
    ...generalSuggestions(),
    ...audibleTabSuggestions(),
    ...bookmarkThisSuggestions(),
    ...switchTabSuggestions(),
    ...tabSearchSuggestions(),
    ...historySuggestions(),
    ...bookmarkSuggestions(),
    ...extenionsSuggestions(),
    ...geminiSuggestions(pageUrl),
    ...gmailSuggestions(pageUrl),
    ...youtubeSuggestions(pageUrl),
    ...websitesSuggestions(),
    ...themeSuggestions(),
    ...utilsCopyTabLinkSuggestions(),
    ...utilsNotificationSuggestions(),
  ];
}

export function listAllCommands(pageUrl: URL | undefined): Command[] {
  return [...listLegacyCommands(pageUrl), ...listRpcCommands(pageUrl)];
}
