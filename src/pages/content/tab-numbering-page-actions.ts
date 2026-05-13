import type { RpcResponse, RpcVoidResponseBody } from "@core/rpc";

const NUMBERED_TITLE_PREFIX = /^\d+\. /;

type ApplyTabNumberingTitleParams = {
  number: number;
};

export function applyTabNumberingTitle(
  params: ApplyTabNumberingTitleParams
): RpcResponse<RpcVoidResponseBody> {
  const base = document.title.replace(NUMBERED_TITLE_PREFIX, "");
  document.title = `${params.number}. ${base}`;
  return { ok: true, data: {} };
}

export function restoreTabNumberingTitle(): RpcResponse<RpcVoidResponseBody> {
  if (NUMBERED_TITLE_PREFIX.test(document.title)) {
    document.title = document.title.replace(NUMBERED_TITLE_PREFIX, "");
  }
  return { ok: true, data: {} };
}
