/* AST Content Script - Canvas Overlay injected into web pages */

let isEnabled = false;
let currentTool = 'pen';
let currentColor = '#e74c3c';
let isDrawing = false;

// Drawing state
let startX, startY;
let currentX, currentY;
let ctx;
let overlayCanvas;
let spotlightOverlay;
let remoteCursorX = null, remoteCursorY = null, showRemoteCursor = false;

// Stroke Tracking for Save/Export and Redraw
let strokes = [];
let redoStack = [];
let currentStroke = null;

function initCanvas() {
  if (document.getElementById('ast-overlay')) return;

  // Drawing Canvas
  overlayCanvas = document.createElement('canvas');
  overlayCanvas.id = 'ast-overlay';
  Object.assign(overlayCanvas.style, {
    position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
    zIndex: '999999', pointerEvents: 'none', cursor: 'crosshair'
  });
  document.body.appendChild(overlayCanvas);
  
  // Spotlight Overlay
  spotlightOverlay = document.createElement('div');
  spotlightOverlay.id = 'ast-spotlight';
  Object.assign(spotlightOverlay.style, {
    position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
    zIndex: '999998', pointerEvents: 'none', display: 'none',
    background: 'rgba(0,0,0,0.8)'
  });
  document.body.appendChild(spotlightOverlay);

  resizeCanvas();
  
  // Setup Event Listeners
  overlayCanvas.addEventListener('mousedown', startDraw);
  overlayCanvas.addEventListener('mousemove', draw);
  overlayCanvas.addEventListener('mouseup', stopDraw);
  overlayCanvas.addEventListener('mouseout', stopDraw);
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('keydown', handleHotkeys);
}

function resizeCanvas() {
  const scale = window.devicePixelRatio || 1;
  overlayCanvas.width = window.innerWidth * scale;
  overlayCanvas.height = window.innerHeight * scale;
  ctx = overlayCanvas.getContext('2d');
  ctx.scale(scale, scale);
  redrawAll();
}

function removeCanvas() {
  document.getElementById('ast-overlay')?.remove();
  document.getElementById('ast-spotlight')?.remove();
  overlayCanvas = null;
  ctx = null;
  spotlightOverlay = null;
}

// Draw logic
function startDraw(e) {
  if (!isEnabled) return;
  if (currentTool === 'spotlight' || currentTool === 'laser') return; // Handled in mousemove

  isDrawing = true;
  startX = e.clientX;
  startY = e.clientY;
  
  currentStroke = { tool: currentTool, color: currentColor, points: [{x: startX, y: startY}] };
  
  if (['pen', 'highlight', 'eraser'].includes(currentTool)) {
    ctx.beginPath();
    ctx.moveTo(startX, startY);
  }
}

