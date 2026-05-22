import { createRuntimeRpcClient } from "@core/rpc";

import { backgroundRoutes } from "../background/routes";

const callRuntimeRpc = createRuntimeRpcClient<typeof backgroundRoutes>();

// 入力フォームの親要素。 DOM 変化の監視対象として使う。
const ANCHOR_SELECTOR = "fieldset";

// 生成中は「回答を停止」ボタンが表示される。
const STOP_BUTTON_SELECTOR = 'button[aria-label="回答を停止"]';

const NOTIFY_COOLDOWN_MS = 1500;
const HEALTHCHECK_INTERVAL_MS = 2000;

function isGenerating(): boolean {
  return document.querySelector(STOP_BUTTON_SELECTOR) !== null;
}

function notifyFinished(): void {
  void callRuntimeRpc({
    name: "common.notify",
    options: {
      type: "basic",
      iconUrl:
        "https://play-lh.googleusercontent.com/bTpNtZ6rYYX2SeI-wC4cnr7MJnOh2hjtgYu3UIrSxE09lM3GPl_Uhf9_Ih2Smje2bc0V=w480-h960-rw",
      // "https://www.gstatic.com/lamda/images/gemini_sparkle_aurora_33f86dc0c0257da337c63.svg",
      title: "Gemini",
      message: `${document.title} で回答生成が終了しました`,
    },
    ttlMs: 15_000,
  });
}

export function startGeminiNotifier(): void {
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
    const nextAnchor = document.querySelector(ANCHOR_SELECTOR);
    if (!nextAnchor) return;
    if (currentAnchor === nextAnchor && currentObserver) return;

    currentObserver?.disconnect();
    currentAnchor = nextAnchor;
    currentObserver = new MutationObserver(() => scheduleEvaluate());
    currentObserver.observe(nextAnchor, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-label", "disabled"],
      characterData: false,
    });
  };

  attachObserver();
  evaluate();

  setInterval(() => {
    const resolvedAnchor = document.querySelector(ANCHOR_SELECTOR);
    if (!resolvedAnchor) return;
    if (currentAnchor !== resolvedAnchor || !currentAnchor?.isConnected) {
      attachObserver();
    }
    evaluate();
  }, HEALTHCHECK_INTERVAL_MS);
}
