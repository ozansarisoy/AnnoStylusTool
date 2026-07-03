// AST Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('Anno Stylus Tool installed');
});

async function setupOffscreenDocument(path) {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: path,
    reasons: ['WEB_RTC'],
    justification: 'Mobile remote drawing WebRTC connection'
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openCameraHub') {
    chrome.tabs.create({ url: chrome.runtime.getURL('camera/index.html') });
    sendResponse({ status: 'opened' });
  }
  
  if (request.action === 'relayDrawCommand') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, request, () => {
          if (chrome.runtime.lastError) {}
        });
      }
    });
    sendResponse({ status: 'relayed' });
  }

  if (request.action === 'startMobileRemoteBg') {
    setupOffscreenDocument('remote.html').then(() => {
      chrome.runtime.sendMessage({ action: 'startMobileRemote' }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse(response);
        }
      });
    }).catch(err => {
      sendResponse({ error: 'Offscreen Error: ' + err.message });
    });
    return true; // async
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
