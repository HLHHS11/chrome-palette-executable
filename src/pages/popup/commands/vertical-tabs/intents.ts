import { defineCrossRuntimeMessage } from "@core/cross-runtime-message";

export type VerticalTabsLaunchIntent = {
  source: "ephemeral";
  requestId?: string;
  windowId?: number;
};

export const verticalTabsLaunchIntentMessage =
  defineCrossRuntimeMessage<VerticalTabsLaunchIntent>(
    "vertical-tabs-launch-intent"
  );

export type VerticalTabsCloseIntent = {
  source: "ephemeral";
  requestId?: string;
  reason?: "superseded" | "manual";
};

export const verticalTabsCloseIntentMessage =
  defineCrossRuntimeMessage<VerticalTabsCloseIntent>(
    "vertical-tabs-close-intent"
  );
