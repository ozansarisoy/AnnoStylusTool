// AST Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('Anno Stylus Tool installed');
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Anno Stylus Tool',
      message: 'Extension cannot run on this page. Please open a normal website to start drawing.'
    });
  } else {
    chrome.tabs.sendMessage(tab.id, { action: 'toggleToolbar' }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("Could not send toggle message, script might not be injected yet.");
      }
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openCameraHub') {
    chrome.tabs.create({ url: chrome.runtime.getURL('camera/index.html') });
    sendResponse({ status: 'opened' });
  }

  if (request.action === 'convertVideo') {
    self.videoBuffer = request.buffer;
    self.videoFormat = request.format;
    chrome.tabs.create({ url: chrome.runtime.getURL('converter.html') });
    sendResponse({ status: 'started' });
  }

  if (request.action === 'getVideoData') {
    sendResponse({ buffer: self.videoBuffer, format: self.videoFormat });
    self.videoBuffer = null; 
  }

  return true; 
});
