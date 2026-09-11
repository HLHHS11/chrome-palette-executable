import { HotkeyLauncher } from "@core/hotkey";
import { registerRoutes } from "@core/rpc";
import { bindTabMemo } from "@pages/tab-memo/background";
import { bindTabRetention } from "@pages/tab-retention/background";

import { tabSearchHotkey } from "~/commands/tab-search/launch";

import { bindNotificationClickHandler } from "./notification";
import { backgroundRoutes } from "./routes";
import { bindTabNumberingAutoHide } from "./tab-numbering";

registerRoutes(backgroundRoutes);
bindNotificationClickHandler();
bindTabNumberingAutoHide();
bindTabRetention();
bindTabMemo();

const hotkeyLauncher = new HotkeyLauncher();
hotkeyLauncher.register(tabSearchHotkey);
hotkeyLauncher.start();
