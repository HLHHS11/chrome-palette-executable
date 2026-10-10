import type { Command, LegacyCommand } from "./core/command";
import audibleTabSuggestions from "./popup/commands/audio";
import bookmarkThisSuggestions, {
  BOOKMARK_THIS_KEYWORD,
} from "./popup/commands/bookmark-this";
import bookmarkSuggestions, {
  BOOKMARKS_KEYWORD,
} from "./popup/commands/bookmarks";
import extenionsSuggestions, {
  EXTENSIONS_KEYWORD,
} from "./popup/commands/extensions";
import generalSuggestions from "./popup/commands/general";
import gmailSuggestions from "./popup/commands/gmail";
import historySuggestions, { HISTORY_KEYWORD } from "./popup/commands/history";
import memoSuggestions, {
  MEMO_ORPHAN_KEYWORD,
  MEMO_RESTORE_BULK_KEYWORD,
} from "./popup/commands/memo";
import tabRetentionSuggestions from "./popup/commands/tab-retention";
import tabSearchSuggestions from "./popup/commands/tab-search";
import switchTabSuggestions, { TABS_KEYWORD } from "./popup/commands/tabs";
import themeSuggestions, { THEME_KEYWORD } from "./popup/commands/themes";
import timerSuggestions from "./popup/commands/timer";
import utilsCopyTabLinkSuggestions from "./popup/commands/utils-copy-tab-link";
import utilsNotificationSuggestions from "./popup/commands/utils-notification";
import verticalTabsSuggestions from "./popup/commands/vertical-tabs";
import websitesSuggestions, {
  WEBSITE_SEARCH_KEYWORDS,
} from "./popup/commands/website-search";
import youtubeSuggestions from "./popup/commands/youtube";
import { parsedInput } from "./popup/util/signals";
import { listRpcCommands } from "./rpc-command";

/**
 * コマンド候補の供給元。
 *
 * `keywords` がある供給元だけが、そのキーワードモード中に呼ばれる。
 * キーワードを持たない供給元は、キーワード無しのときだけ呼ばれる。
 * 「他キーワード中は黙る」は各モジュールではなく、ここで一括して守る。
 */
type SuggestionSource = {
  keywords?: readonly string[];
  suggest: (pageUrl: URL | undefined) => Command[];
};

const suggestionSources: SuggestionSource[] = [
  { suggest: () => generalSuggestions() },
  { suggest: () => audibleTabSuggestions() },
  {
    keywords: [BOOKMARK_THIS_KEYWORD],
    suggest: () => bookmarkThisSuggestions(),
  },
  { keywords: [TABS_KEYWORD], suggest: () => switchTabSuggestions() },
  { suggest: () => verticalTabsSuggestions() },
  { suggest: () => tabSearchSuggestions() },
  { suggest: () => tabRetentionSuggestions() },
  {
    keywords: [MEMO_ORPHAN_KEYWORD, MEMO_RESTORE_BULK_KEYWORD],
    suggest: () => memoSuggestions(),
  },
  { suggest: () => timerSuggestions() },
  { keywords: [HISTORY_KEYWORD], suggest: () => historySuggestions() },
  { keywords: [BOOKMARKS_KEYWORD], suggest: () => bookmarkSuggestions() },
  { keywords: [EXTENSIONS_KEYWORD], suggest: () => extenionsSuggestions() },
  { suggest: (pageUrl) => gmailSuggestions(pageUrl) },
  { suggest: (pageUrl) => youtubeSuggestions(pageUrl) },
  {
    keywords: WEBSITE_SEARCH_KEYWORDS,
    suggest: () => websitesSuggestions(),
  },
  { keywords: [THEME_KEYWORD], suggest: () => themeSuggestions() },
  { suggest: () => utilsCopyTabLinkSuggestions() },
  { suggest: () => utilsNotificationSuggestions() },
];

function collectFromSources(
  sources: readonly SuggestionSource[],
  pageUrl: URL | undefined
): Command[] {
  return sources.flatMap((source) => source.suggest(pageUrl));
}

/**
 * @deprecated Command がレガシー定義に基づいているため。
 */
export function listLegacyCommands(pageUrl: URL | undefined): LegacyCommand[] {
  return collectFromSources(suggestionSources, pageUrl) as LegacyCommand[];
}

export function listAllCommands(pageUrl: URL | undefined): Command[] {
  const { isCommand, keyword } = parsedInput();
  if (isCommand) {
    // 今アクティブなキーワードの担当だけを呼ぶ。担当外は呼ばないので漏れない。
    return collectFromSources(
      suggestionSources.filter((source) => source.keywords?.includes(keyword)),
      pageUrl
    );
  }
  return [
    ...collectFromSources(suggestionSources, pageUrl),
    ...listRpcCommands(pageUrl),
  ];
}
