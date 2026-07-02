import type { RpcRoute } from "@core/rpc";

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
] as const satisfies readonly RpcRoute[];
