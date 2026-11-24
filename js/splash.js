// Splash ALV Tours: Remolino vertical 3D de alta fidelidad con fragmentación vectorial por piezas.
// Las piezas (A, L sólida con mano rockera, V, T, O, U, R, S, rayos, lema y el óvalo en trozos)
// giran en un vórtice tridimensional vertical (eje Y, profundidad Z y perspectiva) y convergen con precisión.
(() => {
  const ov = document.getElementById('splash');
  if (!ov) return;
  const cv = ov.querySelector('canvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const BG_COLOR = '#FFC83D'; // Amarillo del sistema y manifest

  let raf = 0;
  let fin_ = false;

  const fin = () => {
    if (fin_) return;
    fin_ = true;
    cancelAnimationFrame(raf);
    ov.classList.add('fuera');
    setTimeout(() => {
      try { ov.remove(); } catch (_) {}
    }, 450);
  };

  ov.addEventListener('pointerdown', fin);

  const img = new Image();
  img.onerror = fin;
  img.onload = () => {
    try {
      iniciarAnimacion();
    } catch (e) {
      console.error('Error al iniciar splash:', e);
      fin();
    }
  };
  img.src = 'img/logo-alv.png';

  function iniciarAnimacion() {
    const iw = img.naturalWidth || 900;
    const ih = img.naturalHeight || 821;

    // Canvas auxiliar para segmentación por color y geometría
    const off = document.createElement('canvas');
    off.width = iw;
    off.height = ih;
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.drawImage(img, 0, 0);

    const imgData = octx.getImageData(0, 0, iw, ih);
    const px = imgData.data;

    // Catálogo de piezas:
    // 0: Letra A (Teal)
    // 1: Letra L (Naranja con mano rockera)
    // 2: Letra V (Gris)
    // 3: T
    // 4: O
    // 5: U
    // 6: R
    // 7: S
    // 8: Rayo izquierdo
    // 9: Rayo derecho
    // 10: Lema "Atrévete | Libérate | Vive"
    // 11..16: Óvalo en 6 fragmentos angulares
    const NUM_OVAL_PIECES = 6;
    const PIECE_COUNT = 11 + NUM_OVAL_PIECES;

    const bboxes = Array.from({ length: PIECE_COUNT }, () => ({
      minX: iw, minY: ih, maxX: -1, maxY: -1, count: 0
    }));

    const pixelPieceMap = new Int16Array(iw * ih);
    pixelPieceMap.fill(-1);

    const ovalCx = 460;
    const ovalCy = 425;

    for (let y = 0; y < ih; y++) {
      const rowOffset = y * iw;
      for (let x = 0; x < iw; x++) {
        const idx = (rowOffset + x) * 4;
        const a = px[idx + 3];
        if (a < 35) continue;

        const r = px[idx];
        const g = px[idx + 1];
        const b = px[idx + 2];

        let pieceId = -1;

        // 1. Elementos negros / tipografía / rayos / lema
        if (r < 65 && g < 65 && b < 65) {
          if (y > 610) {
            pieceId = 10; // Lema
          } else if (x >= 320 && x <= 390 && y >= 370 && y <= 600) {
            pieceId = 8;  // Rayo izquierdo
          } else if (x >= 670 && y >= 250 && y <= 460) {
            pieceId = 9;  // Rayo derecho
          } else if (x >= 380 && x <= 535 && y >= 200 && y <= 610) {
            // Letras independientes T-O-U-R-S
            if (y < 275) pieceId = 3;       // T
            else if (y < 355) pieceId = 4;  // O
            else if (y < 440) pieceId = 5;  // U
            else if (y < 525) pieceId = 6;  // R
            else pieceId = 7;               // S
          } else if (y < 200 && x >= 390 && x <= 530) {
            // Trazos de la mano rockera (se mantienen con la L)
            pieceId = 1;
          } else {
            pieceId = x < 390 ? 0 : (x > 540 ? 2 : 1);
          }
        }
        // 2. Teal / Verde azulado -> Letra A
        else if (g > r + 12 && b > r + 12 && r < 120 && x < 420) {
          pieceId = 0;
        }
        // 3. Naranja / Coral -> Letra L + brazo
        else if (r > 155 && g < 135 && b < 115) {
          pieceId = 1;
        }
        // 4. Gris -> Letra V
        else if (r > 60 && r < 155 && Math.abs(r - g) < 30 && Math.abs(g - b) < 30 && x > 470) {
          pieceId = 2;
        }
        // 5. Beige / Crema -> Óvalo fragmentado en trozos
        else if (r > 150 && g > 140 && b > 120) {
          const dx = x - ovalCx;
          const dy = (y - ovalCy) * 1.25;
          let ang = Math.atan2(dy, dx) + Math.PI;
          let slice = Math.floor((ang / (Math.PI * 2)) * NUM_OVAL_PIECES);
          if (slice < 0) slice = 0;
          if (slice >= NUM_OVAL_PIECES) slice = NUM_OVAL_PIECES - 1;
          pieceId = 11 + slice;
        }
        // 6. Resto por proximidad
        else {
          if (x < 370) pieceId = 0;
          else if (x > 550) pieceId = 2;
          else pieceId = 1;
        }

        if (pieceId >= 0 && pieceId < PIECE_COUNT) {
          pixelPieceMap[rowOffset + x] = pieceId;
          const bb = bboxes[pieceId];
          if (x < bb.minX) bb.minX = x;
          if (x > bb.maxX) bb.maxX = x;
          if (y < bb.minY) bb.minY = y;
          if (y > bb.maxY) bb.maxY = y;
          bb.count++;
        }
      }
    }

    // Expandir el bounding box de L para cubrir el área de T-O-U-R-S y mantenerla sólida
    const bbL = bboxes[1];
    for (let id = 3; id <= 7; id++) {
      const bbt = bboxes[id];
      if (bbt.count > 0) {
        if (bbt.minX < bbL.minX) bbL.minX = bbt.minX;
        if (bbt.maxX > bbL.maxX) bbL.maxX = bbt.maxX;
        if (bbt.minY < bbL.minY) bbL.minY = bbt.minY;
        if (bbt.maxY > bbL.maxY) bbL.maxY = bbt.maxY;
      }
    }

    // Generar sprites independientes en alta resolución
    const pieces = [];
    const logoCx = iw / 2;
    const logoCy = ih / 2;

    for (let id = 0; id < PIECE_COUNT; id++) {
      const bb = bboxes[id];
      if (bb.count < 10 || bb.maxX < bb.minX || bb.maxY < bb.minY) continue;

      const pw = bb.maxX - bb.minX + 1;
      const ph = bb.maxY - bb.minY + 1;
      const pcv = document.createElement('canvas');
      pcv.width = pw;
      pcv.height = ph;
      const pctx = pcv.getContext('2d');
      const pimgData = pctx.createImageData(pw, ph);
      const pd = pimgData.data;

      for (let y = bb.minY; y <= bb.maxY; y++) {
        const srcRow = y * iw;
        const dstRow = (y - bb.minY) * pw;
        for (let x = bb.minX; x <= bb.maxX; x++) {
          const pId = pixelPieceMap[srcRow + x];
          const dIdx = (dstRow + (x - bb.minX)) * 4;

          if (pId === id) {
            const sIdx = (srcRow + x) * 4;
            pd[dIdx] = px[sIdx];
            pd[dIdx + 1] = px[sIdx + 1];
            pd[dIdx + 2] = px[sIdx + 2];
            pd[dIdx + 3] = px[sIdx + 3];
          } else if (id === 1 && pId >= 3 && pId <= 7) {
            // Para la L, rellenar el fondo bajo T-O-U-R-S con el color naranja sólido (#EB4D2C)
            // para que viaje como pieza completa e independiente
            pd[dIdx] = 235;
            pd[dIdx + 1] = 77;
            pd[dIdx + 2] = 44;
            pd[dIdx + 3] = 255;
          }
        }
      }
      pctx.putImageData(pimgData, 0, 0);

      const pcx = bb.minX + pw / 2 - logoCx;
      const pcy = bb.minY + ph / 2 - logoCy;

      // Profundidad base de ensamblaje (zBase):
      // Óvalo al fondo (+2), Letras base al medio (0), T-O-U-R-S al frente (-2)
      let zBase = 0;
      if (id >= 11) zBase = 2; // Óvalo
      else if (id >= 3 && id <= 7) zBase = -2; // T-O-U-R-S
      else if (id === 8 || id === 9 || id === 10) zBase = -1; // Rayos y lema

      // Parámetros orbitales para el remolino vertical:
      // Las piezas se distribuyen en una hélice vertical a lo largo de un cilindro / cono 3D
      const angleOffset = (id / PIECE_COUNT) * Math.PI * 2 * 1.6 + (id % 5) * 0.5;
      const vortexY = (id - (PIECE_COUNT - 1) / 2) * 60; // distribución vertical en Y
      const vortexRadius = 240 + (id % 4) * 45;
      const spinTurns = 2.8 + (id % 3) * 0.5;

      pieces.push({
        cv: pcv,
        w: pw,
        h: ph,
        targetX: pcx,
        targetY: pcy,
        zBase,
        angleOffset,
        vortexY,
        vortexRadius,
        spinTurns,
        id
      });
    }

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      renderLogoEstatico();
      setTimeout(fin, 800);
      return;
    }

    function renderLogoEstatico() {
      const vw = innerWidth, vh = innerHeight;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      cv.width = Math.round(vw * dpr);
      cv.height = Math.round(vh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, vw, vh);

      const k = Math.min((vw * 0.85) / iw, (vh * 0.6) / ih, 460 / iw);
      const lw = iw * k, lh = ih * k;
      ctx.drawImage(img, (vw - lw) / 2, (vh - lh) / 2, lw, lh);
    }

    // Tiempos de animación (ms)
    const T_SWIRL = 1750; // Remolino vertical 3D
    const T_SNAP = 650;   // Unión elástica milimétrica de todas las piezas
    const T_HOLD = 600;   // Logo unido completo con destello
    const T_EXIT = 500;   // Desvanecimiento suave hacia la app
    const T_TOTAL = T_SWIRL + T_SNAP + T_HOLD + T_EXIT;

    let t0 = 0;

    const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
    const easeOutBack = (x) => {
      const c1 = 1.45;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    };

    const frame = (now) => {
      if (fin_) return;
      if (!t0) t0 = now;
      const t = now - t0;
      if (t >= T_TOTAL) {
        fin();
        return;
      }

      const vw = innerWidth;
      const vh = innerHeight;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const cw = Math.round(vw * dpr);
      const ch = Math.round(vh * dpr);

      if (cv.width !== cw || cv.height !== ch) {
        cv.width = cw;
        cv.height = ch;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, vw, vh);

      const cx = vw / 2;
      const cy = vh / 2;
      const k = Math.min((vw * 0.84) / iw, (vh * 0.58) / ih, 460 / iw);

      const isSwirling = t < T_SWIRL;
      const isSnapping = !isSwirling && t < T_SWIRL + T_SNAP;
      const isHolding = !isSwirling && !isSnapping && t < T_SWIRL + T_SNAP + T_HOLD;
      const isExiting = t >= T_SWIRL + T_SNAP + T_HOLD;

      let exitProgress = 0;
      if (isExiting) {
        exitProgress = Math.min(1, (t - (T_SWIRL + T_SNAP + T_HOLD)) / T_EXIT);
      }

      // Cámara 3D con perspectiva cónica
      const focalLength = 520;
      const projected = [];

      pieces.forEach((p) => {
        let x3d, y3d, z3d, rotY = 0, rotZ = 0, alpha = 1, scaleExtra = 1;

        if (isSwirling) {
          const u = t / T_SWIRL;
          const curve = 1 - easeOutCubic(u);

          // Ángulo helicoidal: el remolino gira verticalmente alrededor del eje Y
          const theta = p.angleOffset + (1 - curve) * p.spinTurns * Math.PI * 2;
          const currentRadius = (p.vortexRadius * k) * (0.35 + 0.65 * curve);

          // Movimiento vertical en espiral
          const currentY = (p.vortexY * k * 2.0) * curve * Math.cos(u * Math.PI * 0.9);

          x3d = p.targetX * k * (1 - curve) + Math.sin(theta) * currentRadius;
          z3d = p.zBase * 5 + Math.cos(theta) * currentRadius;
          y3d = p.targetY * k * (1 - curve) + currentY;

          // Rotación 3D de guiñada (yaw) sincronizada con el remolino vertical
          rotY = theta * curve;
          rotZ = Math.sin(theta) * 0.35 * curve;
          alpha = Math.min(1, u * 3.8);
        } else if (isSnapping) {
          const u = (t - T_SWIRL) / T_SNAP;
          const e = easeOutBack(Math.min(1, u));

          const wave = Math.sin(u * Math.PI * 2) * (1 - u);
          x3d = p.targetX * k + wave * 9 * Math.cos(p.angleOffset);
          y3d = p.targetY * k + wave * 9 * Math.sin(p.angleOffset);
          z3d = p.zBase + (1 - e) * 35;
          rotY = wave * 0.15;
          rotZ = wave * 0.1;
          alpha = 1;
        } else {
          // Fase unida perfecta
          x3d = p.targetX * k;
          y3d = p.targetY * k;
          z3d = p.zBase;
          rotY = 0;
          rotZ = 0;
          alpha = isExiting ? (1 - exitProgress) : 1;
          if (isExiting) {
            scaleExtra = 1 + exitProgress * 0.06;
            y3d -= exitProgress * 12;
          }
        }

        // Proyección tridimensional
        const perspective = focalLength / (focalLength + z3d);
        const screenX = cx + x3d * perspective;
        const screenY = cy + y3d * perspective;
        const screenScale = k * perspective * scaleExtra;

        projected.push({
          cv: p.cv,
          w: p.w,
          h: p.h,
          screenX,
          screenY,
          screenScale,
          z3d,
          rotY,
          rotZ,
          alpha,
          zBase: p.zBase
        });
      });

      // Orden de dibujado 3D por profundidad: los más lejanos (+Z) primero, más cercanos (-Z) después
      projected.sort((a, b) => b.z3d - a.z3d);

      // Renderizado de las piezas en el Canvas
      projected.forEach((p) => {
        if (p.alpha <= 0.01) return;
        ctx.save();
        ctx.translate(p.screenX, p.screenY);

        // Efecto 3D de giro vertical sobre el eje Y:
        // Compresión horizontal coseno simula la rotación sobre el remolino vertical
        const cosYaw = Math.abs(Math.cos(p.rotY));
        const yawScale = Math.max(0.12, cosYaw);
        ctx.scale(p.screenScale * yawScale, p.screenScale);

        if (p.rotZ) ctx.rotate(p.rotZ);
        ctx.globalAlpha = p.alpha;

        // Sombreado 3D realista según profundidad en el vórtice
        if (p.z3d > 25 && isSwirling) {
          ctx.filter = 'brightness(0.85)';
        }

        ctx.drawImage(p.cv, -p.w / 2, -p.h / 2);
        ctx.restore();
      });

      // Destello sutil de unión al ensamblarse todas las piezas
      if (isSnapping) {
        const snapProgress = (t - T_SWIRL) / T_SNAP;
        if (snapProgress > 0.6) {
          const flash = Math.sin((snapProgress - 0.6) / 0.4 * Math.PI) * 0.28;
          if (flash > 0.01) {
            ctx.save();
            ctx.globalAlpha = flash;
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.ellipse(cx, cy, (iw * k) * 0.45, (ih * k) * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
  }
})();
