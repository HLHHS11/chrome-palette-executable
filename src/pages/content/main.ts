import {
  enableChatGptWebSearch,
  toggleChatGptSidebar,
} from "./chatgpt-page-actions";
import {
  CHATGPT_ENABLE_WEB_SEARCH_MESSAGE_TYPE,
  CHATGPT_TOGGLE_SIDEBAR_MESSAGE_TYPE,
  type ChatGptContentResponse,
} from "./protocol";

// TODO: #1 このへんはrouterとして統一化
function runAndRespond(
  sendResponse: (r: ChatGptContentResponse) => void,
  work: Promise<void>
): void {
  void work
    .then(() => {
      sendResponse({ ok: true });
    })
    .catch((err: unknown) => {
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === CHATGPT_ENABLE_WEB_SEARCH_MESSAGE_TYPE) {
    runAndRespond(sendResponse, enableChatGptWebSearch());
    return true;
  }
  if (message?.type === CHATGPT_TOGGLE_SIDEBAR_MESSAGE_TYPE) {
    runAndRespond(
      sendResponse,
      Promise.resolve().then(() => {
        toggleChatGptSidebar();
      })
    );
    return true;
  }
  return false;
});
