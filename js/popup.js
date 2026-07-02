document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('toggleDrawing');
  const toolsPanel = document.getElementById('toolsPanel');
  const workflowControls = document.getElementById('workflowControls');
  const connectMobileBtn = document.getElementById('connectMobile');
  const mobileIdDisplay = document.getElementById('mobileIdDisplay');
  const peerIdEl = document.getElementById('peerId');
  const mobileStatus = document.getElementById('mobileStatus');
  const openCameraHubBtn = document.getElementById('openCameraHub');

  let isDrawingEnabled = false;
  let peer = null;

  // Toggle Drawing Mode
  toggleBtn.addEventListener('click', async () => {
    isDrawingEnabled = !isDrawingEnabled;
    toggleBtn.textContent = isDrawingEnabled ? 'Disable Drawing' : 'Enable Drawing';
    toggleBtn.classList.toggle('primary');
    toggleBtn.classList.toggle('secondary');
    toolsPanel.style.display = isDrawingEnabled ? 'block' : 'none';
    workflowControls.style.display = isDrawingEnabled ? 'block' : 'none';

    // Send message to content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { action: 'toggleDrawing', enabled: isDrawingEnabled });
    }
  });

  // Tool Selection
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      const tool = e.currentTarget.dataset.tool;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) chrome.tabs.sendMessage(tab.id, { action: 'setTool', tool });
    });
  });

  // Color Selection
  document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', async (e) => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      e.currentTarget.classList.add('active');
      const color = e.currentTarget.dataset.color;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) chrome.tabs.sendMessage(tab.id, { action: 'setColor', color });
    });
  });

  // Clear Canvas
  document.getElementById('clearCanvas').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) chrome.tabs.sendMessage(tab.id, { action: 'clearCanvas' });
  });

  // Workflow: Export
  document.getElementById('exportJson').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) chrome.tabs.sendMessage(tab.id, { action: 'exportJSON' });
  });
  document.getElementById('exportPng').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) chrome.tabs.sendMessage(tab.id, { action: 'exportPNG' });
  });
  document.getElementById('exportSvg').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) chrome.tabs.sendMessage(tab.id, { action: 'exportSVG' });
  });

  // Workflow: Import JSON
  const importFileInput = document.getElementById('importJsonFile');
  document.getElementById('importJsonBtn').addEventListener('click', () => {
    importFileInput.click();
  });
  importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) chrome.tabs.sendMessage(tab.id, { action: 'importJSON', data: ev.target.result });
    };
    reader.readAsText(file);
  });

  // Workflow: Screenshot
  document.getElementById('captureScreenshot').addEventListener('click', async () => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      // Create a temporary link to download it, or copy to clipboard
      fetch(dataUrl).then(res => res.blob()).then(blob => {
        const item = new ClipboardItem({ "image/png": blob });
        navigator.clipboard.write([item]).then(() => {
          document.getElementById('captureScreenshot').textContent = 'Copied! ✅';
          setTimeout(() => { document.getElementById('captureScreenshot').textContent = 'Screenshot 📋'; }, 2000);
        }).catch(err => {
          console.error('Clipboard error', err);
          // Fallback: download
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = 'ast_screenshot.png';
          a.click();
        });
      });
    });
  });

  // Workflow: Record Screen
  let isRecording = false;
  document.getElementById('recordScreen').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    
    isRecording = !isRecording;
    const btn = document.getElementById('recordScreen');
    if (isRecording) {
      btn.textContent = 'Stop ⏹️';
      btn.style.backgroundColor = '#2ecc71'; // green when recording
      chrome.tabs.sendMessage(tab.id, { action: 'startRecording' });
    } else {
      btn.textContent = 'Start 🎥';
      btn.style.backgroundColor = '#e74c3c';
      const format = document.getElementById('videoFormat').value;
      chrome.tabs.sendMessage(tab.id, { action: 'stopRecording', format: format });
    }
  });

  // Workflow: Auto-Redact
  document.getElementById('redactData').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) chrome.tabs.sendMessage(tab.id, { action: 'autoRedact' });
  });

  // Mobile Remote Setup
  connectMobileBtn.addEventListener('click', () => {
    connectMobileBtn.disabled = true;
    connectMobileBtn.textContent = 'Generating...';

    // Create custom ID to skip PeerJS XHR fetch (which is blocked by COEP require-corp)
    const customId = 'ast-' + Math.random().toString(36).substr(2, 9);
    peer = new Peer(customId); // Create new PeerJS instance
    
    peer.on('open', (id) => {
      connectMobileBtn.style.display = 'none';
      mobileIdDisplay.style.display = 'block';
      peerIdEl.textContent = id;
      
      // We use the GitHub Pages URL for the mobile remote app
      const HOSTED_URL = 'https://ozansarisoy.github.io/AnnoStylusTool/mobile/'; 
      const connectUrl = `${HOSTED_URL}?id=${id}`;
      
      // Generate QR Code pointing to the URL with the auto-connect ID
      const qrContainer = document.getElementById('mobileQrCode');
      qrContainer.innerHTML = ''; // clear previous if any
      new QRCode(qrContainer, {
        text: connectUrl,
        width: 120,
        height: 120,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.L
      });
    });

    peer.on('connection', (conn) => {
      mobileStatus.textContent = 'Phone connected!';
      
      conn.on('data', async (data) => {
        // Relay data to active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          chrome.tabs.sendMessage(tab.id, { action: 'remoteDraw', data });
        }
      });
      
      conn.on('close', () => {
        mobileStatus.textContent = 'Phone disconnected.';
      });
    });
    
    peer.on('error', (err) => {
      mobileStatus.textContent = 'Error: ' + err.type;
      connectMobileBtn.disabled = false;
      connectMobileBtn.textContent = 'Generate Mobile ID';
    });
  });

  // Open Camera Hub
  openCameraHubBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openCameraHub' });
  });
});
