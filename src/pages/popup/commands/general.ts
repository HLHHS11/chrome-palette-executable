// adapted from https://github.com/ssundarraj/commander/blob/master/src/js/actions.js
import type { Command } from "@pages/core/command";

import { whenRankingServiceReady } from "~/util/ranking";
import { inputSignal, parsedInput } from "~/util/signals";

import { isTruthy } from "../util/isTruthy";

const [, setInputValue] = inputSignal;

const getActiveTab = async () => {
  const windowId = chrome.windows.WINDOW_ID_CURRENT;
  const [currentTab] = await chrome.tabs.query({
    active: true,
    windowId,
  });
  return currentTab;
};
const base: Command[] = [
  {
    title: "New Tab",
    shortcut: "⌘ t",
    handler: async function () {
      await chrome.tabs.create({});
    },
  },
  {
    title: "New Window",
    shortcut: "⌘ n",
    handler: async function () {
      await chrome.windows.create({});
    },
  },
  {
    title: "Open History Page",
    shortcut: "⌘ y",
    url: "chrome://history",
  },
  {
    title: "Open Passwords Page",
    url: "chrome://password-manager/passwords",
  },
  {
    title: "Open Downloads",
    shortcut: "⌘⇧ d",
    url: "chrome://downloads",
  },
  {
    title: "Open Extensions",
    url: "chrome://extensions",
  },
  {
    title: "Open Extension Shortcuts",
    url: "chrome://extensions/shortcuts",
  },
  {
    title: "Open Bookmark Manager",
    shortcut: "⌘⌥ b",
    url: "chrome://bookmarks",
  },
  {
    title: "Show/hide Bookmarks Bar",
    shortcut: "⌘⇧ b",
    handler: async function () {
      setInputValue("Unsupported. Use [⌘⇧ b] instead.");
    },
  },
  {
    title: "Open Settings",
    shortcut: "⌘ ,",
    url: "chrome://settings",
  },
  {
    title: "Close Current Tab",
    shortcut: "⌘ w",
    handler: async function () {
      const currentTab = await getActiveTab();
      await chrome.tabs.remove(currentTab.id!);
    },
  },
  // {
  //   title: "Terminate Current Tab",
  //   command: async function () {
  //     const windowId = chrome.windows.WINDOW_ID_CURRENT;
  //     console.log(chrome);
  //     const [currentTab] = await chrome.tabs.query({
  //       active: true,
  //       windowId,
  //     });
  //     debugger;
  //     const processId = await chrome.processes.getProcessIdForTab(
  //       currentTab.id!
  //     );

  //     await chrome.processes.terminate(processId);
  //   },
  // },
  {
    title: "Reload Tab",
    shortcut: "⌘ r",
    handler: async function () {
      await chrome.tabs.reload();
      window.close();
    },
  },
  {
    title: "Reload All Tabs",
    handler: async function () {
      const windowId = chrome.windows.WINDOW_ID_CURRENT;
      const allTabIds = (await chrome.tabs.query({ windowId }))
        .map(({ id }) => id)
        .filter(isTruthy);
      for (const id of allTabIds) {
        await chrome.tabs.reload(id);
      }
      window.close();
    },
  },
  {
    title: "Clear Cache and Reload Tab",
    shortcut: "⌘⇧ r",
    handler: async function () {
      const tab = await getActiveTab();
      await chrome.tabs.reload(tab.id!, { bypassCache: true });
      window.close();
    },
  },
  {
    title: "Toggle Pin",
    handler: async function () {
      const currentTab = await getActiveTab();
      await chrome.tabs.update({ pinned: !currentTab.pinned });
      window.close();
    },
  },
  {
    title: "Duplicate Tab",
    handler: async function () {
      const currentTab = await getActiveTab();
      await chrome.tabs.duplicate(currentTab.id!);
    },
  },
  {
    title: "New Incognito Window",
    shortcut: "⌘⇧ n",
    handler: async function () {
      await chrome.windows.create({ incognito: true });
    },
  },
  {
    title: "Close Other Tabs",
    handler: async function () {
      const windowId = chrome.windows.WINDOW_ID_CURRENT;
      const otherTabs = await chrome.tabs.query({
        active: false,
        windowId,
      });
      const otherTabIds = otherTabs.map(({ id }) => id!);
      await chrome.tabs.remove(otherTabIds);
      window.close();
    },
  },
  {
    title: "Close Tabs To Right",
    handler: async function () {
      const windowId = chrome.windows.WINDOW_ID_CURRENT;
      const currentTab = await getActiveTab();
      const otherTabs = await chrome.tabs.query({
        active: false,
        windowId,
      });
      const otherTabIds = otherTabs
        .filter((tab) => tab.index > currentTab.index)
        .map(({ id }) => id!);
      await chrome.tabs.remove(otherTabIds);
      window.close();
    },
  },
  {
    title: "Close Tabs To Left",
    handler: async function () {
      const currentTab = await getActiveTab();
      const windowId = chrome.windows.WINDOW_ID_CURRENT;
      const otherTabs = await chrome.tabs.query({
        active: false,
        windowId,
      });
      const otherTabIds = otherTabs
        .filter((tab) => tab.index < currentTab.index)
        .map(({ id }) => id!);
      await chrome.tabs.remove(otherTabIds);
      window.close();
    },
  },
  {
    title: "Mute/Unmute Tab",
    handler: async function () {
      const currentTab = await getActiveTab();
      const isMuted = currentTab.mutedInfo!.muted;
      await chrome.tabs.update({ muted: !isMuted });
      window.close();
    },
  },
  {
    title: "Move Tab To Start",
    handler: async function () {
      const currentTab = await getActiveTab();
      await chrome.tabs.move(currentTab.id!, { index: 0 });
      window.close();
    },
  },
  {
    title: "Move Tab To End",
    handler: async function () {
      const currentTab = await getActiveTab();
      await chrome.tabs.move(currentTab.id!, { index: -1 });
      window.close();
    },
  },
  {
    title: "Move Tab Left",
    handler: async function () {
      const currentTab = await getActiveTab();
      await chrome.tabs.move(currentTab.id!, {
        index: currentTab.index - 1,
      });
      window.close();
    },
  },
  {
    title: "Move Tab Right",
    handler: async function () {
      const currentTab = await getActiveTab();
      await chrome.tabs.move(currentTab.id!, {
        index: currentTab.index + 1,
      });
      window.close();
    },
  },
  {
    title: "Reopen/Unclose Tab",
    shortcut: "⌘⇧ t",
    handler: async function () {
      return await chrome.sessions.restore();
    },
  },
  {
    title: "Deattach Tab (Move to New Window)",
    handler: async function () {
      const [tab] = await chrome.tabs.query({
        currentWindow: true,
        active: true,
      });
      await chrome.windows.create({ tabId: tab.id });
    },
  },
  {
    title: "Split screen (vertical)",
    handler: async function () {
      const [tab] = await chrome.tabs.query({
        currentWindow: true,
        active: true,
      });

      const { availLeft, availTop, availHeight, availWidth } =
        screen as Screen & { availLeft: number; availTop: number };
      const currentWindow = await chrome.windows.getCurrent();
      const halfHeight = Math.floor(availHeight / 2);
      await chrome.windows.update(currentWindow.id!, {
        left: availLeft,
        top: availTop,
        width: availWidth,
        height: halfHeight,
      });
      // Create a new window with the current tab
      await chrome.windows.create({
        tabId: tab.id,
        left: availLeft,
        top: availTop + halfHeight,
        width: availWidth,
        height: halfHeight,
        focused: true,
      });
    },
  },
  {
    title: "Split screen (horizontal)",
    handler: async function () {
      const [tab] = await chrome.tabs.query({
        currentWindow: true,
        active: true,
      });
      const { availLeft, availTop, availHeight, availWidth } =
        screen as Screen & { availLeft: number; availTop: number };
      const currentWindow = await chrome.windows.getCurrent();
      const halfWidth = Math.floor(availWidth / 2);
      await chrome.windows.update(currentWindow.id!, {
        left: availLeft,
        top: availTop,
        width: halfWidth,
        height: availHeight,
      });
      // Create a new window with the current tab
      await chrome.windows.create({
        tabId: tab.id,
        left: availLeft + halfWidth,
        top: availTop,
        width: halfWidth,
        height: availHeight,
        focused: true,
      });
    },
  },
  {
    title: "Reattach Tab (Move Tab to Previous Window)",
    handler: async function () {
      const [currentTab] = await chrome.tabs.query({
        currentWindow: true,
        active: true,
      });
      const currentWindow = await chrome.windows.getCurrent({
        // windowTypes: ["normal"],
      });
      const allWindows = await chrome.windows.getAll({
        windowTypes: ["normal"],
      });
      const otherWindows = allWindows.filter(
        (win) => win.id !== currentWindow.id
      );
      const prevWindow = otherWindows[0];
      await chrome.windows.update(prevWindow.id!, { focused: true });
      await chrome.tabs.move(currentTab.id!, {
        windowId: prevWindow.id,
        index: -1,
      });
      await chrome.tabs.update(currentTab.id!, { highlighted: true });
    },
  },
  {
    title: "Toggle full screen",
    shortcut: "⌃⌘ f",
    handler: async function () {
      const currWindow = await chrome.windows.getCurrent();
      const state = currWindow.state === "fullscreen" ? "normal" : "fullscreen";
      chrome.windows.update(currWindow.id!, {
        state,
      });
      window.close();
    },
  },
  {
    title: "Clear browsing history, cookies and cache",
    shortcut: "⌘⇧ ⌫",
    url: "chrome://settings/clearBrowserData",
  },
  {
    title: "Open Chrome SignIn internals",
    url: "chrome://signin-internals/",
  },
  {
    title: "Open Chrome Apps",
    url: "chrome://apps/",
  },
  {
    title: "Configure Chrome internal flags",
    url: "chrome://flags/",
  },
  {
    title: "Configure Third-party Cookies",
    url: "chrome://settings/cookies",
  },
  {
    title: "Configure Ad privacy",
    url: "chrome://settings/adPrivacy",
  },
  {
    title: "Configure Sync and Google Services",
    url: "chrome://settings/syncSetup",
  },
  {
    title: "Configure Chrome Profile",
    url: "chrome://settings/manageProfile",
  },
  {
    title: "Import Bookmarks & Settings",
    url: "chrome://settings/importData",
  },
  {
    title: "Configure Addresses",
    url: "chrome://settings/addresses",
  },
  {
    title: "Configure Autofill & Passwords",
    url: "chrome://settings/autofill",
  },
  {
    title: "Configure Payment Methods",
    url: "chrome://settings/payments",
  },
  {
    title: "Configure Site Settings & Permissions",
    url: "chrome://settings/content",
  },
  {
    title: "Configure Security",
    url: "chrome://settings/security",
  },
  {
    title: "Configure Privacy and security",
    url: "chrome://settings/privacy",
  },
  {
    title: "Configure Search engine",
    url: "chrome://settings/defaultBrowser",
  },
  {
    title: "Configure Default browser",
    url: "chrome://settings/defaultBrowser",
  },
  {
    title: "Configure on Start-up",
    url: "chrome://settings/onStartup",
  },
  {
    title: "Configure Languages",
    url: "chrome://settings/languages",
  },
  {
    title: "Configure Accessibility",
    url: "chrome://settings/accessibility",
  },
  {
    title: "Configure System & Proxy",
    url: "chrome://settings/system",
  },
  {
    title: "Reset chrome settings",
    url: "chrome://settings/resetProfileSettings?origin=userclick",
  },
  {
    title: "About chrome",
    url: "chrome://settings/help",
  },
  // {
  //   title: "Print page",
  //   shortcut: "⌘ p",
  //   command: async function () {
  //     const currentTab = await getActiveTab();
  //     chrome.tabs.update(currentTab.id!, { url: "chrome://print" });
  //   },
  // },
  {
    title: "Reset command history",
    subtitle: "Resets the order of commands in this extension",
    handler: async function () {
      // runCommand 側で先に record されるが、その直後に reset するので結果は空。
      const service = await whenRankingServiceReady();
      await service.reset();
      window.location.reload();
    },
  },
];

export default function generalSuggestions(): Command[] {
  const { isCommand } = parsedInput();
  if (isCommand) return [];
  return base;
}
