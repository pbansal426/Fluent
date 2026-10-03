// Clicking the toolbar icon opens the side panel; everything else lives in the panel.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
