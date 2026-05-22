import { CrossRuntimeMessenger } from "@core/cross-runtime-message";
import { CommandRegistration } from "@core/hotkey";

import { hotkeyLaunchIntentMessage } from "./hotkey-launch-intent";

export const tabSearchHotkey: CommandRegistration = {
  // NOTE: manifest.commands["search-across-tabs"] と整合。
  hotkeyName: "search-across-tabs",
  handler: async () => {
    try {
      const messenger = new CrossRuntimeMessenger();
      await messenger.send(hotkeyLaunchIntentMessage, {
        key: "hotkey-launch-intent",
        payload: {},
      });
      await chrome.action.openPopup();
    } catch (e) {
      console.error("Failed to launch tab search via hotkey. Details:", e);
    }
  },
};
