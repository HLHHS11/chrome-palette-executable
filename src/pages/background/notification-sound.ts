/**
 * 通知に添える音。
 *
 * service worker には DOM が無く音を出せないため、鳴らす役は offscreen
 * document に持たせる。ここが担うのは、その document の用意と、
 * 鳴らし始め / 鳴り止ませの伝達である。
 *
 * OS の通知音に任せず自前で鳴らすのは、通知の設定しだいで無音になる環境が
 * あるためである。鳴る約束で仕掛けたタイマーが黙って過ぎるのは困る。
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

/** 音が出せなくても通知そのものは出したいので、失敗は記録するに留める。 */
async function requestSound(name: string): Promise<void> {
  try {
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({ name });
  } catch (e: unknown) {
    console.error("Failed to play notification sound. Details:", e);
  }
}

/** 一度だけ短く鳴らす。 */
export async function playShortSound(): Promise<void> {
  await requestSound("offscreenSound.chime");
}

/** 止めるまで鳴らし続ける。 */
export async function startPersistentSound(): Promise<void> {
  await requestSound("offscreenSound.start");
}

export async function stopPersistentSound(): Promise<void> {
  try {
    if (!(await chrome.offscreen.hasDocument())) return;
    await chrome.runtime.sendMessage({ name: "offscreenSound.stop" });
  } catch (e: unknown) {
    console.error("Failed to stop notification sound. Details:", e);
  }
}
