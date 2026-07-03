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

// Pointer handling for universal support (Touch, Pen, Mouse)
let isDragging = false;

function sendDrawEvent(type, e) {
  if (!conn || !conn.open) return;
  
  // Normalize coordinates (0.0 to 1.0)
  const rect = touchpad.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  
  conn.send({ type, x, y, pointerType: e.pointerType });
}

touchpad.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  isDragging = true;
  touchpad.setPointerCapture(e.pointerId);
  sendDrawEvent('start', e);
});

touchpad.addEventListener('pointermove', (e) => {
  e.preventDefault();
  if (isDragging) {
    sendDrawEvent('move', e);
  } else {
    // Send hover events (useful for laser pointer or showing a simulated cursor)
    sendDrawEvent('hover', e);
  }
});

touchpad.addEventListener('pointerup', (e) => {
  e.preventDefault();
  isDragging = false;
  touchpad.releasePointerCapture(e.pointerId);
  sendDrawEvent('stop', e);
});

touchpad.addEventListener('pointercancel', (e) => {
  e.preventDefault();
  isDragging = false;
  touchpad.releasePointerCapture(e.pointerId);
  sendDrawEvent('stop', e);
});
