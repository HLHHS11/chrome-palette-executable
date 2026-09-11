// content script からの申告を chrome.storage.local に追記する。
// Service Worker の停止やブラウザ再起動をまたいで観測ログを残すため local を使う。
let writeChain = Promise.resolve();

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "announce") return;
  const entry = {
    at: Date.now(),
    tabId: sender.tab?.id ?? null,
    windowId: sender.tab?.windowId ?? null,
    token: message.token,
    wasPresent: message.wasPresent,
    url: message.url,
  };
  writeChain = writeChain.then(async () => {
    const { log = [] } = await chrome.storage.local.get("log");
    log.push(entry);
    await chrome.storage.local.set({ log });
  });
});
