const notificationTargets = new Map<
  string,
  { tabId: number; windowId?: number }
>();

chrome.runtime.onMessage.addListener((message, sender) => {
  if (
    message?.type === "notify" ||
    message?.type === "chatgpt.notifyAnswerFinished"
  ) {
    chrome.notifications.create(
      {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/128x128.png"),
        title: message.title ?? "Chrome Palette",
        message: message.message ?? "Hello World",
      },
      (notificationId) => {
        const tabId = sender.tab?.id;
        if (typeof tabId !== "number") return;
        notificationTargets.set(notificationId, {
          tabId,
          windowId: sender.tab?.windowId,
        });
      }
    );
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  const target = notificationTargets.get(notificationId);
  if (!target) return;

  if (typeof target.windowId === "number") {
    chrome.windows.update(target.windowId, { focused: true });
  }
  chrome.tabs.update(target.tabId, { active: true });
  notificationTargets.delete(notificationId);
  chrome.notifications.clear(notificationId);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  console.log({ alarm }, new Date());
});

chrome.alarms.create("watchdog", {
  delayInMinutes: 0,
  periodInMinutes: 1,
});

chrome.alarms.create("watchdog2", {
  delayInMinutes: 0.5,
  periodInMinutes: 1,
});
