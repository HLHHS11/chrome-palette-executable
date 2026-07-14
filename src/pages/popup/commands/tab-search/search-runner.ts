import {
  type DuplicateHighlightColor,
  type PaletteRow,
  assignDuplicateHighlightColors,
} from "@core/command";
import type { HighlightSpec } from "@core/search";

import { faviconURL } from "../../Entry";
import { type CachedHit, ResultCacheStore } from "./result-cache";
import { tabContentSearcher } from "./tab-content-searcher";
import type { TabSnapshot } from "./types";

function makeTabRow(
  snap: Pick<
    TabSnapshot,
    "tabId" | "windowId" | "title" | "host" | "path" | "favicon"
  >,
  highlights: HighlightSpec | undefined,
  duplicateHighlightColor: DuplicateHighlightColor | undefined
): PaletteRow {
  // `url` をセットしない理由:
  // - Command.url があると runCommand が `chrome.tabs.create({url})` で新規タブを開いてしまう
  //   (意図は既存タブにフォーカスするだけ)
  // - 表示上も subtitle と URL 行で同じ URL が二重に出てしまう
  return {
    title: snap.title,
    subtitle: snap.host + snap.path,
    icon: snap.favicon,
    highlights,
    duplicateHighlightColor,
    handler: () => {
      chrome.tabs.update(snap.tabId, { active: true });
      chrome.windows.update(snap.windowId, { focused: true });
      window.close();
    },
  };
}

type Deps = {
  ofSource: () => readonly TabSnapshot[];
  cacheStore: ResultCacheStore;
};

/**
 * クエリと snapshots から検索結果 Command[] を返すランナー。
 * 同一クエリの再計算を避ける in-memory メモは instance 内に閉じる。
 * snapshots 取得元は外部から関数で注入するため、Solid / その他フレームワークに依存しない。
 */
export class TabSearchRunner {
  private cachedHits: CachedHit[] | null = null;
  private cachedQuery: string | null = null;
  private readonly snapshots: () => readonly TabSnapshot[];
  private readonly cache: ResultCacheStore;

  constructor({ ofSource, cacheStore }: Deps) {
    this.snapshots = ofSource;
    this.cache = cacheStore;
  }

  primeFromCache(hits: CachedHit[], query: string): void {
    this.cachedHits = hits;
    this.cachedQuery = query;
  }

  run(query: string): PaletteRow[] {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];

    if (this.cachedQuery === trimmed && this.cachedHits !== null) {
      const colorByUrl = assignDuplicateHighlightColors(
        this.cachedHits.map((h) => h.url)
      );
      return this.cachedHits.map((h) =>
        makeTabRow(h, h.highlights, colorByUrl.get(h.url))
      );
    }

    const snaps = this.snapshots();
    if (snaps.length === 0) {
      const loadingRow: PaletteRow = {
        title: "Searching across tabs…",
        subtitle: "タブ本文を収集中",
        icon: faviconURL("about:blank"),
        handler: () => {
          // DO NOTHING
        },
      };
      return [loadingRow];
    }

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
    this.cachedHits = toCache;
    this.cachedQuery = trimmed;
    this.cache.save(trimmed, toCache);

    const colorByUrl = assignDuplicateHighlightColors(
      hits.map(({ item }) => item.url)
    );
    return hits.map(({ item, highlights }) =>
      makeTabRow(item, highlights, colorByUrl.get(item.url))
    );
  }
}
