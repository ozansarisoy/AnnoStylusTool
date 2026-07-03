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
    document.getElementById('main-ui').style.display = 'flex';
  });
  
  conn.on('close', () => {
    setupDiv.style.display = 'flex';
    document.getElementById('main-ui').style.display = 'none';
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

const remoteColor = document.getElementById('remoteColor');
const remoteSize = document.getElementById('remoteSize');
const mobileTextInput = document.getElementById('mobileTextInput');
const textInputContainer = document.getElementById('textInputContainer');

remoteColor.addEventListener('input', (e) => {
  if (conn && conn.open) conn.send({ type: 'setting', color: e.target.value });
});

remoteSize.addEventListener('input', (e) => {
  if (conn && conn.open) conn.send({ type: 'setting', size: e.target.value });
});

mobileTextInput.addEventListener('input', (e) => {
  if (conn && conn.open) conn.send({ type: 'textInput', text: e.target.value });
});

mobileTextInput.addEventListener('blur', (e) => {
  if (conn && conn.open) conn.send({ type: 'textBlur' });
});

// Tool Selection Handling
const toolBtns = document.querySelectorAll('.tool-btn');
toolBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    const tool = btn.dataset.tool;
    if (tool === 'clear') {
      if (conn && conn.open) conn.send({ type: 'toolSelect', tool: 'clear' });
      return;
    }
    toolBtns.forEach(b => {
      if (!b.classList.contains('clear-btn')) b.classList.remove('active');
    });
    btn.classList.add('active');
    
    // Toggle Text Input UI
    if (tool === 'text') {
      textInputContainer.style.display = 'flex';
      mobileTextInput.value = '';
    } else {
      textInputContainer.style.display = 'none';
      if (conn && conn.open) conn.send({ type: 'textBlur' });
    }
    
    if (conn && conn.open) {
      conn.send({ type: 'toolSelect', tool: tool });
    }
  });
});

// Universal Pointer & Touch Handling
let isDragging = false;

function sendDrawEvent(type, x, y, pointerType) {
  if (!conn || !conn.open) return;
  conn.send({ type, x, y, pointerType });
}

function handlePointerEvent(e, type) {
  const activeToolBtn = document.querySelector('.tool-btn.active');
  const isTextTool = activeToolBtn && activeToolBtn.dataset.tool === 'text';

  // Prevent default scrolling unless it's text tool focusing
  if (!isTextTool) {
    try { e.preventDefault(); } catch(err){}
  }

  const rect = touchpad.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  
  if (isTextTool && type === 'start') {
    mobileTextInput.value = '';
    if (conn && conn.open) conn.send({ type: 'textFocus', x, y });
    return;
  }
  
  if (!isTextTool) {
    sendDrawEvent(type, x, y, e.pointerType || 'mouse');
  }
}

function handleTouchEvent(e, type) {
  const activeToolBtn = document.querySelector('.tool-btn.active');
  const isTextTool = activeToolBtn && activeToolBtn.dataset.tool === 'text';

  if (!isTextTool) {
    try { e.preventDefault(); } catch(err){}
  }

  const touch = e.touches && e.touches.length > 0 ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : null);
  if (!touch && type !== 'stop') return;
  
  if (type === 'stop') {
    if (!isTextTool) sendDrawEvent('stop', 0, 0, 'touch');
    return;
  }
  
  const rect = touchpad.getBoundingClientRect();
  const x = (touch.clientX - rect.left) / rect.width;
  const y = (touch.clientY - rect.top) / rect.height;
  
  if (isTextTool && type === 'start') {
    mobileTextInput.value = '';
    if (conn && conn.open) conn.send({ type: 'textFocus', x, y });
    return;
  }

  if (!isTextTool) {
    sendDrawEvent(type, x, y, 'touch');
  }
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
