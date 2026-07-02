// AST Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('Anno Stylus Tool installed');
});

// We can store global state here if needed, or relay messages between popup/camera hub and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openCameraHub') {
    chrome.tabs.create({ url: chrome.runtime.getURL('camera/index.html') });
    sendResponse({ status: 'opened' });
  }
  
  if (request.action === 'relayDrawCommand') {
    // Relay a drawing command from the camera hub or mobile to the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, request, (response) => {
          // Ignore connection errors if content script isn't ready
          if (chrome.runtime.lastError) {}
        });
      }
    });
    sendResponse({ status: 'relayed' });
  }

  if (request.action === 'convertVideo') {
    self.videoBuffer = request.buffer;
    self.videoFormat = request.format;
    chrome.tabs.create({ url: chrome.runtime.getURL('converter.html') });
    sendResponse({ status: 'started' });
  }

  if (request.action === 'getVideoData') {
    sendResponse({ buffer: self.videoBuffer, format: self.videoFormat });
    self.videoBuffer = null; // Free memory after handoff
  }

  return true; // Keep message channel open for async response if needed
});
