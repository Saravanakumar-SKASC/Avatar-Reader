// Clicking the toolbar icon opens the side panel for the current tab.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
});

// The side panel asks us to open the app in its own window (e.g. for Google sign-in,
// which refuses to run inside a frame).
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'open-window' && typeof msg.url === 'string') {
    chrome.windows.create({ url: msg.url, type: 'popup', width: 1280, height: 900 });
  }
});
