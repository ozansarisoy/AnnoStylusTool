let peer;
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startMobileRemote') {
    if (!peer) {
      const customId = 'ast-' + Math.random().toString(36).substr(2, 9);
      peer = new Peer(customId, {
        config: {
          'iceServers': [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });
      peer.on('open', (id) => {
        sendResponse({ id: id });
      });
      peer.on('connection', (conn) => {
        conn.on('data', (data) => {
          chrome.runtime.sendMessage({ action: 'relayDrawCommand', data: data });
        });
      });
      peer.on('error', (err) => {
        sendResponse({ error: err.type });
      });
    } else {
      sendResponse({ id: peer.id });
    }
    return true; // async
  }
});
