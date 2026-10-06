import type { Command } from "@pages/core/command";

import { createLazyResource, matchCommand, setInput } from "~/util/signals";

import { faviconURL } from "../Entry";

export const BOOKMARKS_KEYWORD = "b";

const traverse = (
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  breadcrumb = ""
): Command[] => {
  return nodes
    .sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0))
    .flatMap(({ children, url, title, dateAdded }) => {
      const path = breadcrumb ? breadcrumb + "/" + title : title;
      if (children) {
        return traverse(children, path);
      }
      url ||= "";
      return {
        title: `${title} > ${breadcrumb}`,
        icon: faviconURL(url),
        lastVisitTime: dateAdded,
        url,
      };
    });
};
const commands = createLazyResource([], async () => {
  ("fetching bookmarks");
  const root = await chrome.bookmarks.getTree();
  return traverse(root);
});

const base: Command[] = [
  {
    title: "Search Bookmarks",
    handler: async function () {
      setInput(BOOKMARKS_KEYWORD + ">");
    },
    icon: faviconURL("chrome://bookmarks/"),
    keyword: BOOKMARKS_KEYWORD + ">",
  },
];
export default function bookmarkSuggestions(): Command[] {
  if (matchCommand(BOOKMARKS_KEYWORD).isMatch) return commands();
  return base;
}
