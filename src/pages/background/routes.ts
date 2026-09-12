import type { RpcRoute } from "@core/rpc";
import {
  adoptOrphanMemo,
  editMemo,
  forgetOrphanMemo,
  getMemo,
  listMemos,
  listOrphanMemos,
  removeMemo,
  setMemoText,
  toggleMemoSize,
  updateMemoLayout,
} from "@pages/memo/background";
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
    name: "memo.get",
    handler: getMemo,
  },
  {
    name: "memo.setText",
    handler: setMemoText,
  },
  {
    name: "memo.updateLayout",
    handler: updateMemoLayout,
  },
  {
    name: "memo.toggleSize",
    handler: toggleMemoSize,
  },
  {
    name: "memo.edit",
    handler: editMemo,
  },
  {
    name: "memo.remove",
    handler: removeMemo,
  },
  {
    name: "memo.list",
    handler: listMemos,
  },
  {
    name: "memo.listOrphans",
    handler: listOrphanMemos,
  },
  {
    name: "memo.adoptOrphan",
    handler: adoptOrphanMemo,
  },
  {
    name: "memo.forgetOrphan",
    handler: forgetOrphanMemo,
  },
] as const satisfies readonly RpcRoute[];
