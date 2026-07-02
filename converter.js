document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  const progressFill = document.getElementById('progressFill');

  statusEl.innerText = "Requesting video data...";
  
  chrome.runtime.sendMessage({ action: 'getVideoData' }, async (response) => {
    if (!response || !response.buffer) {
      statusEl.innerText = "Error: No video data received.";
      return;
    }

    const { buffer, format } = response;
    const uint8Arr = new Uint8Array(buffer);
    
    statusEl.innerText = "Loading FFmpeg...";
    
    try {
      const { FFmpeg } = FFmpegWASM;
      const ffmpeg = new FFmpeg();
      
      ffmpeg.on('progress', ({ progress }) => {
        progressFill.style.width = `${Math.round(progress * 100)}%`;
      });
      
      ffmpeg.on('log', ({ message }) => {
        console.log(message);
      });

      // Load local core
      await ffmpeg.load({
        coreURL: chrome.runtime.getURL('lib/ffmpeg-core.js'),
        wasmURL: chrome.runtime.getURL('lib/ffmpeg-core.wasm')
      });

      statusEl.innerText = `Converting to ${format.toUpperCase()}...`;
      
      ffmpeg.writeFile('input.webm', uint8Arr);
      
      let outName = `output.${format}`;
      let args = [];
      
      if (format === 'mp4') {
        // Fast encoding
        args = ['-i', 'input.webm', '-c:v', 'copy', outName]; 
        // Note: webm is VP8/VP9, MP4 usually needs h264. Copying might fail if the player doesn't support VP8 in MP4.
        // But re-encoding is too slow in WASM. Let's try re-encoding with preset ultrafast just in case.
        args = ['-i', 'input.webm', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', outName];
      } else if (format === 'mov') {
        args = ['-i', 'input.webm', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', outName];
      } else if (format === 'mp3') {
        args = ['-i', 'input.webm', '-q:a', '0', '-map', 'a', outName];
      } else if (format === 'wav') {
        args = ['-i', 'input.webm', '-map', 'a', outName];
      }
      
      await ffmpeg.exec(args);
      
      const data = ffmpeg.readFile(outName);
      
      const blob = new Blob([data.buffer], { type: format === 'mp3' || format === 'wav' ? `audio/${format}` : `video/${format}` });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `ast_recording.${format}`;
      a.click();
      
      statusEl.innerText = "Done! You can close this tab.";
      progressFill.style.width = "100%";
      progressFill.style.background = "#2ecc71";
      
    } catch (e) {
      console.error(e);
      statusEl.innerText = "Error during conversion: " + e.message;
    }
  });
});
