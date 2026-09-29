/**
 * Standalone QR Code Generator (Pure TypeScript)
 * Supports QR Code generation (Versions 1-10, Error Correction Level L)
 * Zero external dependencies - renders sharp SVG data URL and Canvas.
 */

// GF(256) Tables
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
let val = 1;
for (let i = 0; i < 255; i++) {
  EXP[i] = val;
  LOG[val] = i;
  val = (val << 1) ^ (val >= 128 ? 0x11d : 0);
}
for (let i = 255; i < 512; i++) {
  EXP[i] = EXP[i - 255];
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function getGeneratorPoly(degree: number): Uint8Array {
  let g = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const factor = EXP[i];
    const next = new Uint8Array(g.length + 1);
    next[0] = g[0];
    for (let j = 1; j < g.length; j++) {
      next[j] = g[j] ^ gfMul(g[j - 1], factor);
    }
    next[g.length] = gfMul(g[g.length - 1], factor);
    g = next;
  }
  return g;
}

function computeRemainder(data: Uint8Array, numEcBytes: number): Uint8Array {
  const gen = getGeneratorPoly(numEcBytes);
  const remainder = new Uint8Array(numEcBytes);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[numEcBytes - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < numEcBytes; j++) {
        remainder[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return remainder;
}

// Version configs for Level L
// [dataBytes, ecBytes, [blocks1, dataPerBlock1], [blocks2, dataPerBlock2]]
interface VersionConfig {
  version: number;
  size: number;
  totalDataBytes: number;
  ecPerBlock: number;
  group1: [number, number]; // [numBlocks, dataBytesPerBlock]
  group2?: [number, number];
  alignments: number[];
}

const VERSION_CONFIGS: VersionConfig[] = [
  { version: 1, size: 21, totalDataBytes: 19, ecPerBlock: 7, group1: [1, 19], alignments: [] },
  { version: 2, size: 25, totalDataBytes: 34, ecPerBlock: 10, group1: [1, 34], alignments: [6, 18] },
  { version: 3, size: 29, totalDataBytes: 55, ecPerBlock: 15, group1: [1, 55], alignments: [6, 22] },
  { version: 4, size: 33, totalDataBytes: 80, ecPerBlock: 20, group1: [1, 80], alignments: [6, 26] },
  { version: 5, size: 37, totalDataBytes: 108, ecPerBlock: 26, group1: [1, 108], alignments: [6, 30] },
  { version: 6, size: 41, totalDataBytes: 136, ecPerBlock: 18, group1: [2, 68], alignments: [6, 34] },
  { version: 7, size: 45, totalDataBytes: 156, ecPerBlock: 20, group1: [2, 78], alignments: [6, 22, 38] },
  { version: 8, size: 49, totalDataBytes: 194, ecPerBlock: 24, group1: [2, 97], alignments: [6, 24, 42] },
  { version: 9, size: 53, totalDataBytes: 232, ecPerBlock: 30, group1: [2, 116], alignments: [6, 26, 46] },
  { version: 10, size: 57, totalDataBytes: 274, ecPerBlock: 18, group1: [2, 68], group2: [2, 69], alignments: [6, 28, 50] },
];

function selectVersion(dataLen: number): VersionConfig {
  for (const cfg of VERSION_CONFIGS) {
    // Byte mode overhead: 4 bits mode + 8 or 16 bits count
    const countBits = cfg.version < 10 ? 8 : 16;
    const maxDataBytes = cfg.totalDataBytes - Math.ceil((4 + countBits) / 8);
    if (dataLen <= maxDataBytes) {
      return cfg;
    }
  }
  // Fallback to version 10
  return VERSION_CONFIGS[VERSION_CONFIGS.length - 1];
}

class BitBuffer {
  private buffer: number[] = [];
  private length = 0;

  put(num: number, length: number) {
    for (let i = 0; i < length; i++) {
      this.putBit(((num >>> (length - i - 1)) & 1) === 1);
    }
  }

  putBit(bit: boolean) {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) {
      this.buffer.push(0);
    }
    if (bit) {
      this.buffer[bufIndex] |= 0x80 >>> (this.length % 8);
    }
    this.length++;
  }

  getBuffer(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  getLength(): number {
    return this.length;
  }
}

function encodeData(text: string, cfg: VersionConfig): Uint8Array {
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(text);
  const bb = new BitBuffer();

  // Mode: 0100 (Byte mode)
  bb.put(0x4, 4);

  // Character count
  const countBits = cfg.version < 10 ? 8 : 16;
  bb.put(rawBytes.length, countBits);

  // Data bytes
  for (let i = 0; i < rawBytes.length; i++) {
    bb.put(rawBytes[i], 8);
  }

  // Terminator (up to 4 zeroes)
  const totalDataBits = cfg.totalDataBytes * 8;
  const remainingBits = totalDataBits - bb.getLength();
  const termBits = Math.min(4, Math.max(0, remainingBits));
  bb.put(0, termBits);

  // Pad to byte boundary
  while (bb.getLength() % 8 !== 0) {
    bb.putBit(false);
  }

  // Pad bytes 0xEC, 0x11
  let padToggle = 0xec;
  while (bb.getLength() < totalDataBits) {
    bb.put(padToggle, 8);
    padToggle = padToggle === 0xec ? 0x11 : 0xec;
  }

  const dataBytes = bb.getBuffer();

  // Interleave and generate error correction blocks
  const blocks: { data: Uint8Array; ec: Uint8Array }[] = [];
  let offset = 0;

  const [b1Count, b1Len] = cfg.group1;
  for (let i = 0; i < b1Count; i++) {
    const blockData = dataBytes.slice(offset, offset + b1Len);
    offset += b1Len;
    const blockEc = computeRemainder(blockData, cfg.ecPerBlock);
    blocks.push({ data: blockData, ec: blockEc });
  }

  if (cfg.group2) {
    const [b2Count, b2Len] = cfg.group2;
    for (let i = 0; i < b2Count; i++) {
      const blockData = dataBytes.slice(offset, offset + b2Len);
      offset += b2Len;
      const blockEc = computeRemainder(blockData, cfg.ecPerBlock);
      blocks.push({ data: blockData, ec: blockEc });
    }
  }

  // Interleave data codewords
  const result: number[] = [];
  const maxDataLen = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (const b of blocks) {
      if (i < b.data.length) {
        result.push(b.data[i]);
      }
    }
  }

  // Interleave EC codewords
  for (let i = 0; i < cfg.ecPerBlock; i++) {
    for (const b of blocks) {
      if (i < b.ec.length) {
        result.push(b.ec[i]);
      }
    }
  }

  return new Uint8Array(result);
}

function createMatrix(cfg: VersionConfig, codewords: Uint8Array): boolean[][] {
  const n = cfg.size;
  const matrix: (boolean | null)[][] = Array.from({ length: n }, () => Array(n).fill(null));
  const isFunction: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));

  const setFunc = (r: number, c: number, v: boolean) => {
    if (r >= 0 && r < n && c >= 0 && c < n) {
      matrix[r][c] = v;
      isFunction[r][c] = true;
    }
  };

  // 1. Finder patterns
  const addFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          const isEdge = r === 0 || r === 6 || c === 0 || c === 6;
          const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          setFunc(nr, nc, isEdge || isCenter);
        } else {
          // Separator
          setFunc(nr, nc, false);
        }
      }
    }
  };

  addFinder(0, 0);
  addFinder(0, n - 7);
  addFinder(n - 7, 0);

  // 2. Alignment patterns
  if (cfg.alignments.length > 0) {
    for (const r of cfg.alignments) {
      for (const c of cfg.alignments) {
        // Skip finders
        if (
          (r === 6 && c === 6) ||
          (r === 6 && c === cfg.alignments[cfg.alignments.length - 1] && c === n - 7) ||
          (r === cfg.alignments[cfg.alignments.length - 1] && c === 6 && r === n - 7)
        ) {
          continue;
        }
        if (isFunction[r][c]) continue;

        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isEdge = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const isCenter = dr === 0 && dc === 0;
            setFunc(r + dr, c + dc, isEdge || isCenter);
          }
        }
      }
    }
  }

  // 3. Timing patterns
  for (let i = 8; i < n - 8; i++) {
    if (!isFunction[6][i]) setFunc(6, i, i % 2 === 0);
    if (!isFunction[i][6]) setFunc(i, 6, i % 2 === 0);
  }

  // 4. Dark module
  setFunc(4 * cfg.version + 9, 8, true);

  // 5. Reserve format info
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      setFunc(8, i, false);
      setFunc(i, 8, false);
    }
  }
  for (let i = 0; i < 8; i++) {
    setFunc(8, n - 1 - i, false);
    setFunc(n - 1 - i, 8, false);
  }

  // 6. Place data with mask 0: (row + col) % 2 === 0
  let bitIndex = 0;
  const totalBits = codewords.length * 8;

  let row = n - 1;
  let dir = -1; // -1 for upwards, +1 for downwards

  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--; // Skip timing column

    while (row >= 0 && row < n) {
      for (let c = 0; c < 2; c++) {
        const curCol = col - c;
        if (!isFunction[row][curCol]) {
          let bit = false;
          if (bitIndex < totalBits) {
            const byte = codewords[Math.floor(bitIndex / 8)];
            bit = ((byte >>> (7 - (bitIndex % 8))) & 1) === 1;
            bitIndex++;
          }
          // Mask 0
          const mask = (row + curCol) % 2 === 0;
          matrix[row][curCol] = bit !== mask;
        }
      }
      row += dir;
    }
    dir = -dir;
    row += dir;
  }

  // 7. Format Information (Level L, Mask 0): 0x77c4 (15 bits)
  // Format bit pattern: 1 1 1 0 1 1 1 1 1 0 0 0 1 0 0
  const formatBits = 0x77c4;
  for (let i = 0; i < 15; i++) {
    const bit = ((formatBits >>> (14 - i)) & 1) === 1;
    // Top-left
    if (i <= 5) {
      matrix[8][i] = bit;
    } else if (i === 6) {
      matrix[8][7] = bit;
    } else if (i === 7) {
      matrix[8][8] = bit;
    } else if (i === 8) {
      matrix[7][8] = bit;
    } else {
      matrix[14 - i][8] = bit;
    }

    // Split across top-right and bottom-left
    if (i < 8) {
      matrix[n - 1 - i][8] = bit;
    } else {
      matrix[8][n - 15 + i] = bit;
    }
  }

  return matrix.map((r) => r.map((cell) => cell ?? false));
}

