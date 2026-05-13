import { registerRoutes } from "@core/rpc";

import { bindNotificationClickHandler } from "./notification";
import { backgroundRoutes } from "./routes";
import { bindTabNumberingAutoHide } from "./tab-numbering";

registerRoutes(backgroundRoutes);
bindNotificationClickHandler();
bindTabNumberingAutoHide();

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
