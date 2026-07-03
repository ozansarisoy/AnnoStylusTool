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
const canvas = document.getElementById('touchpad');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}
window.addEventListener('resize', resizeCanvas);
// Call later when UI is shown

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
    setTimeout(resizeCanvas, 100);
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
const urlInputContainer = document.getElementById('urlInputContainer');
const mobileUrlInput = document.getElementById('mobileUrlInput');
const urlGoBtn = document.getElementById('urlGoBtn');

urlGoBtn.addEventListener('click', () => {
  const url = mobileUrlInput.value.trim();
  if (url && conn && conn.open) {
    conn.send({ type: 'navigate', url: url });
  }
});

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

// Tool & Action Selection Handling
const toolBtns = document.querySelectorAll('.tool-btn');
toolBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    if (btn.classList.contains('action-btn')) {
      const action = btn.dataset.action;
      if (conn && conn.open) conn.send({ type: 'action', action: action });
      return;
    }

    const tool = btn.dataset.tool;
    if (btn.classList.contains('clear-btn')) {
      if (conn && conn.open) conn.send({ type: 'toolSelect', tool: 'clear' });
      ctx.clearRect(0, 0, canvas.width, canvas.height); // clear local too
      return;
    }
    
    document.querySelectorAll('.tool-btn:not(.action-btn):not(.clear-btn)').forEach(b => {
      b.classList.remove('active');
    });
    btn.classList.add('active');
    
    // Toggle Text Input UI
    if (tool === 'text') {
      textInputContainer.style.display = 'flex';
      mobileTextInput.value = '';
      setTimeout(() => mobileTextInput.focus(), 10);
    } else {
      textInputContainer.style.display = 'none';
      if (conn && conn.open) conn.send({ type: 'textBlur' });
    }
    
    // Toggle URL Input UI
    if (tool === 'url') {
      urlInputContainer.style.display = 'flex';
    } else {
      urlInputContainer.style.display = 'none';
    }
    
    if (conn && conn.open) {
      conn.send({ type: 'toolSelect', tool: tool });
    }
  });
});

// Local Drawing State
let isDragging = false;
let lastX = 0;
let lastY = 0;

function drawLocal(type, x, y) {
  const activeToolBtn = document.querySelector('.tool-btn.active');
  const tool = activeToolBtn ? activeToolBtn.dataset.tool : 'pen';
  
  // Only locally draw freehand strokes to preview
  if (!['pen', 'highlight', 'eraser'].includes(tool)) return;
  
  const drawX = x * canvas.width;
  const drawY = y * canvas.height;
  
  if (type === 'start') {
    ctx.beginPath();
    ctx.moveTo(drawX, drawY);
    lastX = drawX;
    lastY = drawY;
  } else if (type === 'move') {
    ctx.lineTo(drawX, drawY);
    
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = remoteSize.value * 2;
      ctx.stroke();
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = remoteColor.value;
      ctx.lineWidth = remoteSize.value;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (tool === 'highlight') {
        ctx.strokeStyle = remoteColor.value + '80'; // 50% opacity
        ctx.lineWidth = remoteSize.value * 2;
      }
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(drawX, drawY);
    lastX = drawX;
    lastY = drawY;
  }
}

function sendDrawEvent(type, x, y, pointerType) {
  if (!conn || !conn.open) return;
  conn.send({ type, x, y, pointerType });
}

function handlePointerEvent(e, type) {
  const activeToolBtn = document.querySelector('.tool-btn.active');
  const tool = activeToolBtn ? activeToolBtn.dataset.tool : '';
  const isTextTool = tool === 'text';

  // Prevent default scrolling unless it's text/url tool focusing
  if (tool !== 'text' && tool !== 'url') {
    try { e.preventDefault(); } catch(err){}
  }

  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  
  if (isTextTool && type === 'start') {
    mobileTextInput.value = '';
    if (conn && conn.open) conn.send({ type: 'textFocus', x, y });
    return;
  }
  
  if (tool === 'pointer' && type === 'start') {
    if (conn && conn.open) conn.send({ type: 'simulateClick', x, y });
    return;
  }
  
  if (!isTextTool && tool !== 'pointer' && tool !== 'url') {
    drawLocal(type, x, y);
    sendDrawEvent(type, x, y, e.pointerType || 'mouse');
  } else if (tool === 'pointer') {
    // Just send hover for pointer so mouse moves
    sendDrawEvent(type === 'move' ? 'hover' : type, x, y, e.pointerType || 'mouse');
  }
}

function handleTouchEvent(e, type) {
  const activeToolBtn = document.querySelector('.tool-btn.active');
  const tool = activeToolBtn ? activeToolBtn.dataset.tool : '';
  const isTextTool = tool === 'text';

  if (tool !== 'text' && tool !== 'url') {
    try { e.preventDefault(); } catch(err){}
  }

  const touch = e.touches && e.touches.length > 0 ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : null);
  if (!touch && type !== 'stop') return;
  
  if (type === 'stop') {
    if (!isTextTool && tool !== 'pointer' && tool !== 'url') sendDrawEvent('stop', 0, 0, 'touch');
    return;
  }
  
  const rect = canvas.getBoundingClientRect();
  const x = (touch.clientX - rect.left) / rect.width;
  const y = (touch.clientY - rect.top) / rect.height;
  
  if (isTextTool && type === 'start') {
    mobileTextInput.value = '';
    if (conn && conn.open) conn.send({ type: 'textFocus', x, y });
    return;
  }
  
  if (tool === 'pointer' && type === 'start') {
    if (conn && conn.open) conn.send({ type: 'simulateClick', x, y });
    return;
  }

  if (!isTextTool && tool !== 'pointer' && tool !== 'url') {
    drawLocal(type, x, y);
    sendDrawEvent(type, x, y, 'touch');
  } else if (tool === 'pointer') {
    sendDrawEvent(type === 'move' ? 'hover' : type, x, y, 'touch');
  }
}

if (window.PointerEvent) {
  canvas.addEventListener('pointerdown', (e) => {
    isDragging = true;
    try { canvas.setPointerCapture(e.pointerId); } catch(err){}
    handlePointerEvent(e, 'start');
  }, { passive: false });

  canvas.addEventListener('pointermove', (e) => {
    if (isDragging) {
      handlePointerEvent(e, 'move');
    } else {
      handlePointerEvent(e, 'hover');
    }
  }, { passive: false });

  canvas.addEventListener('pointerup', (e) => {
    isDragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch(err){}
    handlePointerEvent(e, 'stop');
  }, { passive: false });

  canvas.addEventListener('pointercancel', (e) => {
    isDragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch(err){}
    handlePointerEvent(e, 'stop');
  }, { passive: false });
} else {
  // Legacy Fallbacks
  canvas.addEventListener('touchstart', (e) => {
    isDragging = true;
    handleTouchEvent(e, 'start');
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (isDragging) handleTouchEvent(e, 'move');
  }, { passive: false });
  canvas.addEventListener('touchend', (e) => {
    isDragging = false;
    handleTouchEvent(e, 'stop');
  }, { passive: false });
  
  canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    handlePointerEvent(e, 'start');
  });
  canvas.addEventListener('mousemove', (e) => {
    if (isDragging) handlePointerEvent(e, 'move');
  });
  canvas.addEventListener('mouseup', (e) => {
    isDragging = false;
    handlePointerEvent(e, 'stop');
  });
}
