// Generador mínimo de códigos QR (modo bytes, corrección M, versiones 1-5: hasta 84 caracteres). Sin librerías externas.
// qrMatriz('texto') -> matriz de booleanos (true = módulo oscuro).
const VER = {   // versión: [codewords de datos, codewords EC por bloque, bloques, centro de alineación]
  1: [16, 10, 1, null], 2: [28, 16, 1, 18], 3: [44, 26, 1, 22], 4: [64, 18, 2, 26], 5: [86, 24, 2, 30] };
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11D; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const mul = (a, b) => a && b ? EXP[LOG[a] + LOG[b]] : 0;
function rs(datos, n){                       // resto de la división polinómica (Reed-Solomon)
  let g = [1];
  for (let i = 0; i < n; i++) { const s = new Array(g.length + 1).fill(0); g.forEach((c, j) => { s[j] ^= c; s[j + 1] ^= mul(c, EXP[i]); }); g = s; }
  const r = new Array(n).fill(0);
  for (const d of datos) { const f = d ^ r.shift(); r.push(0); if (f) g.slice(1).forEach((c, j) => { r[j] ^= mul(c, f); }); }
  return r;
}
export function qrMatriz(texto){
  const bytes = [...new TextEncoder().encode(String(texto))];
  let v = 1; while (v <= 5 && bytes.length > VER[v][0] - 2) v++;
  if (v > 5) throw new Error('Texto demasiado largo para el QR');
  const [nd, nec, nb, alin] = VER[v], size = 17 + 4 * v;
  // 1) bits de datos
  const bits = []; const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, 8); bytes.forEach(b => put(b, 8));
  put(0, Math.min(4, nd * 8 - bits.length)); while (bits.length % 8) bits.push(0);
  const cw = []; for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let p = 0xEC; cw.length < nd; p ^= 0xEC ^ 0x11) cw.push(p);
  // 2) bloques + EC + intercalado
  const per = nd / nb, bl = [], ec = [];
  for (let i = 0; i < nb; i++) { const d = cw.slice(i * per, (i + 1) * per); bl.push(d); ec.push(rs(d, nec)); }
  const fin = []; for (let i = 0; i < per; i++) bl.forEach(b => fin.push(b[i])); for (let i = 0; i < nec; i++) ec.forEach(e => fin.push(e[i]));
  // 3) matriz
  const m = Array.from({ length: size }, () => new Array(size).fill(false)), fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, d) => { m[y][x] = d; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= size || y >= size) continue;
    const d = Math.max(Math.abs(dx), Math.abs(dy)); set(x, y, d !== 2 && d !== 4); } };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  if (alin) for (const [cx, cy] of [[alin, alin]]) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  const formato = mask => { let d = (0 << 3) | mask, r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); const b = ((d << 10) | r) ^ 0x5412, g = i => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, g(i)); set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8)); for (let i = 9; i < 15; i++) set(14 - i, 8, g(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i)); for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i)); set(8, size - 8, true); };
  formato(0);                                // reserva las zonas de formato
  const base = m.map(f => f.slice());
  let k = 0;                                  // zigzag de datos
  for (let x = size - 1; x >= 1; x -= 2) { if (x === 6) x = 5;
    for (let j = 0; j < size; j++) for (let c = 0; c < 2; c++) { const xx = x - c, up = ((x + 1) & 2) === 0, yy = up ? size - 1 - j : j;
      if (!fn[yy][xx] && k < fin.length * 8) { base[yy][xx] = ((fin[k >>> 3] >>> (7 - (k & 7))) & 1) === 1; k++; } } }
  const MASK = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0, (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
  const penal = g => { let p = 0;
    for (const f of [g, g[0].map((_, x) => g.map(r => r[x]))]) for (const row of f) { let run = 1;
      for (let i = 1; i <= size; i++) { if (i < size && row[i] === row[i - 1]) run++; else { if (run >= 5) p += run - 2; run = 1; } } }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (g[y][x] === g[y][x + 1] && g[y][x] === g[y + 1][x] && g[y][x] === g[y + 1][x + 1]) p += 3;
    const oscuros = g.flat().filter(Boolean).length; p += Math.floor(Math.abs(oscuros * 20 - size * size * 10) / (size * size)) * 10; return p; };
  let mejor = null, mp = Infinity, mm = 0;
  for (let mk = 0; mk < 8; mk++) { const g = base.map((r, y) => r.map((d, x) => fn[y][x] ? d : d !== MASK[mk](x, y)));
    const p = penal(g); if (p < mp) { mp = p; mejor = g; mm = mk; } }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) m[y][x] = mejor[y][x];
  formato(mm);
  return m;
}
