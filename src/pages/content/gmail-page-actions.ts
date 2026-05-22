import { RpcResponse, RpcVoidResponseBody } from "@core/rpc";

import { simulateMouseClickSequence } from "../lib/dom/selector";
import { startUserKeydownOverlay } from "./common/user-keydown-overlay";

const ARCHIVE_BUTTON_SELECTOR = 'div[title="アーカイブ"]';

let activeCleanup: (() => void) | null = null;

export function startGmailArchiveMode(): RpcResponse<RpcVoidResponseBody> {
  activeCleanup?.();
  activeCleanup = null;

  activeCleanup = startUserKeydownOverlay({
    modeDomIdPrefix: "chrome-palette-gmail-archive",
    message: "Enter / Space でアーカイブ実行。その他のキーでキャンセルします。",
    execute: () => {
      const archiveButton = document.querySelector<HTMLElement>(
        ARCHIVE_BUTTON_SELECTOR
      );
      if (!archiveButton) {
        console.warn("[chrome-palette] Gmail archive button not found.");
        return;
      }

      archiveButton.focus();
      simulateMouseClickSequence(archiveButton);
    },
  });

  return { ok: true, data: {} };
}
