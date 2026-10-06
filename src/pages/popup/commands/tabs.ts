import type { Command } from "@core/command";
import { createRuntimeRpcClient } from "@core/rpc";
import type { MemoColor } from "@pages/memo";
import { formatRemainingRough } from "@pages/timer";
import { backgroundRoutes } from "@src/pages/background/routes";

import niceUrl from "~/util/nice-url";
import { createLazyResource, matchCommand, setInput } from "~/util/signals";

import { faviconURL } from "../Entry";

const callRuntimeRpc = createRuntimeRpcClient<typeof backgroundRoutes>();

const KEYWORD = "t";

type MemoInfo = { text: string; color: MemoColor };

/** メモ取得に失敗してもタブ一覧は出したいので、空マップに落とす。 */
async function loadMemosByTabId(): Promise<Map<number, MemoInfo>> {
  const response = await callRuntimeRpc({ name: "memo.list" }).catch(
    () => undefined
  );
  if (!response?.ok || !("data" in response)) return new Map();
  return new Map(
    response.data.memos.map(({ tabId, text, color }) => [
      tabId,
      { text, color },
    ])
  );
}

/** 直近の期限だけを見せる。同じタブに複数あっても、次に鳴るものが分かれば足りる。 */
async function loadNextDeadlineByTabId(): Promise<Map<number, number>> {
  const response = await callRuntimeRpc({ name: "timer.listAll" }).catch(
    () => undefined
  );
  if (!response?.ok || !("data" in response)) return new Map();
  const nearest = new Map<number, number>();
  for (const { tabId, timer } of response.data.entries) {
    if (tabId === undefined || timer.status !== "pending") continue;
    const known = nearest.get(tabId);
    if (known === undefined || timer.deadline < known) {
      nearest.set(tabId, timer.deadline);
    }
  }
  return nearest;
}

const commands = createLazyResource<Command[]>([], async () => {
  const [allTabs, memosByTabId, deadlineByTabId] = await Promise.all([
    chrome.tabs.query({}),
    loadMemosByTabId(),
    loadNextDeadlineByTabId(),
  ]);
  const now = Date.now();
  return allTabs.map(({ title, url, id, windowId }) => {
    url ||= "";
    const deadline = id === undefined ? undefined : deadlineByTabId.get(id);
    const reminder =
      deadline === undefined
        ? ""
        : ` · ${formatRemainingRough(deadline - now)}にリマインド`;
    const memo = id === undefined ? undefined : memosByTabId.get(id);
    return {
      title: title || "Untitled",
      subtitle: `${niceUrl(url)}${reminder}`,
      icon: faviconURL(url),
      memo: memo?.text,
      memoColor: memo?.color,
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