function draw(e) {
  if (!isEnabled) return;
  currentX = e.clientX;
  currentY = e.clientY;

  // Handle Spotlight
  if (currentTool === 'spotlight') {
    spotlightOverlay.style.display = 'block';
    spotlightOverlay.style.background = `radial-gradient(circle 150px at ${currentX}px ${currentY}px, transparent 0%, rgba(0,0,0,0.85) 100%)`;
    return;
  } else {
    if (spotlightOverlay) spotlightOverlay.style.display = 'none';
  }

  // Handle Laser (Temporary dot, no save)
  if (currentTool === 'laser') {
    redrawAll(); // Clear previous laser dot
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.arc(currentX, currentY, 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#ff0000';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.shadowBlur = 0; // reset
    return;
  }

  if (!isDrawing) return;
  currentStroke.points.push({x: currentX, y: currentY});

  setupBrush(currentTool, currentColor);

  if (['pen', 'highlight', 'eraser'].includes(currentTool)) {
    ctx.lineTo(currentX, currentY);
    ctx.stroke();
  }
}

function stopDraw(e) {
  if (!isDrawing || !isEnabled) return;
  isDrawing = false;
  
  if (currentTool === 'rect') {
    currentStroke.width = currentX - startX;
    currentStroke.height = currentY - startY;
  } else if (currentTool === 'circle') {
    currentStroke.radius = Math.sqrt(Math.pow(currentX - startX, 2) + Math.pow(currentY - startY, 2));
  }
  
  if (currentStroke) {
    strokes.push(currentStroke);
    redoStack = [];
    currentStroke = null;
    redrawAll(); // Redraw everything so shapes show up properly
  }
}

function undo() {
  if (strokes.length > 0) {
    redoStack.push(strokes.pop());
    redrawAll();
  }
}

function redo() {
  if (redoStack.length > 0) {
    strokes.push(redoStack.pop());
    redrawAll();
  }
}

function handleHotkeys(e) {
  if (!isEnabled) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    if (e.shiftKey) redo(); else undo();
    e.preventDefault();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    redo();
    e.preventDefault();
    return;
  }

  let newTool = null;
  switch(e.key.toLowerCase()) {
    case 'p': newTool = 'pen'; break;
    case 'h': newTool = 'highlight'; break;
    case 'e': newTool = 'eraser'; break;
    case 'r': newTool = 'rect'; break;
    case 'c': newTool = 'circle'; break;
    case 's': newTool = 'spotlight'; break;
    case 'l': newTool = 'laser'; break;
    case 'escape': 
      isEnabled = false;
      chrome.runtime.sendMessage({ action: 'toggleDrawing', state: false });
      if (overlayCanvas) overlayCanvas.style.pointerEvents = 'none';
      if (spotlightOverlay) spotlightOverlay.style.display = 'none';
      document.body.style.userSelect = 'auto';
      redrawAll();
      break;
  }
  
  if (newTool) {
    currentTool = newTool;
    if (currentTool !== 'spotlight' && spotlightOverlay) spotlightOverlay.style.display = 'none';
    if (currentTool !== 'laser') redrawAll();
    chrome.runtime.sendMessage({ action: 'toolChanged', tool: currentTool });
  }
}

function setupBrush(tool, color) {
  ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
  
  if (tool === 'pen') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  } else if (tool === 'highlight') {
    ctx.strokeStyle = color + '66';
    ctx.lineWidth = 15;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'round';
  } else if (tool === 'eraser') {
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = 20;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
  }
}

function redrawAll() {
  if (!ctx) return;
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  
  for (const stroke of strokes) {
    if (stroke.tool === 'clear') {
      ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      continue;
    }
    setupBrush(stroke.tool, stroke.color);
    
    if (['pen', 'highlight', 'eraser'].includes(stroke.tool) && stroke.points && stroke.points.length > 0) {
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    } else if (stroke.tool === 'rect' && stroke.points.length > 0) {
      ctx.strokeRect(stroke.points[0].x, stroke.points[0].y, stroke.width, stroke.height);
    } else if (stroke.tool === 'circle' && stroke.points.length > 0) {
      ctx.beginPath();
      ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.radius, 0, 2 * Math.PI);
      ctx.stroke();
    }
  }
  
  if (showRemoteCursor && remoteCursorX !== null && remoteCursorY !== null && currentTool !== 'laser' && currentTool !== 'spotlight') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.arc(remoteCursorX, remoteCursorY, 6, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(52, 152, 219, 0.8)'; // A nice blue indicator
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'white';
    ctx.stroke();
  }
}

// Data Export/Import
function exportWorkspace() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(strokes));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", "ast_workspace.json");
  dlAnchorElem.click();
}

function exportPNG() {
  if (!overlayCanvas) return;
  const a = document.createElement('a');
  a.href = overlayCanvas.toDataURL("image/png");
  a.download = "ast_drawing.png";
  a.click();
}

