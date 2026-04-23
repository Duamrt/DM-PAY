// Gera icon-192.png e icon-512.png — DM Pay: fundo azul, "D" + "PAY"
const zlib = require('zlib');
const fs = require('fs');

function createPNG(size) {
  const pixels = Buffer.alloc(size * size * 4); // RGBA

  const cx = size / 2, cy = size / 2;
  const radius = size * 0.22; // raio do canto arredondado

  // Cor de fundo: azul #3B6FE8
  const bg = [59, 111, 232, 255];
  // Letra/texto: branco
  const fg = [255, 255, 255, 255];
  // Transparente
  const tp = [0, 0, 0, 0];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const off = (y * size + x) * 4;

      // Rounded rect
      const dx = Math.max(0, Math.abs(x - cx) - (size * 0.5 - radius - 1));
      const dy = Math.max(0, Math.abs(y - cy) - (size * 0.5 - radius - 1));
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > radius) {
        // fora do rounded rect → transparente
        pixels[off] = 0; pixels[off+1] = 0; pixels[off+2] = 0; pixels[off+3] = 0;
        continue;
      }

      // Dentro → fundo azul por padrão
      pixels[off] = bg[0]; pixels[off+1] = bg[1]; pixels[off+2] = bg[2]; pixels[off+3] = 255;

      // Coordenadas normalizadas [-1, 1]
      const nx = (x - cx) / (size * 0.5);
      const ny = (y - cy) / (size * 0.5);

      // === Letra D ===
      // Posicionada no terço superior-central
      const lx = nx;          // centro horizontal
      const ly = ny + 0.08;   // ligeiramente acima do centro

      // Haste vertical (esquerda do D)
      const stem = lx >= -0.18 && lx <= -0.06 && ly >= -0.35 && ly <= 0.25;

      // Curva do D (semicírculo à direita da haste)
      const arcCX = -0.06;
      const arcCY = -0.05;
      const outerR = 0.26;
      const innerR = 0.14;
      const arcDist = Math.sqrt((lx - arcCX) ** 2 + ((ly - arcCY) * 1.1) ** 2);
      const inArc = lx >= arcCX && arcDist <= outerR && arcDist >= innerR && ly >= -0.35 && ly <= 0.25;

      // Topo e base do D (fecham a letra)
      const topBar = lx >= -0.18 && lx <= -0.06 + outerR * 0.8 && ly >= -0.35 && ly <= -0.25;
      const botBar = lx >= -0.18 && lx <= -0.06 + outerR * 0.8 && ly >= 0.17 && ly <= 0.25;

      if (stem || inArc || topBar || botBar) {
        pixels[off] = fg[0]; pixels[off+1] = fg[1]; pixels[off+2] = fg[2]; pixels[off+3] = 255;
        continue;
      }

      // === Texto "PAY" ===
      // Letras P, A, Y desenhadas em pixel art na faixa inferior
      const px = nx;
      const py = ny;
      const txtY1 = 0.42, txtY2 = 0.62; // faixa vertical do texto

      if (py >= txtY1 && py <= txtY2) {
        const t = (px + 0.38) / 0.76; // 0..1 mapeando de -0.38 a +0.38
        const row = (py - txtY1) / (txtY2 - txtY1); // 0..1 dentro da linha

        // P (t: 0..0.28)
        if (t >= 0 && t < 0.28) {
          const lc = (t) / 0.28; // 0..1 dentro do P
          const stem_p = lc <= 0.25;
          const top_p = row <= 0.2 && lc <= 0.85;
          const mid_p = row >= 0.4 && row <= 0.6 && lc <= 0.85;
          const arc_p = lc > 0.25 && lc <= 0.85 && (row <= 0.2 || row >= 0.4) && row <= 0.6;
          const right_p = lc >= 0.75 && lc <= 0.85 && row >= 0.0 && row <= 0.6;
          if (stem_p || top_p || mid_p || right_p) {
            pixels[off] = fg[0]; pixels[off+1] = fg[1]; pixels[off+2] = fg[2]; pixels[off+3] = 255;
            continue;
          }
        }

        // A (t: 0.36..0.64)
        if (t >= 0.36 && t < 0.64) {
          const lc = (t - 0.36) / 0.28;
          const left_a  = lc <= 0.2 && row >= (1 - lc * 2.5);
          const right_a = lc >= 0.8 && row >= ((lc - 0.8) * 2.5 * 0.8);
          const top_a   = row <= 0.2 && lc >= 0.3 && lc <= 0.7;
          const mid_a   = row >= 0.45 && row <= 0.65;
          if (left_a || right_a || top_a || mid_a) {
            pixels[off] = fg[0]; pixels[off+1] = fg[1]; pixels[off+2] = fg[2]; pixels[off+3] = 255;
            continue;
          }
        }

        // Y (t: 0.72..1.0)
        if (t >= 0.72 && t <= 1.0) {
          const lc = (t - 0.72) / 0.28;
          const stem_y  = lc >= 0.35 && lc <= 0.65 && row >= 0.5;
          const left_y  = lc <= 0.35 && row <= 0.5 && row <= lc * 1.5;
          const right_y = lc >= 0.65 && row <= 0.5 && row <= (1 - lc) * 1.5;
          const mid_y   = row >= 0.44 && row <= 0.56 && lc >= 0.2 && lc <= 0.8;
          if (stem_y || left_y || right_y || mid_y) {
            pixels[off] = fg[0]; pixels[off+1] = fg[1]; pixels[off+2] = fg[2]; pixels[off+3] = 255;
            continue;
          }
        }
      }
    }
  }

  // Converte RGBA → RGB com filtro none
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * (size * 3 + 1) + 1 + x * 3;
      // Alpha premultiply sobre branco
      const a = pixels[src + 3] / 255;
      raw[dst]   = Math.round(pixels[src]   * a + 255 * (1 - a));
      raw[dst+1] = Math.round(pixels[src+1] * a + 255 * (1 - a));
      raw[dst+2] = Math.round(pixels[src+2] * a + 255 * (1 - a));
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (const b of buf) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0); }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, c]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;

  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

fs.writeFileSync('icon-192.png', createPNG(192));
fs.writeFileSync('icon-512.png', createPNG(512));
console.log('✓ icon-192.png e icon-512.png gerados (azul + D + PAY)');
