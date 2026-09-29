// タイマーの「鳴り続ける」通知音を鳴らす。
//
// service worker には DOM が無く音を出せないため、このページが鳴らす役を持つ。
// 拡張機能のビルド対象に含めず、そのまま配布物へ配置するので、素の JavaScript で書く。

const RING_INTERVAL_MS = 1400;
const TONES = [880, 1174.7];

let audioContext = null;
let ringTimer = null;

function playChime() {
  const startAt = audioContext.currentTime;
  TONES.forEach((frequency, i) => {
    const at = startAt + i * 0.22;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    // 立ち上がりと減衰を付けないと、断ち切られた音がノイズとして聞こえる。
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.2, at + 0.02);
    gain.gain.linearRampToValueAtTime(0, at + 0.2);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.22);
  });
}

function startRinging() {
  if (ringTimer !== null) return;
  if (audioContext === null) audioContext = new AudioContext();
  void audioContext.resume();
  playChime();
  ringTimer = setInterval(playChime, RING_INTERVAL_MS);
}

function stopRinging() {
  if (ringTimer === null) return;
  clearInterval(ringTimer);
  ringTimer = null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 拡張機能内の RPC はすべてこのページにも届く。自分宛て以外は応答しない。
  if (message?.name === "offscreenSound.start") {
    startRinging();
    sendResponse({ ok: true, data: {} });
    return;
  }
  if (message?.name === "offscreenSound.stop") {
    stopRinging();
    sendResponse({ ok: true, data: {} });
  }
});
