const peer = new Peer();
let conn = null;

const peerIdInput = document.getElementById('peerIdInput');
const connectBtn = document.getElementById('connectBtn');
const statusText = document.getElementById('status');
const setupDiv = document.getElementById('setup');
const cameraContainer = document.getElementById('camera-container');

const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('outputCanvas');
const canvasCtx = canvasElement.getContext('2d');

let isDrawing = false;
let pinchThreshold = 0.05; // Adjust based on testing

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
    cameraContainer.style.display = 'block';
    statusText.innerText = 'Connected! Starting camera...';
    startCamera();
  });
  
  conn.on('close', () => {
    setupDiv.style.display = 'flex';
    cameraContainer.style.display = 'none';
    statusText.innerText = 'Connection lost.';
    isDrawing = false;
  });
  
  conn.on('error', (err) => {
    statusText.innerText = 'Error: ' + err.message;
  });
});

function onResults(results) {
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
  
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0];
    drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 5});
    drawLandmarks(canvasCtx, landmarks, {color: '#FF0000', lineWidth: 2});

    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];
    
    // Calculate distance between thumb and index finger
    const dist = Math.sqrt(
      Math.pow(indexTip.x - thumbTip.x, 2) + 
      Math.pow(indexTip.y - thumbTip.y, 2) + 
      Math.pow(indexTip.z - thumbTip.z, 2)
    );
    
    // Mirror X coordinate because webcam is mirrored
    const screenX = 1.0 - indexTip.x;
    const screenY = indexTip.y;
    
    const isPinched = dist < pinchThreshold;
    
    if (isPinched && !isDrawing) {
      isDrawing = true;
      if (conn && conn.open) conn.send({ type: 'start', x: screenX, y: screenY });
      statusText.innerText = 'Drawing...';
      statusText.style.color = '#2ecc71';
    } else if (isPinched && isDrawing) {
      if (conn && conn.open) conn.send({ type: 'move', x: screenX, y: screenY });
    } else if (!isPinched && isDrawing) {
      isDrawing = false;
      if (conn && conn.open) conn.send({ type: 'stop' });
      statusText.innerText = 'Hovering (Pinch to draw)';
      statusText.style.color = '#f1c40f';
    } else {
      statusText.innerText = 'Hovering (Pinch to draw)';
      statusText.style.color = '#f1c40f';
    }
    
    // Draw a circle at the cursor position
    canvasCtx.beginPath();
    canvasCtx.arc(indexTip.x * canvasElement.width, indexTip.y * canvasElement.height, 10, 0, 2 * Math.PI);
    canvasCtx.fillStyle = isPinched ? '#2ecc71' : '#e74c3c';
    canvasCtx.fill();
  }
  canvasCtx.restore();
}

function startCamera() {
  const hands = new Hands({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
  }});
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  hands.onResults(onResults);
  
  const camera = new Camera(videoElement, {
    onFrame: async () => {
      await hands.send({image: videoElement});
    },
    width: 640,
    height: 480
  });
  camera.start();
}
