import { defineCrossRuntimeMessage } from "@core/cross-runtime-message";

import type { TabRetentionLaunchIntent } from "./types";

export const tabRetentionLaunchIntentMessage =
  defineCrossRuntimeMessage<TabRetentionLaunchIntent>(
    "tab-retention-launch-intent"
  );
