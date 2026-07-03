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
      chrome.tabs.sendMessage(tab.id, { action: 'toggleDrawing', enabled: isDrawingEnabled }).catch(e => console.warn("Content script missing", e));
    }
  });

  // Tool Selection
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      const tool = e.currentTarget.dataset.tool;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) chrome.tabs.sendMessage(tab.id, { action: 'setTool', tool }).catch(e => console.warn("Content script missing", e));
    });
  });

  // Color Selection
  document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', async (e) => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      e.currentTarget.classList.add('active');
      const color = e.currentTarget.dataset.color;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) chrome.tabs.sendMessage(tab.id, { action: 'setColor', color }).catch(e => console.warn("Content script missing", e));
    });
  });

  // Clear Canvas
  document.getElementById('clearCanvas').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) chrome.tabs.sendMessage(tab.id, { action: 'clearCanvas' }).catch(e => console.warn("Content script missing", e));
  });

  // Workflow: Export
  document.getElementById('exportJson').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) chrome.tabs.sendMessage(tab.id, { action: 'exportJSON' }).catch(e => console.warn("Content script missing", e));
  });
  document.getElementById('exportPng').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) chrome.tabs.sendMessage(tab.id, { action: 'exportPNG' }).catch(e => console.warn("Content script missing", e));
  });
  document.getElementById('exportSvg').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) chrome.tabs.sendMessage(tab.id, { action: 'exportSVG' }).catch(e => console.warn("Content script missing", e));
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
      if (tab) chrome.tabs.sendMessage(tab.id, { action: 'importJSON', data: ev.target.result }).catch(e => console.warn("Content script missing", e));
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
      chrome.tabs.sendMessage(tab.id, { action: 'startRecording' }).catch(e => console.warn("Content script missing", e));
    } else {
      btn.textContent = 'Start 🎥';
      btn.style.backgroundColor = '#e74c3c';
      const format = document.getElementById('videoFormat').value;
      chrome.tabs.sendMessage(tab.id, { action: 'stopRecording', format: format }).catch(e => console.warn("Content script missing", e));
    }
  });

  // Workflow: Auto-Redact
  document.getElementById('redactData').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) chrome.tabs.sendMessage(tab.id, { action: 'autoRedact' }).catch(e => console.warn("Content script missing", e));
  });

  // Mobile Remote Setup
  const mobileQrCode = document.getElementById('mobileQrCode');
  
  connectMobileBtn.addEventListener('click', async () => {
    connectMobileBtn.disabled = true;
    mobileStatus.textContent = 'Connecting...';
    mobileQrCode.innerHTML = '';
    
    chrome.runtime.sendMessage({ action: 'startMobileRemoteBg' }, (response) => {
      if (chrome.runtime.lastError) {
        mobileStatus.textContent = 'Error: ' + chrome.runtime.lastError.message;
        connectMobileBtn.disabled = false;
        return;
      }
      if (response && response.id) {
        mobileStatus.textContent = 'Ready! Scan QR with your phone:';
        connectMobileBtn.style.display = 'none';
        mobileIdDisplay.style.display = 'block';
        document.getElementById('peerId').textContent = response.id;
        
        // Use GitHub Pages URL
        const mobileUrl = `https://ozansarisoy.github.io/AnnoStylusTool/mobile/?id=${response.id}`;
        
        // Generate QR Code locally to avoid COEP block
        new QRCode(mobileQrCode, {
          text: mobileUrl,
          width: 120,
          height: 120,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.L
        });
      } else if (response && response.error) {
        mobileStatus.textContent = 'Error: ' + response.error;
        connectMobileBtn.disabled = false;
      } else {
        mobileStatus.textContent = 'Error: Could not connect to PeerJS.';
        connectMobileBtn.disabled = false;
      }
    });
  });

  // Open Camera Hub
  openCameraHubBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openCameraHub' });
  });
});
