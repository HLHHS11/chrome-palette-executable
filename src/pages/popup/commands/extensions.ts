import type { Command } from "@core/command";

import { createLazyResource, matchCommand, setInput } from "~/util/signals";

import { faviconURL } from "../Entry";

export const EXTENSIONS_KEYWORD = "e";

const commands = createLazyResource<Command[]>([], async (_setVal) => {
  return (await chrome.management.getAll()).map(
    ({ name, icons, id, enabled, version, description }) => {
      return {
        title: `${name} (${version})`,
        subtitle: description,
        icon:
          icons
            ?.map((o) => o?.url)
            .filter(Boolean)
            .at(-1) ?? "chrome://extensions/",
        url: `chrome://extensions/?id=${id}`,
        enabled,
      };
    }
  );
});

const base: Command[] = [
  {
    title: "Search Extensions",
    icon: faviconURL("chrome://extensions/"),
    handler: async function () {
      setInput(EXTENSIONS_KEYWORD + ">");
    },
    keyword: EXTENSIONS_KEYWORD + ">",
  },
];

export default function extensionSuggestions(): Command[] {
  if (matchCommand(EXTENSIONS_KEYWORD).isMatch) return commands();
  return base;
}