function exportSVG() {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${window.innerWidth}" height="${window.innerHeight}">`;
  
  strokes.forEach(stroke => {
    if (['pen', 'highlight', 'eraser'].includes(stroke.tool) && stroke.points.length > 0) {
      let d = `M ${stroke.points[0].x} ${stroke.points[0].y} `;
      for (let i = 1; i < stroke.points.length; i++) {
        d += `L ${stroke.points[i].x} ${stroke.points[i].y} `;
      }
      let color = stroke.tool === 'eraser' ? 'transparent' : stroke.color;
      let opacity = stroke.tool === 'highlight' ? '0.4' : '1';
      let width = stroke.tool === 'pen' ? 3 : 15;
      if (stroke.tool !== 'eraser') {
        svg += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
    } else if (stroke.tool === 'rect') {
      svg += `<rect x="${stroke.points[0].x}" y="${stroke.points[0].y}" width="${stroke.width}" height="${stroke.height}" fill="none" stroke="${stroke.color}" stroke-width="3"/>`;
    } else if (stroke.tool === 'circle') {
      svg += `<circle cx="${stroke.points[0].x}" cy="${stroke.points[0].y}" r="${stroke.radius}" fill="none" stroke="${stroke.color}" stroke-width="3"/>`;
    }
  });
  
  svg += `</svg>`;
  
  const blob = new Blob([svg], {type: "image/svg+xml;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = "ast_drawing.svg";
  a.click();
  URL.revokeObjectURL(url);
}

function importWorkspace(jsonString) {
  try {
    strokes = JSON.parse(jsonString);
    redrawAll();
  } catch (e) {
    console.error("AST: Invalid JSON for import");
  }
}

// Message Listener from Popup/Background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleToolbar') {
    try {
      createToolbar();
    } catch (err) {
      alert("AST Extension Error: " + err.message);
      console.error("AST Extension Error:", err);
    }
  }
  
  if (request.action === 'toggleDrawing') {
    isEnabled = request.enabled;
    if (isEnabled) {
      initCanvas();
      overlayCanvas.style.pointerEvents = 'auto'; 
      document.body.style.userSelect = 'none'; 
    } else {
      if (overlayCanvas) overlayCanvas.style.pointerEvents = 'none'; 
      if (spotlightOverlay) spotlightOverlay.style.display = 'none';
      document.body.style.userSelect = 'auto';
      redrawAll(); // clears laser dot if left
    }
  }
  
  if (request.action === 'setTool') {
    currentTool = request.tool;
    if (currentTool !== 'spotlight' && spotlightOverlay) {
      spotlightOverlay.style.display = 'none';
    }
    if (currentTool !== 'laser') {
      redrawAll(); // clear laser dot
    }
  }
  
  if (request.action === 'setColor') currentColor = request.color;
  
  if (request.action === 'clearCanvas') {
    strokes.push({ tool: 'clear' });
    redoStack = [];
    redrawAll();
  }
  
  if (request.action === 'exportJSON') exportWorkspace();
  if (request.action === 'exportPNG') exportPNG();
  if (request.action === 'exportSVG') exportSVG();
  if (request.action === 'importJSON') importWorkspace(request.data);
  if (request.action === 'startRecording') startRecording();
  if (request.action === 'stopRecording') stopRecording(request.format);
  if (request.action === 'autoRedact') autoRedact();
});

// Screen Recording
let mediaRecorder;
let recordedChunks = [];

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.start();
  } catch (err) {
    console.error("AST Recording failed", err);
  }
}

function stopRecording(format) {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      recordedChunks = [];
      
      if (format === 'webm' || !format) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'ast_recording.webm';
        a.click();
      } else {
        // Send to background for FFmpeg conversion
        const buffer = await blob.arrayBuffer();
        chrome.runtime.sendMessage({
          action: 'convertVideo',
          buffer: Array.from(new Uint8Array(buffer)), // Cannot pass raw ArrayBuffer cleanly in MV3 without offscreen easily sometimes, but Array.from works
          format: format
        });
      }
    };
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  }
}

// Auto-Redact
function autoRedact() {
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
  // A simple 10+ digit phone regex
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  
  const style = document.createElement('style');
  style.textContent = '.ast-redacted { filter: blur(6px); user-select: none; pointer-events: none; }';
  document.head.appendChild(style);

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  const nodes = [];
  let node;
  while (node = walker.nextNode()) {
    if (node.parentNode && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.parentNode.nodeName)) {
      if (emailRegex.test(node.nodeValue) || phoneRegex.test(node.nodeValue)) {
        nodes.push(node.parentNode);
      }
    }
  }
  nodes.forEach(n => n.classList.add('ast-redacted'));
}
let astToolbar = null;
let isPinned = false;
let peer = null;

