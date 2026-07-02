const customId = 'ast-mobile-' + Math.random().toString(36).substr(2, 9);
const peer = new Peer(customId);
let conn = null;

const peerIdInput = document.getElementById('peerIdInput');
const connectBtn = document.getElementById('connectBtn');
const statusText = document.getElementById('status');
const setupDiv = document.getElementById('setup');
const touchpad = document.getElementById('touchpad');

connectBtn.addEventListener('click', () => {
  const extId = peerIdInput.value.trim();
  if (!extId) {
    statusText.innerText = 'Please enter an ID';
    return;
  }
  
  statusText.innerText = 'Connecting...';
  conn = peer.connect(extId);
  
  conn.on('open', () => {
    setupDiv.style.display = 'none';
    touchpad.style.display = 'block';
  });
  
  conn.on('close', () => {
    setupDiv.style.display = 'flex';
    touchpad.style.display = 'none';
    statusText.innerText = 'Connection lost. Reconnect?';
  });
  
  conn.on('error', (err) => {
    statusText.innerText = 'Error: ' + err.message;
  });
});

// Auto-connect from URL param (?id=...)
const urlParams = new URLSearchParams(window.location.search);
const idParam = urlParams.get('id');
if (idParam) {
  peerIdInput.value = idParam;
  statusText.innerText = 'Initializing...';
  
  const doConnect = () => {
    connectBtn.click();
  };
  
  if (peer.id) {
    doConnect();
  } else {
    peer.on('open', doConnect);
  }
}

// Touch handling
function sendDrawEvent(type, e) {
  if (!conn || !conn.open) return;
  e.preventDefault(); // Prevent scrolling
  
  // Get first touch point
  const touch = e.touches ? e.touches[0] : e;
  if (!touch) return;
  
  // Normalize coordinates (0.0 to 1.0)
  const rect = touchpad.getBoundingClientRect();
  const x = (touch.clientX - rect.left) / rect.width;
  const y = (touch.clientY - rect.top) / rect.height;
  
  conn.send({ type, x, y });
}

touchpad.addEventListener('touchstart', (e) => sendDrawEvent('start', e), { passive: false });
touchpad.addEventListener('touchmove', (e) => sendDrawEvent('move', e), { passive: false });
touchpad.addEventListener('touchend', (e) => {
  if (!conn || !conn.open) return;
  // touchend doesn't have clientX/Y on touches[0] usually, we just send a stop signal
  conn.send({ type: 'stop' });
}, { passive: false });

// Mouse fallback for testing on desktop
touchpad.addEventListener('mousedown', (e) => sendDrawEvent('start', e));
touchpad.addEventListener('mousemove', (e) => {
  if (e.buttons === 1) sendDrawEvent('move', e);
});
touchpad.addEventListener('mouseup', (e) => conn.send({ type: 'stop' }));
