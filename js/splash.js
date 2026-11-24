// Arranque ALV Tours: el logo se construye en remolino a partir de partículas, se queda un instante y se deshace girando.
// Sin estilos ni scripts en línea (CSP). Un toque en la pantalla salta la animación.
(() => {
  const ov = document.getElementById('splash');
  if (!ov) return;
  const cv = ov.querySelector('canvas'), ctx = cv.getContext('2d');
  const BG = '255,200,61';
  let raf = 0, fin_ = false;
  const fin = () => { if (fin_) return; fin_ = true; cancelAnimationFrame(raf); ov.classList.add('fuera'); setTimeout(() => ov.remove(), 450); };
  ov.addEventListener('pointerdown', fin);

  const img = new Image();
  img.onerror = fin;
  img.onload = () => { try { go(); } catch { fin(); } };
  img.src = 'img/logo-alv.png';

  function go() {
    const dpr = Math.min(devicePixelRatio || 1, 2), vw = innerWidth, vh = innerHeight;
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const k = Math.min(vw * 0.8 / iw, vh * 0.55 / ih, 460 / iw), lw = iw * k, lh = ih * k;
    const cx = vw / 2, cy = vh / 2, x0 = cx - lw / 2, y0 = cy - lh / 2;
    const drawCrisp = a => { ctx.globalAlpha = a; ctx.drawImage(img, x0, y0, lw, lh); ctx.globalAlpha = 1; };

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      drawCrisp(1); setTimeout(fin, 700); return;
    }

    // Muestreo del logo en una rejilla: cada celda opaca será una partícula con su color.
    const step = Math.max(3, Math.sqrt(lw * lh * 0.75 / 6500));
    const cols = Math.ceil(lw / step), rows = Math.ceil(lh / step);
    const off = document.createElement('canvas'); off.width = cols; off.height = rows;
    const octx = off.getContext('2d'); octx.drawImage(img, 0, 0, cols, rows);
    const px = octx.getImageData(0, 0, cols, rows).data;
    const P = [], buckets = new Map();
    let rmax = 1;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const o = (j * cols + i) * 4; if (px[o + 3] < 110) continue;
      const tx = x0 + (i + 0.5) * step - cx, ty = y0 + (j + 0.5) * step - cy, r = Math.hypot(tx, ty);
      const key = ((px[o] >> 4) << 8) | ((px[o + 1] >> 4) << 4) | (px[o + 2] >> 4);
      let b = buckets.get(key);
      if (!b) buckets.set(key, b = { c: `rgb(${(px[o] & 240) | 8},${(px[o + 1] & 240) | 8},${(px[o + 2] & 240) | 8})`, a: [] });
      b.a.push(P.length);
      P.push({ r, th: Math.atan2(ty, tx), a: Math.random(), b: Math.random() });
      if (r > rmax) rmax = r;
    }
    const R0 = rmax * 1.5, SP = 6.5, TB = 1400, TH = 500, TD = 1100, TOT = TB + TH + TD;
    const cl = v => v < 0 ? 0 : v > 1 ? 1 : v;
    let t0 = 0;

    const frame = now => {
      if (fin_) return;
      if (!t0) t0 = now;
      const t = now - t0;
      if (t >= TOT) return fin();
      const building = t < TB, holding = !building && t < TB + TH;
      ctx.fillStyle = `rgba(${BG},${holding ? 1 : 0.3})`; // en movimiento deja una estela
      ctx.fillRect(0, 0, vw, vh);
      let ca = 0, u = 0, v = 0;
      if (building) { u = t / TB; ca = cl((u - 0.88) / 0.12); }
      else if (holding) ca = 1;
      else { v = (t - TB - TH) / TD; ca = 1 - cl(v / 0.12); }

      if (!holding) {
        for (const bk of buckets.values()) {
          ctx.fillStyle = bk.c;
          for (const n of bk.a) {
            const p = P[n]; let rad, ang, sz;
            if (building) {
              const q = cl((u - (p.a * 0.25 + p.r / rmax * 0.15)) / 0.5), e = 1 - Math.pow(1 - q, 3);
              rad = p.r + (1 - e) * R0 * (0.7 + p.b * 0.6);
              ang = p.th + (1 - e) * SP * (0.8 + p.a * 0.4);
              sz = step * 1.1 * cl(q * 2.5);
            } else {
              const q = cl((v - ((1 - p.r / rmax) * 0.25 + p.a * 0.15)) / 0.5), e = q * q * q;
              rad = p.r + e * R0 * (0.8 + p.b * 0.8);
              ang = p.th - e * SP * (0.8 + p.a * 0.4);
              sz = step * 1.1 * (1 - q * 0.85);
            }
            if (sz < 0.3) continue;
            ctx.fillRect(cx + Math.cos(ang) * rad - sz / 2, cy + Math.sin(ang) * rad - sz / 2, sz, sz);
          }
        }
      }
      if (ca > 0) drawCrisp(ca);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }
})();
