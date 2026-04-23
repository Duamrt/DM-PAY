// Gera icon-192.png e icon-512.png para o PWA
const zlib = require('zlib');
const fs = require('fs');

function createPNG(size) {
  // Cor: #7C3AED (roxo DM Pay)
  const r = 0x7C, g = 0x3A, b = 0xED;

  // Texto "D" no centro — simplificado, só cor sólida por ora
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter type none
    for (let x = 0; x < size; x++) {
      const off = y * (size * 3 + 1) + 1 + x * 3;
      // Bordas arredondadas (aproximado)
      const cx = x - size/2, cy = y - size/2;
      const radius = size * 0.18;
      const corner = size/2 - radius;
      const inCorner = Math.abs(cx) > corner && Math.abs(cy) > corner;
      const dist = Math.sqrt((Math.abs(cx)-corner)**2 + (Math.abs(cy)-corner)**2);
      if (inCorner && dist > radius) {
        raw[off] = 255; raw[off+1] = 255; raw[off+2] = 255; // transparente→branco
      } else {
        // Letra D simples no centro
        const nx = cx/size, ny = cy/size;
        const inD = nx > -0.15 && nx < 0.15 && ny > -0.28 && ny < 0.28 &&
                    !(nx > 0.02 && Math.sqrt(nx*nx*4 + ny*ny) < 0.22);
        const stem = nx > -0.15 && nx < -0.05 && ny > -0.28 && ny < 0.28;
        if (inD || stem) {
          raw[off] = 255; raw[off+1] = 255; raw[off+2] = 255;
        } else {
          raw[off] = r; raw[off+1] = g; raw[off+2] = b;
        }
      }
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type);
    const crcBuf = Buffer.concat([t, data]);
    let crc = 0xFFFFFFFF;
    for (const b of crcBuf) {
      crc ^= b;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
    const crcOut = Buffer.alloc(4);
    crcOut.writeUInt32BE((crc ^ 0xFFFFFFFF) >>> 0);
    return Buffer.concat([len, t, data, crcOut]);
  }

  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

fs.writeFileSync('icon-192.png', createPNG(192));
fs.writeFileSync('icon-512.png', createPNG(512));
console.log('✓ icon-192.png e icon-512.png gerados');
