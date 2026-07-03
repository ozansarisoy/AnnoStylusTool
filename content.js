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
  
  if (request.action === 'relayDrawCommand') {
    const data = request.data;
    if (!isEnabled) {
      isEnabled = true;
      initCanvas();
      if (overlayCanvas) overlayCanvas.style.pointerEvents = 'auto'; 
      document.body.style.userSelect = 'none'; 
      chrome.runtime.sendMessage({ action: 'toggleDrawing', state: true });
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
