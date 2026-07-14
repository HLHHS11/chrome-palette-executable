import { assignDuplicateHighlightColors } from "@core/command";

import { faviconURL } from "~/util/favicon";

import type { VerticalTabItem } from "./types";

function pickTabNumberForIndex(idx: number, total: number): number | null {
  if (idx < 8) return idx + 1;
  if (idx === total - 1) return 9;
  return null;
}

export async function collectCurrentWindowVerticalTabs(): Promise<
  VerticalTabItem[]
> {
  return collectVerticalTabs();
}

export async function collectVerticalTabs(
  params: {
    windowId?: number;
  } = {}
): Promise<VerticalTabItem[]> {
  const windowId =
    params.windowId ??
    (await chrome.tabs
      .query({
        active: true,
        lastFocusedWindow: true,
      })
      .then(([activeTab]) => activeTab?.windowId));
  if (windowId === undefined) {
    return [];
  }

  const tabs = await chrome.tabs.query({ windowId });
  const collapsedGroupIds = await chrome.tabGroups
    .query({ windowId, collapsed: true })
    .then((groups) => new Set(groups.map((g) => g.id)))
    .catch(() => new Set<number>());

  const visibleTabs = tabs
    .slice()
    .sort((a, b) => a.index - b.index)
    .filter((tab) => !collapsedGroupIds.has(tab.groupId));

  const duplicateColorByUrl = assignDuplicateHighlightColors(
    visibleTabs.map((tab) => tab.url ?? "")
  );

  const items: VerticalTabItem[] = [];
  visibleTabs.forEach((tab, idx) => {
    if (tab.id === undefined || tab.windowId === undefined) return;
    const url = tab.url ?? "";
    items.push({
      tabId: tab.id,
      windowId: tab.windowId,
      title: tab.title || "Untitled",
      url,
      faviconUrl: faviconURL(url),
      shortcutNumber: pickTabNumberForIndex(idx, visibleTabs.length),
      duplicateHighlightColor: duplicateColorByUrl.get(url) ?? null,
    });
  });
  return items;
}
