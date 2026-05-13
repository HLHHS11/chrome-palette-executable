import type { RpcRoute } from "@core/rpc";

import { notify } from "./notification";
import { hideTabNumbers, showTabNumbers } from "./tab-numbering";

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
] as const satisfies readonly RpcRoute[];
