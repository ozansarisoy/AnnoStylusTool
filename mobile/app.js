const customId = 'ast-mobile-' + Math.random().toString(36).substr(2, 9);
const peer = new Peer(customId, {
  config: {
    'iceServers': [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }
});
let conn = null;

const peerIdInput = document.getElementById('peerIdInput');
const connectBtn = document.getElementById('connectBtn');
const statusText = document.getElementById('status');
const setupDiv = document.getElementById('setup');
const touchpad = document.getElementById('touchpad');

peer.on('error', (err) => {
  statusText.innerText = 'Connection Failed: ' + (err.type || 'Timeout');
  connectBtn.style.display = 'block';
});

connectBtn.addEventListener('click', () => {
  const extId = peerIdInput.value.trim();
  if (!extId) {
    statusText.innerText = 'Please enter a valid ID';
    return;
  }
  
  statusText.innerText = 'Linking to computer...';
  conn = peer.connect(extId, { reliable: true });
  
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
    statusText.innerText = 'Link Error: ' + err.message;
  });
});

// Auto-connect from URL param (?id=...)
const urlParams = new URLSearchParams(window.location.search);
const idParam = urlParams.get('id');
if (idParam) {
  peerIdInput.value = idParam;
  statusText.innerText = 'Preparing device...';
  
  const doConnect = () => {
    connectBtn.click();
  };
  
  if (peer.id) {
    doConnect();
  } else {
    peer.on('open', doConnect);
  }
}

// Universal Pointer & Touch Handling
let isDragging = false;

function sendDrawEvent(type, x, y, pointerType) {
  if (!conn || !conn.open) return;
  conn.send({ type, x, y, pointerType });
}

function handlePointerEvent(e, type) {
  try { e.preventDefault(); } catch(err){}
  
  // Visual feedback on the iPad screen
  if (type === 'start') {
    touchpad.style.backgroundColor = '#2980b9'; // Darker blue when touching
  } else if (type === 'stop') {
    touchpad.style.backgroundColor = '#34495e'; // Original color
  }

  const rect = touchpad.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  sendDrawEvent(type, x, y, e.pointerType || 'mouse');
}

function handleTouchEvent(e, type) {
  try { e.preventDefault(); } catch(err){}
  
  if (type === 'start') {
    touchpad.style.backgroundColor = '#2980b9';
  } else if (type === 'stop') {
    touchpad.style.backgroundColor = '#34495e';
  }

  const touch = e.touches && e.touches.length > 0 ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : null);
  if (!touch && type !== 'stop') return;
  
  if (type === 'stop') {
    sendDrawEvent('stop', 0, 0, 'touch');
    return;
  }
  
  const rect = touchpad.getBoundingClientRect();
  const x = (touch.clientX - rect.left) / rect.width;
  const y = (touch.clientY - rect.top) / rect.height;
  sendDrawEvent(type, x, y, 'touch');
}

if (window.PointerEvent) {
  touchpad.addEventListener('pointerdown', (e) => {
    isDragging = true;
    try { touchpad.setPointerCapture(e.pointerId); } catch(err){}
    handlePointerEvent(e, 'start');
  }, { passive: false });

  touchpad.addEventListener('pointermove', (e) => {
    if (isDragging) {
      handlePointerEvent(e, 'move');
    } else {
      handlePointerEvent(e, 'hover');
    }
  }, { passive: false });

  touchpad.addEventListener('pointerup', (e) => {
    isDragging = false;
    try { touchpad.releasePointerCapture(e.pointerId); } catch(err){}
    handlePointerEvent(e, 'stop');
  }, { passive: false });

  touchpad.addEventListener('pointercancel', (e) => {
    isDragging = false;
    try { touchpad.releasePointerCapture(e.pointerId); } catch(err){}
    handlePointerEvent(e, 'stop');
  }, { passive: false });
} else {
  // Legacy Fallbacks
  touchpad.addEventListener('touchstart', (e) => {
    isDragging = true;
    handleTouchEvent(e, 'start');
  }, { passive: false });
  touchpad.addEventListener('touchmove', (e) => {
    if (isDragging) handleTouchEvent(e, 'move');
  }, { passive: false });
  touchpad.addEventListener('touchend', (e) => {
    isDragging = false;
    handleTouchEvent(e, 'stop');
  }, { passive: false });
  
  touchpad.addEventListener('mousedown', (e) => {
    isDragging = true;
    handlePointerEvent(e, 'start');
  });
  touchpad.addEventListener('mousemove', (e) => {
    if (isDragging) handlePointerEvent(e, 'move');
  });
  touchpad.addEventListener('mouseup', (e) => {
    isDragging = false;
    handlePointerEvent(e, 'stop');
  });
}