function createToolbar() {
  if (astToolbar) {
    astToolbar.style.display = astToolbar.style.display === 'none' ? 'flex' : 'none';
    return;
  }

  astToolbar = document.createElement('div');
  astToolbar.id = 'ast-floating-toolbar';
  
  Object.assign(astToolbar.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    width: '320px',
    backgroundColor: '#1e272e',
    color: '#ecf0f1',
    borderRadius: '12px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    zIndex: '9999999',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '"Segoe UI", system-ui, sans-serif',
    overflow: 'hidden',
    transition: 'opacity 0.2s',
    border: '1px solid #34495e'
  });

  const style = document.createElement('style');
  style.textContent = `
    .ast-tb-header { background: #2c3e50; padding: 12px; display: flex; justify-content: space-between; align-items: center; cursor: move; user-select: none; }
    .ast-tb-title { font-weight: bold; font-size: 14px; margin: 0; display:flex; align-items:center; gap:8px;}
    .ast-tb-title img { width:20px; height:20px; }
    .ast-tb-content { padding: 15px; display: flex; flex-direction: column; gap: 15px; max-height: 80vh; overflow-y: auto; }
    .ast-tb-btn { background: #34495e; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; transition: 0.2s; font-size: 13px; font-weight: 500; }
    .ast-tb-btn:hover { background: #415b76; }
    .ast-tb-btn.active { background: #2ecc71; }
    .ast-tb-tools { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 15px; }
    .ast-tb-tool { font-size: 16px; padding: 10px; background: #2c3e50; border: none; border-radius: 6px; cursor: pointer; color: white; }
    .ast-tb-tool.active { background: #3498db; }
    .ast-tb-colors { display: flex; gap: 10px; margin-bottom: 15px; }
    .ast-tb-color { width: 24px; height: 24px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; }
    .ast-tb-color.active { border-color: white; transform: scale(1.1); }
    .ast-tb-section { margin-bottom: 15px; border-bottom: 1px solid #34495e; padding-bottom: 15px; }
    .ast-tb-section-title { font-size: 12px; color: #bdc3c7; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; font-weight: bold; }
    .ast-qr-box { background: white; padding: 10px; border-radius: 8px; display: flex; flex-direction: column; align-items: center; gap: 10px; margin-top:10px; }
    .ast-qr-box p { margin: 0; color: #333; font-size: 12px; }
    #ast-qr-code { width: 150px; height: 150px; }
    .ast-tb-link { color: #3498db; text-decoration: none; font-size: 12px; display: block; margin-top:5px; text-align:center;}
  `;
  document.head.appendChild(style);

  astToolbar.innerHTML = `
    <div class="ast-tb-header" id="ast-tb-header">
      <p class="ast-tb-title">
        <img src="${chrome.runtime.getURL('icons/icon16.png')}" alt="icon">
        AST Tools
      </p>
      <div style="display:flex; gap:8px;">
        <button class="ast-tb-btn" id="ast-tb-pin" title="Pin / Unpin">📌 Pin</button>
        <button class="ast-tb-btn" id="ast-tb-close" title="Close">✖</button>
      </div>
    </div>
    <div class="ast-tb-content">
      <button class="ast-tb-btn" id="ast-tb-toggle-draw" style="margin-bottom: 5px;">Enable Drawing</button>
      
      <div class="ast-tb-section">
        <div class="ast-tb-section-title">Tools</div>
        <div class="ast-tb-tools">
          <button class="ast-tb-tool active" data-tool="pen" title="Pen (P)">🖊️</button>
          <button class="ast-tb-tool" data-tool="highlight" title="Highlighter (H)">🖍️</button>
          <button class="ast-tb-tool" data-tool="rect" title="Rectangle (R)">⬛</button>
          <button class="ast-tb-tool" data-tool="circle" title="Circle (C)">🔴</button>
          <button class="ast-tb-tool" data-tool="eraser" title="Eraser (E)">🧹</button>
          <button class="ast-tb-tool" data-tool="spotlight" title="Spotlight Mode (S)">🔦</button>
          <button class="ast-tb-tool" data-tool="laser" title="Laser Pointer (L)">🔴</button>
        </div>
        
        <div class="ast-tb-colors">
          <div class="ast-tb-color active" style="background: #e74c3c" data-color="#e74c3c"></div>
          <div class="ast-tb-color" style="background: #3498db" data-color="#3498db"></div>
          <div class="ast-tb-color" style="background: #2ecc71" data-color="#2ecc71"></div>
          <div class="ast-tb-color" style="background: #f1c40f" data-color="#f1c40f"></div>
          <div class="ast-tb-color" style="background: #000000" data-color="#000000"></div>
        </div>
        <button class="ast-tb-btn" id="ast-tb-clear" style="width: 100%">Clear Canvas</button>
      </div>

      <div class="ast-tb-section">
        <div class="ast-tb-section-title">Mobile Remote</div>
        <p style="font-size:12px; color:#bdc3c7; margin-top:0;">Generate an ID to use your phone/tablet as a drawing tablet.</p>
        <button class="ast-tb-btn" id="ast-tb-gen-id" style="width: 100%;">Generate Mobile ID</button>
        <div id="ast-tb-qr-container" style="display:none;" class="ast-qr-box">
          <p>Scan to Connect:</p>
          <div id="ast-qr-code"></div>
          <p style="font-weight:bold;">ID: <span id="ast-tb-manual-id">...</span></p>
        </div>
      </div>

      <div class="ast-tb-section" style="border:none; padding-bottom:0;">
        <div class="ast-tb-section-title">Export / Capture</div>
        <div style="display:flex; gap:5px; margin-bottom:10px;">
          <button class="ast-tb-btn" id="ast-tb-exp-png" style="flex:1;">Export PNG</button>
          <button class="ast-tb-btn" id="ast-tb-exp-svg" style="flex:1;">Export SVG</button>
        </div>
        <button class="ast-tb-btn" id="ast-tb-redact" style="width: 100%">Auto-Redact Sensitive Data 🔒</button>
        <a href="#" id="ast-tb-cam-hub" class="ast-tb-link">Open Webcam Hub</a>
      </div>
    </div>
  `;

  document.body.appendChild(astToolbar);
  
  if (isEnabled) {
    const t = astToolbar.querySelector('#ast-tb-toggle-draw');
    t.classList.add('active');
    t.innerText = 'Drawing Enabled';
  }
  
  setupToolbarEvents();
  setupDrag();
}

