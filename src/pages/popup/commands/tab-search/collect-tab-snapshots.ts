import { createTabsRpcClient } from "@core/rpc";
import { routes as contentRoutes } from "@pages/content/routes";

import { faviconURL } from "../../Entry";
import type { TabSnapshot } from "./types";

const callContentRpc = createTabsRpcClient<typeof contentRoutes>();

/**
 * 全タブを並列に走査し、各タブの本文 + メタ情報のスナップショットを返す。
 *
 * - content script への RPC 経由で本文を取得する。`content_scripts.matches: ["<all_urls>"]` で
 *   宣言注入される範囲のページならリロード後に届く。`host_permissions` は不要。
 * - 注入不能 (`chrome://` 等) や、拡張機能リロード以降にロードされていないタブは
 *   `sendMessage` が失敗するので、`reachable: false` で title / URL のみのスナップショット扱いに。
 * - 結果順は `chrome.tabs.query({})` の返却順 (= タブの index 順) に従う。
 */
export async function collectTabSnapshots(): Promise<TabSnapshot[]> {
  const startedAt = performance.now();
  const tabs = await chrome.tabs.query({});
  console.log("[tabsearch][popup] collectTabSnapshots: querying tabs", {
    tabCount: tabs.length,
  });

  const snapshots = await Promise.all(
    tabs.map(async (tab): Promise<TabSnapshot | null> => {
      if (tab.id === undefined || tab.windowId === undefined) return null;
      const url = tab.url || "";
      const title = tab.title || "Untitled";
      const { host, path } = (() => {
        try {
          const u = new URL(url);
          return { host: u.hostname, path: u.pathname + u.search + u.hash };
        } catch {
          return { host: "", path: url };
        }
      })();

      let rpcError: unknown = null;
      const rpcResult = await callContentRpc(
        { name: "tabSearch.getPageText" },
        { tabId: tab.id }
      ).catch((e) => {
        rpcError = e;
        return null;
      });

      const text =
        rpcResult && rpcResult.ok && "data" in rpcResult
          ? rpcResult.data.text
          : "";
      const reachable = rpcResult !== null;

      console.log("[tabsearch][popup] tab snapshot", {
        tabId: tab.id,
        title,
        url,
        status: tab.status,
        discarded: tab.discarded,
        reachable,
        textLength: text.length,
        rpcError: rpcError ? String(rpcError) : null,
      });
      // 本文が取れたタブはフル本文も別行で吐く。
      // DevTools 上で text 全体をコピーして、ユーザが期待するワードが
      // 本当に含まれているかを目視 grep できるようにするため。
      if (text.length > 0) {
        console.log(
          "[tabsearch][popup] FULL TEXT BEGIN tabId=" +
            tab.id +
            " url=" +
            url +
            "\n" +
            text +
            "\n[tabsearch][popup] FULL TEXT END tabId=" +
            tab.id
        );
      }

      return {
        tabId: tab.id,
        windowId: tab.windowId,
        title,
        url,
        host,
        path,
        text,
        reachable,
        favicon: faviconURL(url),
      };
    })
  );

  const result = snapshots.filter((s): s is TabSnapshot => s !== null);
  const reachableCount = result.filter((s) => s.reachable).length;
  const withTextCount = result.filter((s) => s.text.length > 0).length;
  console.log("[tabsearch][popup] collectTabSnapshots: done", {
    elapsedMs: Math.round(performance.now() - startedAt),
    totalTabs: result.length,
    reachableCount,
    withTextCount,
    unreachableSamples: result
      .filter((s) => !s.reachable)
      .slice(0, 5)
      .map((s) => s.url),
  });
  return result;
}