export interface QRCodeOptions {
  width?: number;
  margin?: number;
  color?: {
    dark?: string;
    light?: string;
  };
}

export const QRCode = {
  /**
   * Generates a Data URL (SVG/Canvas) containing the QR code.
   */
  toDataURL: async (text: string, options?: QRCodeOptions): Promise<string> => {
    const width = options?.width || 140;
    const margin = options?.margin ?? 2;
    const darkColor = options?.color?.dark || '#0f172a';
    const lightColor = options?.color?.light || '#ffffff';

    const cfg = selectVersion(text.length);
    const codewords = encodeData(text, cfg);
    const matrix = createMatrix(cfg, codewords);

    const n = matrix.length;
    const total = n + margin * 2;

    // Build SVG path
    let path = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (matrix[r][c]) {
          path += `M${c + margin},${r + margin}h1v1h-1z `;
        }
      }
    }

    // Try HTML canvas if available in browser
    if (typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = width;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = lightColor;
          ctx.fillRect(0, 0, width, width);
          ctx.fillStyle = darkColor;

          const cellSize = width / total;
          for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
              if (matrix[r][c]) {
                ctx.fillRect((c + margin) * cellSize, (r + margin) * cellSize, cellSize + 0.1, cellSize + 0.1);
              }
            }
          }
          return canvas.toDataURL('image/png');
        }
      } catch {
        // Fall back to SVG data URL
      }
    }

    // Vector SVG Data URL
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${width}" height="${width}"><rect width="${total}" height="${total}" fill="${lightColor}"/><path d="${path}" fill="${darkColor}"/></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  },

  /**
   * Draws QR code directly to an HTML canvas
   */
  toCanvas: async (canvas: HTMLCanvasElement, text: string, options?: QRCodeOptions): Promise<void> => {
    const margin = options?.margin ?? 2;
    const darkColor = options?.color?.dark || '#0f172a';
    const lightColor = options?.color?.light || '#ffffff';

    const cfg = selectVersion(text.length);
    const codewords = encodeData(text, cfg);
    const matrix = createMatrix(cfg, codewords);

    const n = matrix.length;
    const total = n + margin * 2;
    const cellSize = canvas.width / total;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = lightColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = darkColor;

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (matrix[r][c]) {
          ctx.fillRect((c + margin) * cellSize, (r + margin) * cellSize, cellSize + 0.1, cellSize + 0.1);
        }
      }
    }
  },
};

export default QRCode;
