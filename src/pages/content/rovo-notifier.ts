import { createRuntimeRpcClient } from "@core/rpc";

import { backgroundRoutes } from "../background/routes";

const callRuntimeRpc = createRuntimeRpcClient<typeof backgroundRoutes>();

// 入力フォームの親要素。 DOM 変化の監視対象として使う。
const ANCHOR_SELECTOR = '[data-testid="chat-input-wrapper"]';

// 生成中は送信ボタンが「生成を停止」ボタンに差し替わる。
// Rovo の送信/停止ボタンには aria-label が無く、内部の VisuallyHidden span に
// 「送信」「生成を停止」というテキストが入る形で状態が表現されている。
// そのため textContent ベースで判定する。日本語 UI 前提。
const STOP_BUTTON_LABEL = "生成を停止";

const NOTIFY_COOLDOWN_MS = 1500;
const HEALTHCHECK_INTERVAL_MS = 2000;

function isGenerating(): boolean {
  const wrapper = document.querySelector(ANCHOR_SELECTOR);
  if (!wrapper) return false;
  for (const button of wrapper.querySelectorAll("button")) {
    if (button.textContent?.includes(STOP_BUTTON_LABEL)) return true;
  }
  return false;
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
