import type { RpcRoute } from "../lib/rpc/types";
import { notify } from "./notification";

export const backgroundRoutes = [
  {
    name: "common.notify",
    handler: notify,
  },
] as const satisfies readonly RpcRoute[];
