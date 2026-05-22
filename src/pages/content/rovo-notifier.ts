import { createRuntimeRpcClient } from "@core/rpc";

import { backgroundRoutes } from "../background/routes";

const callRuntimeRpc = createRuntimeRpcClient<typeof backgroundRoutes>();

// 入力フォームの親要素。 DOM 変化の監視対象として使う。
const ANCHOR_SELECTOR = '[data-testid="chat-input-wrapper"]';

// 回答生成中の停止ボタンには aria-label / data-testid が無く、
// 子孫の VisuallyHidden span の「生成を停止」テキストでしか同定できない。
// CSS セレクタでは祖先指定が書きにくいため XPath で取得する。日本語 UI 前提。
const STOP_BUTTON_XPATH =
  '//*[@data-testid="chat-input-wrapper"]//*[normalize-space(text())="生成を停止"]/ancestor::button[1]';

const NOTIFY_COOLDOWN_MS = 1500;
const HEALTHCHECK_INTERVAL_MS = 2000;

function isGenerating(): boolean {
  return (
    document.evaluate(
      STOP_BUTTON_XPATH,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue !== null
  );
}

function notifyFinished(): void {
  void callRuntimeRpc({
    name: "common.notify",
    options: {
      type: "basic",
      iconUrl: "https://www.atlassian.com/favicon.ico",
      title: "Rovo",
      message: `${document.title} で回答生成が終了しました`,
    },
    ttlMs: 15_000,
  });
}

export function startRovoNotifier(): void {
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
      attributeFilter: ["type", "disabled", "aria-label"],
      characterData: true,
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
