import { simulateMouseClickSequence } from "../lib/dom/selector";
import { RpcResponse, RpcVoidResponseBody } from "../lib/rpc/types";

const ARCHIVE_BUTTON_SELECTOR = 'div[title="アーカイブ"]';
const OVERLAY_ID = "chrome-palette-gmail-archive-overlay";
const POPUP_ID = "chrome-palette-gmail-archive-popup";

let activeCleanup: (() => void) | null = null;

function removeModeUi(): void {
  document.getElementById(OVERLAY_ID)?.remove();
  document.getElementById(POPUP_ID)?.remove();
}

function createModeUi(): void {
  removeModeUi();

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0, 0, 0, 0.35)";
  overlay.style.backdropFilter = "blur(1px)";
  overlay.style.zIndex = "2147483646";
  overlay.style.pointerEvents = "none";

  const popup = document.createElement("div");
  popup.id = POPUP_ID;
  popup.setAttribute("role", "status");
  popup.setAttribute("aria-live", "polite");
  popup.style.position = "fixed";
  popup.style.left = "50%";
  popup.style.top = "24px";
  popup.style.transform = "translateX(-50%)";
  popup.style.padding = "12px 16px";
  popup.style.borderRadius = "10px";
  popup.style.background = "rgba(24, 24, 24, 0.92)";
  popup.style.color = "#fff";
  popup.style.fontSize = "14px";
  popup.style.fontWeight = "600";
  popup.style.letterSpacing = "0.02em";
  popup.style.boxShadow = "0 10px 24px rgba(0, 0, 0, 0.4)";
  popup.style.zIndex = "2147483647";
  popup.style.pointerEvents = "none";
  popup.textContent =
    "Enter / Space でアーカイブ実行。その他のキーでキャンセルします。";

  document.documentElement.append(overlay, popup);
}

function isExecutionKey(e: KeyboardEvent): boolean {
  if (e.key === "Enter" || e.code === "Enter") return true;
  if (e.code === "Space") return true;
  return e.key === " " || e.key === "Spacebar";
}

export function startGmailArchiveMode(): RpcResponse<RpcVoidResponseBody> {
  activeCleanup?.();
  activeCleanup = null;

  createModeUi();

  const onKeydown = (e: KeyboardEvent) => {
    if (!e.isTrusted) return;

    const shouldExecute = isExecutionKey(e);

    // 実行キー/キャンセルキーのどちらでも、Gmail側には伝播させない。
    e.preventDefault();
    e.stopImmediatePropagation();

    document.removeEventListener("keydown", onKeydown, true);
    removeModeUi();
    activeCleanup = null;

    if (!shouldExecute) {
      return;
    }

    const archiveButton = document.querySelector<HTMLElement>(
      ARCHIVE_BUTTON_SELECTOR
    );
    if (!archiveButton) {
      console.warn("[chrome-palette] Gmail archive button not found.");
      return;
    }

    archiveButton.focus();
    simulateMouseClickSequence(archiveButton);
  };

  document.addEventListener("keydown", onKeydown, true);
  activeCleanup = () => {
    document.removeEventListener("keydown", onKeydown, true);
    removeModeUi();
  };

  return { ok: true, data: {} };
}