function setupToolbarEvents() {
  const qS = (sel) => astToolbar.querySelector(sel);
  const qSA = (sel) => astToolbar.querySelectorAll(sel);

  qS('#ast-tb-close').onclick = () => astToolbar.style.display = 'none';
  qS('#ast-tb-pin').onclick = () => {
    isPinned = !isPinned;
    qS('#ast-tb-pin').style.background = isPinned ? '#27ae60' : '';
    qS('#ast-tb-pin').innerText = isPinned ? '📌 Pinned' : '📌 Pin';
  };

  const toggleDrawBtn = qS('#ast-tb-toggle-draw');
  toggleDrawBtn.onclick = () => {
    isEnabled = !isEnabled;
    toggleDrawBtn.classList.toggle('active', isEnabled);
    toggleDrawBtn.innerText = isEnabled ? 'Drawing Enabled' : 'Enable Drawing';
    
    if (isEnabled) {
      initCanvas();
      if (overlayCanvas) overlayCanvas.style.pointerEvents = 'auto';
      document.body.style.userSelect = 'none';
    } else {
      if (overlayCanvas) overlayCanvas.style.pointerEvents = 'none';
      if (spotlightOverlay) spotlightOverlay.style.display = 'none';
      document.body.style.userSelect = 'auto';
      redrawAll();
    }
  };

  qSA('.ast-tb-tool').forEach(btn => {
    btn.onclick = () => {
      qSA('.ast-tb-tool').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTool = btn.dataset.tool;
      
      if (currentTool !== 'spotlight' && spotlightOverlay) spotlightOverlay.style.display = 'none';
      if (currentTool !== 'laser') redrawAll();
      
      if (!isEnabled) toggleDrawBtn.click();
    };
  });

  qSA('.ast-tb-color').forEach(btn => {
    btn.onclick = () => {
      qSA('.ast-tb-color').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentColor = btn.dataset.color;
    };
  });

  qS('#ast-tb-clear').onclick = () => {
    strokes.push({ tool: 'clear' });
    redoStack = [];
    redrawAll();
  };

  qS('#ast-tb-exp-png').onclick = exportPNG;
  qS('#ast-tb-exp-svg').onclick = exportSVG;
  qS('#ast-tb-redact').onclick = autoRedact;
  qS('#ast-tb-cam-hub').onclick = (e) => {
    e.preventDefault();
    chrome.runtime.sendMessage({action: 'openCameraHub'});
  };

  const genIdBtn = qS('#ast-tb-gen-id');
  const qrContainer = qS('#ast-tb-qr-container');
  const manualIdEl = qS('#ast-tb-manual-id');
  
  genIdBtn.onclick = () => {
    genIdBtn.innerText = 'Initializing...';
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
        genIdBtn.style.display = 'none';
        qrContainer.style.display = 'flex';
        manualIdEl.innerText = id;
        
        const hostUrl = 'https://ozansarisoy.github.io/AnnoStylusTool/mobile/';
        const qrUrl = hostUrl + '?id=' + id;
        
        new QRCode(document.getElementById("ast-qr-code"), {
          text: qrUrl,
          width: 150,
          height: 150
        });
      });
      
      peer.on('connection', (conn) => {
        genIdBtn.style.display = 'block';
        genIdBtn.style.background = '#2ecc71';
        genIdBtn.innerText = 'Connected!';
        qrContainer.style.display = 'none';
        
        conn.on('data', (data) => {
          handleRemoteData(data);
        });
        
        conn.on('close', () => {
          genIdBtn.style.background = '#e74c3c';
          genIdBtn.innerText = 'Connection Lost';
          peer = null;
        });
      });
      
      peer.on('error', (err) => {
        genIdBtn.style.background = '#e74c3c';
        genIdBtn.innerText = 'Error: ' + err.type;
      });
    }
  };
}

