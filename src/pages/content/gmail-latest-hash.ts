// NOTE: #1 本ファイルは人間によるレビューをほぼしていません。
import {
  simulateMouseClick,
  waitForSelector,
  waitUntilValue,
} from "../lib/dom/selector";

const GMAIL_HOSTNAME = "mail.google.com";
const LATEST_PSEUDO_HASH = "#inbox/latest";

let isHandlingLatestPseudoHash = false;
let hasInitializedLatestHashNavigation = false;

function getHashFromUrl(url: string): string | null {
  try {
    return new URL(url).hash;
  } catch {
    return null;
  }
}

function isLatestPseudoHash(hash: string): boolean {
  const normalized = hash.replace(/\/+$/, "");
  return normalized === LATEST_PSEUDO_HASH;
}

export async function openLatestInboxThread(): Promise<boolean> {
  if (location.hostname !== GMAIL_HOSTNAME) {
    return false;
  }

  try {
    const panel = await waitForSelector('div[role="tabpanel"]', {
      timeoutMs: 12_000,
    });

    const rowResult = await waitUntilValue<HTMLTableRowElement>(
      () => {
        const firstRow = panel.querySelector("tr");
        if (!firstRow) {
          return { status: "pending", value: null };
        }

        return { status: "found", value: firstRow };
      },
      { timeoutMs: 12_000, intervalMs: 80 }
    );

    if (rowResult.status !== "found") {
      return false;
    }

    simulateMouseClick(rowResult.value);
    return true;
  } catch {
    return false;
  }
}

async function handleLatestPseudoHashIfNeeded(
  triggerHash: string
): Promise<void> {
  if (location.hostname !== GMAIL_HOSTNAME) {
    return;
  }
  if (!isLatestPseudoHash(triggerHash)) {
    return;
  }
  if (isHandlingLatestPseudoHash) {
    return;
  }

  isHandlingLatestPseudoHash = true;
  try {
    if (location.hash !== "#inbox") {
      location.hash = "#inbox";
    }
    await openLatestInboxThread();
  } finally {
    isHandlingLatestPseudoHash = false;
  }
}

export function initGmailLatestHashNavigation(): void {
  if (hasInitializedLatestHashNavigation) {
    return;
  }
  hasInitializedLatestHashNavigation = true;

  window.addEventListener("hashchange", (e) => {
    const newHash = getHashFromUrl(e.newURL);
    if (newHash) {
      void handleLatestPseudoHashIfNeeded(newHash);
      return;
    }
    void handleLatestPseudoHashIfNeeded(location.hash);
  });
  void handleLatestPseudoHashIfNeeded(location.hash);
}
