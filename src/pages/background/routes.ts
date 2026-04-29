import type { RpcRoute } from "@core/rpc";

import { notify } from "./notification";

export const backgroundRoutes = [
  {
    name: "common.notify",
    handler: notify,
  },
] as const satisfies readonly RpcRoute[];
