import type { Command, PaletteRow } from "@core/command";
import { CrossRuntimeMessenger } from "@core/cross-runtime-message";

import { matchCommand, setInput } from "~/util/signals";

import { faviconURL } from "../../Entry";
import { hotkeyLaunchIntentMessage } from "./hotkey-launch-intent";
import { ResultCacheStore } from "./result-cache";
import { TabSearchRunner } from "./search-runner";
import type { TabSnapshot } from "./types";

export { collectTabSnapshots } from "./collect-tab-snapshots";
export type { TabSnapshot } from "./types";

export const TAB_SEARCH_KEYWORD = "s";

const entryCommand: Command = {
  title: "Search across tabs",
  subtitle: "全タブ横断で本文を検索",
  keyword: `${TAB_SEARCH_KEYWORD}>`,
  icon: faviconURL("about:blank"),
  handler: () => {
    setInput(`${TAB_SEARCH_KEYWORD}>`);
  },
};

type Deps = {
  corpus: () => readonly TabSnapshot[];
};

/**
 * tab-search 機能の外部ファサード。内部の Store / Runner / 起動シーケンスを束ね、
 * 外には `restoreSession()` と `search(query)` だけを見せる。
 * Solid 等のフロントエンド都合は持ち込まないので、corpus accessor だけ外から注入する。
 */
export class TabSearch {
  private readonly messenger = new CrossRuntimeMessenger();
  private readonly cache = new ResultCacheStore();
  private readonly runner: TabSearchRunner;

  constructor({ corpus }: Deps) {
    this.runner = new TabSearchRunner({
      ofSource: corpus,
      cacheStore: this.cache,
    });
  }

  /**
   * popup 起動直後のセッション復元フェーズ。
   * - 直近 60 秒以内に保存されたキャッシュがあれば、結果と入力欄に流し込む
   * - background から hotkey 経由で開かれた場合、入力欄を `s>` に切り替える
   */
  restoreSession(): void {
    this.messenger
      .take(hotkeyLaunchIntentMessage)
      .then((intent) => {
        if (intent) setInput(`${TAB_SEARCH_KEYWORD}>`);
      })
      .catch((e) => {
        console.error(
          "Failed to take tab-search hotkey launch intent. Details:",
          e
        );
      });

    this.cache
      .loadFresh()
      .then((restored) => {
        if (!restored) return;
        this.runner.primeFromCache(restored.hits, restored.query);
        setInput(`${TAB_SEARCH_KEYWORD}>${restored.query}`);
      })
      .catch((e) => {
        console.error("Failed to restore tab-search session. Details:", e);
      });
  }

  /** クエリに対してインクリメンタル検索を実行し、結果を palette 行として返す。 */
  search(query: string): PaletteRow[] {
    return this.runner.run(query);
  }
}

/**
 * パレットへの入口コマンドのみを返す。`s>` モードの検索結果は別経路で描画される。
 *
 * TODO: #2 FIX
 * 本来 Surface 抽象に格上げするべきで、その際は entryCommand すら不要になる。
 */
export default function tabSearchSuggestions(): Command[] {
  const { isMatch, isCommand } = matchCommand(TAB_SEARCH_KEYWORD);
  if (isMatch) return [];
  return isCommand ? [] : [entryCommand];
}
