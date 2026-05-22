import { HotkeyLauncher } from "@core/hotkey";
import { registerRoutes } from "@core/rpc";

import { tabSearchHotkey } from "~/commands/tab-search/launch";

import { bindNotificationClickHandler } from "./notification";
import { backgroundRoutes } from "./routes";
import { bindTabNumberingAutoHide } from "./tab-numbering";

registerRoutes(backgroundRoutes);
bindNotificationClickHandler();
bindTabNumberingAutoHide();

const hotkeyLauncher = new HotkeyLauncher();
hotkeyLauncher.register(tabSearchHotkey);
hotkeyLauncher.start();

chrome.alarms.onAlarm.addListener((alarm) => {
  console.log({ alarm }, new Date());
});

chrome.alarms.create("watchdog", {
  delayInMinutes: 0,
  periodInMinutes: 1,
});

chrome.alarms.create("watchdog2", {
  delayInMinutes: 0.5,
  periodInMinutes: 1,
});
