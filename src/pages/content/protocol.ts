// TODO: #1 このへんコード最悪なので修正
/** Content script と popup 間のメッセージ型（文字列は衝突しにくいプレフィックス付き） */
export const CHATGPT_ENABLE_WEB_SEARCH_MESSAGE_TYPE =
  "chrome-palette:chatgpt:enableWebSearch" as const;

export const CHATGPT_TOGGLE_SIDEBAR_MESSAGE_TYPE =
  "chrome-palette:chatgpt:toggleSidebar" as const;

export type ChatGptContentResponse =
  | { ok: true }
  | { ok: false; error: string };
