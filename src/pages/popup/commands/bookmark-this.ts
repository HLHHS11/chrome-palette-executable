import type { Command } from "@core/command";

import { createLazyResource, matchCommand, setInput } from "~/util/signals";

import { faviconURL } from "../Entry";

export const BOOKMARK_THIS_KEYWORD = "bt";

const traverse = (
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  breadcrumb = ""
): Command[] => {
  return nodes.flatMap(({ id, children, url, title, dateAdded }) => {
    const path = breadcrumb ? breadcrumb + " / " + title : title;
    const list: Command[] = [];
    if (!url && path !== "") {
      list.push({
        title: path,
        icon: faviconURL("chrome://favicon/"),
        lastVisitTime: dateAdded,
        handler: async function () {
          const [tab] = await chrome.tabs.query({
            currentWindow: true,
            active: true,
          });
          await chrome.bookmarks.create({
            index: 0,
            url: tab.url,
            title: tab.title,
            parentId: id,
          });
          window.close();
        },
      });
    }
    if (children) {
      list.push(...traverse(children, path));
    }
    return list;
  });
};

const base: Command[] = [
  {
    title: "Bookmark this tab",
    handler: async function () {
      setInput(BOOKMARK_THIS_KEYWORD + ">");
    },
    keyword: BOOKMARK_THIS_KEYWORD + ">",
  },
];

const commands = createLazyResource([], async () => {
  const root = await chrome.bookmarks.getTree();
  return traverse(root);
});

export default function bookmarkThisSuggestions(): Command[] {
  if (matchCommand(BOOKMARK_THIS_KEYWORD).isMatch) return commands();
  return base;
}
