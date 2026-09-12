import type { Command } from "@core/command";
import { createRuntimeRpcClient } from "@core/rpc";
import { backgroundRoutes } from "@src/pages/background/routes";

import niceUrl from "~/util/nice-url";
import { createLazyResource, matchCommand, setInput } from "~/util/signals";

import { faviconURL } from "../Entry";

const callRuntimeRpc = createRuntimeRpcClient<typeof backgroundRoutes>();

const KEYWORD = "t";

/** メモ取得に失敗してもタブ一覧は出したいので、空マップに落とす。 */
async function loadMemosByTabId(): Promise<Map<number, string>> {
  const response = await callRuntimeRpc({ name: "memo.list" }).catch(
    () => undefined
  );
  if (!response?.ok || !("data" in response)) return new Map();
  return new Map(response.data.memos.map(({ tabId, text }) => [tabId, text]));
}

const commands = createLazyResource<Command[]>([], async () => {
  const [allTabs, memosByTabId] = await Promise.all([
    chrome.tabs.query({}),
    loadMemosByTabId(),
  ]);
  return allTabs.map(({ title, url, id, windowId }) => {
    url ||= "";
    return {
      title: title || "Untitled",
      subtitle: niceUrl(url),
      icon: faviconURL(url),
      memo: id === undefined ? undefined : memosByTabId.get(id),
      handler: () => {
        chrome.tabs.update(id!, { highlighted: true });
        chrome.windows.update(windowId!, { focused: true });
        window.close();
      },
    } satisfies Command;
  });
});

const base: Command[] = [
  {
    title: "Search Tabs",
    handler: async function () {
      setInput(KEYWORD + ">");
    },
    keyword: KEYWORD + ">",
    icon: faviconURL("about:blank"),
  },
  {
    title: "タブに番号を表示",
    subtitle: "Show Tab Numbers",
    handler: async () => {
      await callRuntimeRpc({
        name: "tabNumbering.show",
        timeoutMs: 5000,
      });
      window.close();
    },
  },
];

export default function switchTabSuggestions(): Command[] {
  const { isMatch, isCommand } = matchCommand(KEYWORD);
  if (isMatch) return commands();
  if (isCommand) return [];
  return base;
}
