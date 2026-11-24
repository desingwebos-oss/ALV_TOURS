const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3849;
const ROOT = path.resolve(__dirname);

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<body>
<h1>Vector-Grade Upscaling</h1>
<div id="status">Starting...</div>
<script>
// Hermite smoothstep
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

async function run() {
  const status = document.getElementById('status');
  for (let i = 1; i <= 7; i++) {
    status.textContent = 'Processing bus ' + i;
    const img = new Image();
    // Load original backup or current image
    img.src = '/img/bus' + i + '.webp?' + Date.now();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const targetW = 1024;
    const targetH = 1024;

    const cv = document.createElement('canvas');
    cv.width = targetW;
    cv.height = targetH;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const imgData = ctx.getImageData(0, 0, targetW, targetH);
    const d = imgData.data;
    const len = targetW * targetH * 4;

    if (i === 2) {
      // Babasonicos: Pure yellow (#FFEC00) and black cloud (#1D1D1B)
      // Extract edges with high precision
      for (let p = 0; p < len; p += 4) {
        const r = d[p], g = d[p+1], b = d[p+2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        // Sharpen transition between dark cloud (lum ~ 30) and bright yellow (lum ~ 210)
        const t = smoothstep(65, 145, lum);
        // Yellow color: (255, 236, 0), Dark color: (25, 25, 25)
        d[p] = Math.round(25 * (1 - t) + 255 * t);
        d[p+1] = Math.round(25 * (1 - t) + 236 * t);
        d[p+2] = Math.round(25 * (1 - t) + 0 * t);
        d[p+3] = 255;
      }
    } else if (i === 3) {
      // Mars Volta: Black background and white talisman drawing
      for (let p = 0; p < len; p += 4) {
        const r = d[p], g = d[p+1], b = d[p+2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        // Suppress background noise and snap talisman lines to bright white
        const t = smoothstep(55, 130, lum);
        const val = Math.round(252 * t);
        d[p] = val;
        d[p+1] = val;
        d[p+2] = val;
        d[p+3] = 255;
      }
    } else if (i === 5) {
      // Enjambre bee: transparent bg, black lines, yellow wings (#FFCC00), orange body (#F15A24)
      for (let p = 0; p < len; p += 4) {
        const a = d[p+3];
        if (a < 35) { d[p+3] = 0; continue; }
        const r = d[p], g = d[p+1], b = d[p+2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum < 70) {
          // Black outline
          const edge = smoothstep(15, 65, lum);
          d[p] = Math.round(18 * (1 - edge));
          d[p+1] = Math.round(18 * (1 - edge));
          d[p+2] = Math.round(18 * (1 - edge));
          d[p+3] = Math.round(255 * smoothstep(20, 60, a));
        } else if (r > 200 && g > 160) {
          // Yellow wings
          d[p] = 255; d[p+1] = 210; d[p+2] = 0; d[p+3] = 255;
        } else if (r > 200 && g < 140) {
          // Orange body
          d[p] = 245; d[p+1] = 95; d[p+2] = 30; d[p+3] = 255;
        }
      }
    } else if (i === 6) {
      // Caifanes: Yellow background, black xolo dog, white dots, red tongue
      for (let p = 0; p < len; p += 4) {
        const r = d[p], g = d[p+1], b = d[p+2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        // Check for red tongue: r > 160, g < 40, b < 40
        if (r > 140 && g < 60 && b < 60) {
          d[p] = 225; d[p+1] = 20; d[p+2] = 20; d[p+3] = 255;
        } else if (lum < 65) {
          // Black dog body
          d[p] = 16; d[p+1] = 16; d[p+2] = 16; d[p+3] = 255;
        } else if (r > 200 && g > 200 && b > 200) {
          // White dots
          d[p] = 255; d[p+1] = 255; d[p+2] = 255; d[p+3] = 255;
        } else {
          // Yellow background
          d[p] = 255; d[p+1] = 230; d[p+2] = 0; d[p+3] = 255;
        }
      }
    } else if (i === 1) {
      // Jose Madero: Raiders shield (black & white + red sword tips)
      // Unsharp mask + contrast booster
      const copy = new Uint8ClampedArray(d);
      for (let y = 1; y < targetH - 1; y++) {
        const row = y * targetW;
        for (let x = 1; x < targetW - 1; x++) {
          const idx = (row + x) * 4;
          const a = copy[idx + 3];
          if (a < 30) { d[idx + 3] = 0; continue; }

          const r = copy[idx], g = copy[idx+1], b = copy[idx+2];
          // Check red sword tips
          if (r > 130 && g < 50 && b < 50) {
            d[idx] = Math.min(255, r + 20);
            continue;
          }

          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const top = 0.299 * copy[((y-1)*targetW+x)*4] + 0.587 * copy[((y-1)*targetW+x)*4+1] + 0.114 * copy[((y-1)*targetW+x)*4+2];
          const bot = 0.299 * copy[((y+1)*targetW+x)*4] + 0.587 * copy[((y+1)*targetW+x)*4+1] + 0.114 * copy[((y+1)*targetW+x)*4+2];
          const lft = 0.299 * copy[(row+(x-1))*4] + 0.587 * copy[(row+(x-1))*4+1] + 0.114 * copy[(row+(x-1))*4+2];
          const rgt = 0.299 * copy[(row+(x+1))*4] + 0.587 * copy[(row+(x+1))*4+1] + 0.114 * copy[(row+(x+1))*4+2];

          const lap = 4 * lum - (top + bot + lft + rgt);
          let nLum = lum + lap * 0.9;
          if (nLum < 50) nLum = Math.max(0, nLum - 20);
          else if (nLum > 190) nLum = Math.min(255, nLum + 20);
          nLum = Math.max(0, Math.min(255, Math.round(nLum)));

          d[idx] = nLum;
          d[idx+1] = nLum;
          d[idx+2] = nLum;
          d[idx+3] = a > 200 ? 255 : a;
        }
      }
    } else if (i === 7) {
      // Caligaris clown
      const copy = new Uint8ClampedArray(d);
      for (let y = 1; y < targetH - 1; y++) {
        const row = y * targetW;
        for (let x = 1; x < targetW - 1; x++) {
          const idx = (row + x) * 4;
          const a = copy[idx + 3];
          if (a < 30) { d[idx + 3] = 0; continue; }
          for (let c = 0; c < 3; c++) {
            const v = copy[idx + c];
            const top = copy[((y-1)*targetW+x)*4+c];
            const bot = copy[((y+1)*targetW+x)*4+c];
            const lft = copy[(row+(x-1))*4+c];
            const rgt = copy[(row+(x+1))*4+c];
            const lap = 4 * v - (top + bot + lft + rgt);
            d[idx + c] = Math.max(0, Math.min(255, Math.round(v + lap * 0.8)));
          }
        }
      }
    } else if (i === 4) {
      // Caloncho photo: Multi-pass high-frequency detail restoration
      const copy = new Uint8ClampedArray(d);
      for (let y = 1; y < targetH - 1; y++) {
        const row = y * targetW;
        for (let x = 1; x < targetW - 1; x++) {
          const idx = (row + x) * 4;
          for (let c = 0; c < 3; c++) {
            const v = copy[idx + c];
            const top = copy[((y-1)*targetW+x)*4+c];
            const bot = copy[((y+1)*targetW+x)*4+c];
            const lft = copy[(row+(x-1))*4+c];
            const rgt = copy[(row+(x+1))*4+c];
            const lap = 4 * v - (top + bot + lft + rgt);
            // Sharpen photo without excessive grain
            d[idx + c] = Math.max(0, Math.min(255, Math.round(v + lap * 0.65)));
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);

    const dataUrl = cv.toDataURL('image/webp', 0.96);
    const base64 = dataUrl.split(',')[1];

    await fetch('/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'bus' + i, data: base64 })
    });
  }

  status.textContent = 'DONE';
  await fetch('/done', { method: 'POST' });
}
window.onload = run;
</script>
</body>
</html>`);
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/img/')) {
    const file = path.join(ROOT, req.url.split('?')[0]);
    if (fs.existsSync(file)) {
      res.writeHead(200, { 'Content-Type': 'image/webp' });
      fs.createReadStream(file).pipe(res);
      return;
    }
  }

  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const { id, data } = JSON.parse(body);
      const outPath = path.join(ROOT, 'img', id + '.webp');
      fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
      console.log('Saved ultra-crisp:', id, 'size:', fs.statSync(outPath).size);
      res.writeHead(200);
      res.end('ok');
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/done') {
    console.log('All ultra-crisp images updated successfully!');
    res.writeHead(200);
    res.end('done');
    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 500);
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const cmd = `"${edgePath}" --headless --disable-gpu http://localhost:${PORT}/`;
  exec(cmd, (err) => {
    if (err) console.error('Edge notice:', err.message);
  });
});
