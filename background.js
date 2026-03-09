const RECENT_TABS_KEY = "recentTabs";
const MAX_RECENT_TABS = 2;

function isValidTabId(tabId) {
  return Number.isInteger(tabId) && tabId >= 0;
}

function isValidWindowId(windowId) {
  return Number.isInteger(windowId) && windowId >= 0;
}

function toRecentTab(tab) {
  if (!isValidTabId(tab?.id) || !isValidWindowId(tab?.windowId)) {
    return null;
  }

  return {
    tabId: tab.id,
    windowId: tab.windowId,
  };
}

function buildRecentTabs(recentTabs, tab) {
  const currentEntry = toRecentTab(tab);
  const nextRecentTabs = [];

  if (currentEntry) {
    nextRecentTabs.push(currentEntry);
  }

  for (const entry of recentTabs) {
    if (
      !isValidTabId(entry?.tabId) ||
      !isValidWindowId(entry?.windowId) ||
      entry.tabId === currentEntry?.tabId
    ) {
      continue;
    }

    nextRecentTabs.push(entry);

    if (nextRecentTabs.length === MAX_RECENT_TABS) {
      break;
    }
  }

  return nextRecentTabs;
}

async function getStoredRecentTabs() {
  const stored = await chrome.storage.session.get(RECENT_TABS_KEY);
  const recentTabs = stored[RECENT_TABS_KEY];

  return Array.isArray(recentTabs) ? recentTabs : [];
}

async function saveRecentTabs(recentTabs) {
  await chrome.storage.session.set({
    [RECENT_TABS_KEY]: recentTabs.slice(0, MAX_RECENT_TABS),
  });
}

async function rememberTab(tab) {
  const recentTabs = await getStoredRecentTabs();
  const nextRecentTabs = buildRecentTabs(recentTabs, tab);

  if (nextRecentTabs.length > 0) {
    await saveRecentTabs(nextRecentTabs);
  }

  return nextRecentTabs;
}

async function seedRecentTabsFromOpenTabs() {
  const allTabs = await chrome.tabs.query({});
  const recentTabs = allTabs
    .filter((tab) => isValidTabId(tab.id) && isValidWindowId(tab.windowId))
    .sort((left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0))
    .map((tab) => ({
      tabId: tab.id,
      windowId: tab.windowId,
    }))
    .slice(0, MAX_RECENT_TABS);

  if (recentTabs.length > 0) {
    await saveRecentTabs(recentTabs);
  }

  return recentTabs;
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });

  return tab;
}

async function removeTabFromHistory(tabId) {
  const recentTabs = await getStoredRecentTabs();
  const nextRecentTabs = recentTabs.filter((entry) => entry.tabId !== tabId);

  if (nextRecentTabs.length !== recentTabs.length) {
    await saveRecentTabs(nextRecentTabs);
  }
}

async function focusTab(tabId, windowId) {
  try {
    await chrome.windows.update(windowId, { focused: true });
    await chrome.tabs.update(tabId, { active: true });
    return true;
  } catch (error) {
    console.warn("Failed to focus recent tab", error);
    return false;
  }
}

async function switchToPreviousTab(currentTab) {
  const activeTab = currentTab ?? (await getCurrentTab());

  if (!activeTab) {
    return;
  }

  let recentTabs = await rememberTab(activeTab);

  if (recentTabs.length < MAX_RECENT_TABS) {
    recentTabs = buildRecentTabs(await seedRecentTabsFromOpenTabs(), activeTab);
    await saveRecentTabs(recentTabs);
  }

  const targetTab = recentTabs.find((entry) => entry.tabId !== activeTab.id);

  if (!targetTab) {
    return;
  }

  const switched = await focusTab(targetTab.tabId, targetTab.windowId);

  if (switched) {
    return;
  }

  await removeTabFromHistory(targetTab.tabId);

  const fallbackRecentTabs = buildRecentTabs(
    await seedRecentTabsFromOpenTabs(),
    activeTab
  );
  const fallbackTarget = fallbackRecentTabs.find(
    (entry) => entry.tabId !== activeTab.id
  );

  if (fallbackTarget) {
    await focusTab(fallbackTarget.tabId, fallbackTarget.windowId);
  }
}

async function rememberActivatedTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    await rememberTab(tab);
  } catch (error) {
    console.warn("Failed to record activated tab", error);
  }
}

async function rememberFocusedWindowTab(windowId) {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      windowId,
    });

    if (tab) {
      await rememberTab(tab);
    }
  } catch (error) {
    console.warn("Failed to record focused window tab", error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void seedRecentTabsFromOpenTabs();
});

chrome.runtime.onStartup.addListener(() => {
  void seedRecentTabsFromOpenTabs();
});

chrome.action.onClicked.addListener((tab) => {
  void switchToPreviousTab(tab);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void rememberActivatedTab(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void removeTabFromHistory(tabId);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  void rememberFocusedWindowTab(windowId);
});
