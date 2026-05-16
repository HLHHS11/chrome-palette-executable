import type { Command } from "@core/command";
import type { HighlightSpec } from "@core/search";

import { createLazyResource, matchCommand, setInput } from "~/util/signals";

import { faviconURL } from "../../Entry";
import { collectTabSnapshots } from "./collect-tab-snapshots";
import { type CachedHit, loadFreshCache, saveCache } from "./result-cache";
import { tabContentSearcher } from "./tab-content-searcher";
import type { TabSnapshot } from "./types";

/**
 * Cross-Tab Full-Text Search のコマンドパレットキーワード。
 *
 * App.tsx 側でも参照しており、このキーワードが入力されているときは
 * palette の汎用 fuzzysort searcher をスキップする。
 * 理由: tab-search の Searcher は本文中心のスコアリングを既に終えており、
 * 上から title/subtitle/url ベースの fuzzysort を重ねるとヒットが消えてしまう。
 *
 * TODO: FIX #2
 * この機能は本来 "Command" ではなく独立した Palette Surface
 * として実装されるべき (App.tsx の TODO: FIX #2 コメント参照)。現在は Command 型へ
 * 無理やり詰め込む形になっており、`makeTabCommand` で handler に挙動を埋め込んだり、
 * App.tsx 側で `s>` モードを特別扱いして palette searcher を skip したりしている。
 * Surface 抽象を導入したらここは `TabSearchSurface` に格上げし、Command 経由ではなく
 * 独自の結果型 (TabSearchResult) + 独自の Entry 風コンポーネントを Shell に描画させる。
 */
export const TAB_SEARCH_KEYWORD = "s";
const KEYWORD = TAB_SEARCH_KEYWORD;

/**
 * 全タブのスナップショット (本文 + メタ情報) を popup 起動時に 1 度だけ取得。
 * `createLazyResource` の挙動: 最初の呼び出しで非同期 fetch を発火し、以降は最新値を返す。
 */
const snapshotsResource = createLazyResource<TabSnapshot[]>([], () =>
  collectTabSnapshots()
);

/**
 * モジュールスコープの「直近検索結果」キャッシュ。
 *
 * - `chrome.storage.session` への永続化は別途行う ({@link saveCache}/{@link loadFreshCache})。
 * - ここの変数は、現在の popup セッション内で再レンダリング間で再利用するため。
 * - `tabSearchSuggestions` 内から書き換える (Solid の memo 内副作用だが冪等なので OK)。
 */
let cachedHits: CachedHit[] | null = null;
let cachedQuery: string | null = null;

let cacheRestoreStarted = false;
function startCacheRestoreOnce(): void {
  if (cacheRestoreStarted) return;
  cacheRestoreStarted = true;
  loadFreshCache().then((cache) => {
    if (!cache) {
      console.log("[tabsearch][popup] cache restore: no fresh cache");
      return;
    }
    cachedHits = cache.hits;
    cachedQuery = cache.query;
    console.log("[tabsearch][popup] cache restore: restored", {
      query: cache.query,
      hitCount: cache.hits.length,
      ageMs: Date.now() - cache.computedAt,
    });
    // setInput が input 欄を書き換え、parsedInput memo を経由して
    // `s>` モードへスイッチ + 再描画が走る。
    setInput(`${KEYWORD}>${cache.query}`);
  });
}

function makeTabCommand(
  snap: Pick<
    TabSnapshot,
    "tabId" | "windowId" | "title" | "url" | "host" | "path" | "favicon"
  >,
  highlights: HighlightSpec | undefined
): Command {
  return {
    title: snap.title,
    subtitle: snap.host + snap.path,
    icon: snap.favicon,
    url: snap.url,
    highlights,
    handler: () => {
      chrome.tabs.update(snap.tabId, { active: true });
      chrome.windows.update(snap.windowId, { focused: true });
      window.close();
    },
  };
}

const entryCommand: Command = {
  title: "Search across tabs",
  subtitle: "全タブ横断で本文を検索",
  keyword: `${KEYWORD}>`,
  icon: faviconURL("about:blank"),
  handler: () => {
    setInput(`${KEYWORD}>`);
  },
};

const loadingCommand: Command = {
  title: "Searching across tabs…",
  subtitle: "タブ本文を収集中",
  icon: faviconURL("about:blank"),
  handler: () => {
    /* no-op */
  },
};

/**
 * `s>` モードの検索結果を Command[] として返す。`s>` モード外では入口コマンド 1 件だけ。
 *
 * - キャッシュヒット (cachedQuery と一致): 即座にキャッシュから commands を組み立てる。
 *   ポップアップ再オープン時の高速復元用。
 * - キャッシュミス: snapshots を使ってライブ検索 → 結果をキャッシュ。snapshots がまだ
 *   ロード中 (= 空配列) の間は "Searching…" プレースホルダ。
 */
export default function tabSearchSuggestions(): Command[] {
  startCacheRestoreOnce();
  const { isMatch, isCommand, query } = matchCommand(KEYWORD);
  if (!isMatch) {
    // 他のキーワードコマンドモード中は何も出さない。通常時は入口だけ。
    return isCommand ? [] : [entryCommand];
  }

  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  if (cachedQuery === trimmed && cachedHits !== null) {
    console.log("[tabsearch][popup] serving from cache", {
      query: trimmed,
      hitCount: cachedHits.length,
    });
    return cachedHits.map((h) => makeTabCommand(h, h.highlights));
  }

  const snaps = snapshotsResource();
  if (snaps.length === 0) {
    console.log("[tabsearch][popup] snapshots not ready, showing loading");
    return [loadingCommand];
  }

  console.log("[tabsearch][popup] running live search", {
    query: trimmed,
    snapCount: snaps.length,
  });
  const hits = tabContentSearcher.run(trimmed, snaps);

  const toCache: CachedHit[] = hits.map(({ item, score, highlights }) => ({
    tabId: item.tabId,
    windowId: item.windowId,
    title: item.title,
    url: item.url,
    host: item.host,
    path: item.path,
    favicon: item.favicon,
    score,
    highlights,
  }));
  cachedHits = toCache;
  cachedQuery = trimmed;
  saveCache(trimmed, toCache);

  return hits.map(({ item, highlights }) => makeTabCommand(item, highlights));
}
