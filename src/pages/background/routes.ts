import type { RpcRoute } from "@core/rpc";
import {
  forgetUnmatchedManualProtection,
  listTabRetentionOverview,
  restoreAutoDeletedTab,
  setTabRetentionProtection,
} from "@pages/tab-retention/background";

import { notify } from "./notification";
import { hideTabNumbers, showTabNumbers } from "./tab-numbering";
import {
  hideEphemeralVerticalTabs,
  showEphemeralVerticalTabs,
} from "./vertical-tabs";

export const backgroundRoutes = [
  {
    name: "common.notify",
    handler: notify,
  },
  {
    name: "tabNumbering.show",
    handler: showTabNumbers,
  },
  {
    name: "tabNumbering.hide",
    handler: hideTabNumbers,
  },
  {
    name: "verticalTabs.showEphemeral",
    handler: showEphemeralVerticalTabs,
  },
  {
    name: "verticalTabs.hideEphemeral",
    handler: hideEphemeralVerticalTabs,
  },
  {
    name: "tabRetention.listOverview",
    handler: listTabRetentionOverview,
  },
  {
    name: "tabRetention.setProtection",
    handler: setTabRetentionProtection,
  },
  {
    name: "tabRetention.restoreDeleted",
    handler: restoreAutoDeletedTab,
  },
  {
    name: "tabRetention.forgetUnmatchedManual",
    handler: forgetUnmatchedManualProtection,
  },
] as const satisfies readonly RpcRoute[];