function handleRemoteData(data) {
  if (!isEnabled) {
    document.getElementById('ast-tb-toggle-draw').click();
  }
  
  if (data.type === 'toolSelect') {
    if (data.tool === 'clear') {
      const clearBtn = astToolbar.querySelector('#ast-tb-clear');
      if (clearBtn) clearBtn.click();
    } else {
      const btn = astToolbar.querySelector(`[data-tool="${data.tool}"]`);
      if (btn) btn.click();
    }
    return;
  }
  
  const screenX = data.x * window.innerWidth;
  const screenY = data.y * window.innerHeight;
  const synthEvent = { clientX: screenX, clientY: screenY };
  
  remoteCursorX = screenX;
  remoteCursorY = screenY;
  showRemoteCursor = true;
  
  if (data.type === 'start') {
    startDraw(synthEvent);
  } else if (data.type === 'move') {
    draw(synthEvent);
  } else if (data.type === 'stop') {
    stopDraw(synthEvent);
    setTimeout(() => { showRemoteCursor = false; redrawAll(); }, 2000);
  } else if (data.type === 'hover') {
    if (currentTool === 'laser' || currentTool === 'spotlight') {
      draw(synthEvent);
    } else {
      redrawAll();
    }
  }
}

function setupDrag() {
  const header = document.getElementById('ast-tb-header');
  let isDragging = false;
  let currentX, currentY, initialX, initialY;
  let xOffset = 0, yOffset = 0;

  header.addEventListener('mousedown', dragStart);
  document.addEventListener('mouseup', dragEnd);
  document.addEventListener('mousemove', drag);

  function dragStart(e) {
    if (isPinned) return;
    initialX = e.clientX - xOffset;
    initialY = e.clientY - yOffset;
    
    if (e.target === header || e.target.parentNode === header) {
      isDragging = true;
    }
  }

  function dragEnd() {
    initialX = currentX;
    initialY = currentY;
    isDragging = false;
  }

  function drag(e) {
    if (isDragging && !isPinned) {
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
      xOffset = currentX;
      yOffset = currentY;
      
      astToolbar.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    }
  }
}
function exportPNG() {
  if (!overlayCanvas) return alert("Canvas is empty!");
  const link = document.createElement("a");
  link.download = "annotation.png";
  link.href = overlayCanvas.toDataURL("image/png");
  link.click();
}

function exportSVG() {
  alert("SVG export is coming soon!");
}

function autoRedact() {
  alert("Auto-Redact is coming soon!");
}
