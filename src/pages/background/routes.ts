import type { RpcRoute } from "@core/rpc";
import {
  adoptOrphanTabMemo,
  forgetOrphanTabMemo,
  getTabMemo,
  listOrphanTabMemos,
  listTabMemos,
  removeTabMemo,
  setTabMemoDisplayState,
  setTabMemoText,
  updateTabMemoLayout,
} from "@pages/tab-memo/background";
import {
  forgetUnmatchedManualProtection,
  listTabRetentionOverview,
  reopenUnmatchedManualProtection,
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
    name: "tabRetention.reopenUnmatchedManual",
    handler: reopenUnmatchedManualProtection,
  },
  {
    name: "tabRetention.forgetUnmatchedManual",
    handler: forgetUnmatchedManualProtection,
  },
  {
    name: "tabMemo.get",
    handler: getTabMemo,
  },
  {
    name: "tabMemo.setText",
    handler: setTabMemoText,
  },
  {
    name: "tabMemo.updateLayout",
    handler: updateTabMemoLayout,
  },
  {
    name: "tabMemo.setDisplayState",
    handler: setTabMemoDisplayState,
  },
  {
    name: "tabMemo.remove",
    handler: removeTabMemo,
  },
  {
    name: "tabMemo.list",
    handler: listTabMemos,
  },
  {
    name: "tabMemo.listOrphans",
    handler: listOrphanTabMemos,
  },
  {
    name: "tabMemo.adoptOrphan",
    handler: adoptOrphanTabMemo,
  },
  {
    name: "tabMemo.forgetOrphan",
    handler: forgetOrphanTabMemo,
  },
] as const satisfies readonly RpcRoute[];
