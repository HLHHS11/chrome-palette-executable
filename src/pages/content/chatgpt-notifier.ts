import { createRuntimeRpcClient } from "@core/rpc";

import { backgroundRoutes } from "../background/routes";

const callRuntimeRpc = createRuntimeRpcClient<typeof backgroundRoutes>();

// TODO: #1 １個でいい
const ANCHOR_SELECTORS = [
  "#thread-bottom-container",
  "#thread-bottom",
  'form[data-type="unified-composer"]',
] as const;

const STOP_BUTTON_SELECTOR = 'button[data-testid="stop-button"]';
const NOTIFY_COOLDOWN_MS = 1500;
const HEALTHCHECK_INTERVAL_MS = 2000;

function resolveAnchor(): Element | null {
  for (const selector of ANCHOR_SELECTORS) {
    const anchor = document.querySelector(selector);
    if (anchor) return anchor;
  }
  return null;
}

function isGenerating(): boolean {
  return document.querySelector(STOP_BUTTON_SELECTOR) !== null;
}

function notifyFinished(): void {
  void callRuntimeRpc({
    name: "common.notify",
    options: {
      type: "basic",
      iconUrl: "https://chatgpt.com/favicon.ico",
      title: "ChatGPT",
      message: `${document.title} で回答生成が終了しました`,
    },
    ttlMs: 15_000,
  });
}

export function startChatGptNotifier(): void {
  let wasGenerating = isGenerating();
  let lastNotifiedAt = 0;
  let pendingEvaluation = false;
  let currentAnchor: Element | null = null;
  let currentObserver: MutationObserver | null = null;

  const evaluate = () => {
    const nowGenerating = isGenerating();
    const now = Date.now();
    if (
      wasGenerating &&
      !nowGenerating &&
      now - lastNotifiedAt >= NOTIFY_COOLDOWN_MS
    ) {
      notifyFinished();
      lastNotifiedAt = now;
    }
    wasGenerating = nowGenerating;
  };

  const scheduleEvaluate = () => {
    if (pendingEvaluation) return;
    pendingEvaluation = true;
    setTimeout(() => {
      pendingEvaluation = false;
      evaluate();
    }, 50);
  };

  const attachObserver = () => {
    const nextAnchor = resolveAnchor();
    if (!nextAnchor) return;
    if (currentAnchor === nextAnchor && currentObserver) return;

    currentObserver?.disconnect();
    currentAnchor = nextAnchor;
    currentObserver = new MutationObserver(() => scheduleEvaluate());
    currentObserver.observe(nextAnchor, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-testid", "aria-label", "id"],
      characterData: false,
    });
  };

  attachObserver();
  evaluate();

  setInterval(() => {
    const resolvedAnchor = resolveAnchor();
    if (!resolvedAnchor) return;
    if (currentAnchor !== resolvedAnchor || !currentAnchor?.isConnected) {
      attachObserver();
    }
    evaluate();
  }, HEALTHCHECK_INTERVAL_MS);
}
