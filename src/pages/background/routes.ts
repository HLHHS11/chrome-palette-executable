import type { RpcRoute } from "@core/rpc";
import {
  adoptOrphanMemo,
  countBulkRestorableMemos,
  editMemo,
  forgetOrphanMemo,
  getMemo,
  listMemos,
  listOrphanMemos,
  removeMemo,
  restoreMemosInBulk,
  setMemoColor,
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
import {
  listAllTimers,
  listTabTimers,
  moveTimerOverlay,
  removeTimer,
  reportTimersDue,
  startTimer,
} from "@pages/timer/background";

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
    name: "memo.setColor",
    handler: setMemoColor,
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
  {
    name: "memo.countBulkRestorable",
    handler: countBulkRestorableMemos,
  },
  {
    name: "memo.restoreBulk",
    handler: restoreMemosInBulk,
  },
  {
    name: "timer.start",
    handler: startTimer,
  },
  {
    name: "timer.listForTab",
    handler: listTabTimers,
  },
  {
    name: "timer.listAll",
    handler: listAllTimers,
  },
  {
    name: "timer.remove",
    handler: removeTimer,
  },
  {
    name: "timer.moveOverlay",
    handler: moveTimerOverlay,
  },
  {
    name: "timer.reportDue",
    handler: reportTimersDue,
  },
] as const satisfies readonly RpcRoute[];
