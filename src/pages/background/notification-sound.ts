/**
 * 止めるまで鳴り続ける通知音。
 *
 * service worker には DOM が無く音を出せないため、音を鳴らす役は offscreen
 * document に持たせる。ここが担うのは、その document の用意と、鳴らし始め /
 * 鳴り止ませの伝達である。
 * 音源ファイルは持たず、offscreen 側で Web Audio により合成する。
 */

const OFFSCREEN_URL = "offscreen.html";

async function ensureOffscreenDocument(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
    justification: "タイマーの通知音を鳴らすため。",
  });
}

/**
 * 鳴らし始める。音が出せなくても通知そのものは出したいので、
 * 失敗しても呼び出し元には伝えない。
 */
export async function startPersistentSound(): Promise<void> {
  try {
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({ name: "offscreenSound.start" });
  } catch (e: unknown) {
    console.error("Failed to start notification sound. Details:", e);
  }
}

export async function stopPersistentSound(): Promise<void> {
  try {
    if (!(await chrome.offscreen.hasDocument())) return;
    await chrome.runtime.sendMessage({ name: "offscreenSound.stop" });
  } catch (e: unknown) {
    console.error("Failed to stop notification sound. Details:", e);
  }
}
