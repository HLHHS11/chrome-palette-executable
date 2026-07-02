import type { Command } from "@core/command";

import { matchCommand, setInput } from "~/util/signals";

import { faviconURL } from "../../util/favicon";

export {
  collectCurrentWindowVerticalTabs,
  collectVerticalTabs,
} from "./collect-current-window-tabs";
export {
  verticalTabsCloseIntentMessage,
  verticalTabsLaunchIntentMessage,
} from "./intents";
export type {
  VerticalTabsCloseIntent,
  VerticalTabsLaunchIntent,
} from "./intents";
export type { VerticalTabItem } from "./types";
export { default as VerticalTabsView } from "./VerticalTabsView";

export const VERTICAL_TABS_KEYWORD = "vt";

const entryCommand: Command = {
  title: "Vertical Tabs",
  subtitle: "現在のウィンドウのタブを縦リスト表示",
  keyword: `${VERTICAL_TABS_KEYWORD}>`,
  icon: faviconURL("about:blank"),
  handler: () => {
    setInput(`${VERTICAL_TABS_KEYWORD}>`);
  },
};

export default function verticalTabsSuggestions(): Command[] {
  const { isCommand } = matchCommand(VERTICAL_TABS_KEYWORD);
  if (isCommand) return [];
  return [entryCommand];
}
