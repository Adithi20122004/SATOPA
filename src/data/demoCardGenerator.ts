import { CARD_WIDTH, CARD_HEIGHT, ARUCO_MARKERS, REFERENCE_PATCHES, RESULT_WINDOW_RECT } from '../vision/referenceCard';
import type { CapturedFrame } from '../types';
import { PRODUCT_NAME } from '../types';

export type DemoCardType =
  | 'clean_negative'
  | 'clean_positive'
  | 'tungsten'
  | 'low_light'
  | 'positive_marquis'
  | 'negative_marquis'
  | 'glare_artifact'
  | 'blank_wall';

/**
 * Converts a data URL to a binary Blob with correct MIME type
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const binaryStr = atob(parts[1]);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * Generates an authentic canvas-rendered captured frame simulating physical test cards or blank surfaces
 */
export function generateDemoCapturedFrame(type: DemoCardType): CapturedFrame {
  const canvas = document.createElement('canvas');
  // Match standard camera frame 1280x720
  const width = 1280;
  const height = 720;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  if (type === 'blank_wall') {
    // Blank wall: uniform beige/cream background with minimal natural noise
    ctx.fillStyle = '#E8E2D5';
    ctx.fillRect(0, 0, width, height);

    // Subtle grain
    const imgData = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 6;
      imgData.data[i] = clampByte(imgData.data[i] + noise);
      imgData.data[i + 1] = clampByte(imgData.data[i + 1] + noise);
      imgData.data[i + 2] = clampByte(imgData.data[i + 2] + noise);
    }
    ctx.putImageData(imgData, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    return {
      dataUrl,
      blob: dataUrlToBlob(dataUrl),
      imageData: ctx.getImageData(0, 0, width, height),
      width,
      height,
      timestamp: Date.now(),
    };
  }

  const isTungsten = type === 'tungsten';
  const isLowLight = type === 'low_light';

  // Desk/field background
  ctx.fillStyle = isLowLight ? '#0B0F19' : isTungsten ? '#2B2418' : '#1e293b';
  ctx.fillRect(0, 0, width, height);

  // Position reference card in center
  const cardW = 440;
  const cardH = Math.round(cardW * (CARD_HEIGHT / CARD_WIDTH)); // ~623px
  const cardX = Math.round((width - cardW) / 2);
  const cardY = Math.round((height - cardH) / 2);

  // Draw card body
  ctx.fillStyle = isLowLight ? '#8B95A5' : isTungsten ? '#FFF8E6' : '#FFFFFF';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 15;
  ctx.shadowOffsetY = 6;
  ctx.fillRect(cardX, cardY, cardW, cardH);
  ctx.shadowColor = 'transparent';

  // Scale factor from canonical (600 x 850)
  const scaleX = cardW / CARD_WIDTH;
  const scaleY = cardH / CARD_HEIGHT;

  // Draw 4 corner ArUco markers (#0, #1, #2, #3)
  for (const m of ARUCO_MARKERS) {
    const mx = cardX + m.rect.x * scaleX;
    const my = cardY + m.rect.y * scaleY;
    const mw = m.rect.w * scaleX;
    const mh = m.rect.h * scaleY;

    // Outer black frame
    ctx.fillStyle = isLowLight ? '#1A1D24' : '#000000';
    ctx.fillRect(mx, my, mw, mh);

    // Inner white grid area
    ctx.fillStyle = isLowLight ? '#8B95A5' : isTungsten ? '#FFF8E6' : '#FFFFFF';
    ctx.fillRect(mx + mw * 0.2, my + mh * 0.2, mw * 0.6, mh * 0.6);

    // Inner fiducial black blocks (unique per marker)
    ctx.fillStyle = isLowLight ? '#1A1D24' : '#000000';
    if (m.id === 0) {
      ctx.fillRect(mx + mw * 0.35, my + mh * 0.35, mw * 0.3, mh * 0.3);
    } else if (m.id === 1) {
      ctx.fillRect(mx + mw * 0.25, my + mh * 0.25, mw * 0.25, mh * 0.5);
    } else if (m.id === 2) {
      ctx.fillRect(mx + mw * 0.3, my + mh * 0.3, mw * 0.4, mh * 0.25);
    } else {
      ctx.fillRect(mx + mw * 0.25, my + mh * 0.4, mw * 0.5, mh * 0.3);
    }
  }

  // Draw 9 reference color patches
  for (const p of REFERENCE_PATCHES) {
    const px = cardX + p.rect.x * scaleX;
    const py = cardY + p.rect.y * scaleY;
    const pw = p.rect.w * scaleX;
    const ph = p.rect.h * scaleY;

    // Patch border
    ctx.strokeStyle = isLowLight ? '#555E6D' : '#CCCCCC';
    ctx.lineWidth = 1;
    ctx.strokeRect(px, py, pw, ph);

    // Nominal RGB fill with lighting adjust
    let [r, g, b] = p.srgb;
    if (isTungsten) {
      r = clampByte(r * 1.24);
      g = clampByte(g * 1.02);
      b = clampByte(b * 0.72);
    } else if (isLowLight) {
      r = clampByte(r * 0.55);
      g = clampByte(g * 0.53);
      b = clampByte(b * 0.52);
    }
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2);
  }

  // Draw reaction test window
  const rx = cardX + RESULT_WINDOW_RECT.x * scaleX;
  const ry = cardY + RESULT_WINDOW_RECT.y * scaleY;
  const rw = RESULT_WINDOW_RECT.w * scaleX;
  const rh = RESULT_WINDOW_RECT.h * scaleY;

  // Window border & container
  ctx.strokeStyle = isLowLight ? '#7C4A03' : '#D97706';
  ctx.lineWidth = 2;
  ctx.strokeRect(rx, ry, rw, rh);

  // Reaction color fill depending on demo type
  const isPositive =
    type === 'positive_marquis' || type === 'clean_positive' || type === 'tungsten';
  const isNegative = type === 'negative_marquis' || type === 'clean_negative';

  if (isPositive) {
    // Marquis positive for opioids/MDMA: deep rich violet-purple [42, 24, 58]
    let pr = 42;
    let pg = 24;
    let pb = 58;
    if (isTungsten) {
      pr = clampByte(pr * 1.24);
      pg = clampByte(pg * 1.02);
      pb = clampByte(pb * 0.72);
    }
    ctx.fillStyle = `rgb(${pr}, ${pg}, ${pb})`;
    ctx.fillRect(rx + 2, ry + 2, rw - 4, rh - 4);
  } else if (isNegative) {
    // Marquis unreacted negative blank: pale straw-yellow [228, 220, 168]
    ctx.fillStyle = '#E4DCA8';
    ctx.fillRect(rx + 2, ry + 2, rw - 4, rh - 4);
  } else if (isLowLight) {
    // Low light positive reaction with dimmer value
    const pr = clampByte(42 * 0.55);
    const pg = clampByte(24 * 0.53);
    const pb = clampByte(58 * 0.52);
    ctx.fillStyle = `rgb(${pr}, ${pg}, ${pb})`;
    ctx.fillRect(rx + 2, ry + 2, rw - 4, rh - 4);
  } else if (type === 'glare_artifact') {
    // Reaction with strong specular reflection hotspot
    ctx.fillStyle = '#2A183A';
    ctx.fillRect(rx + 2, ry + 2, rw - 4, rh - 4);

    // Blown-out specular glare hotspot (> 250 in RGB)
    const gradient = ctx.createRadialGradient(
      rx + rw * 0.5,
      ry + rh * 0.45,
      2,
      rx + rw * 0.5,
      ry + rh * 0.45,
      rw * 0.35
    );
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(rx + 2, ry + 2, rw - 4, rh - 4);
  }

  // Card text labels
  ctx.fillStyle = isLowLight ? '#334155' : '#475569';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(`${PRODUCT_NAME} COLORIMETRIC CALIBRATION CARD (A6)`, cardX + 35, cardY + cardH - 18);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  return {
    dataUrl,
    blob: dataUrlToBlob(dataUrl),
    imageData: ctx.getImageData(0, 0, width, height),
    width,
    height,
    timestamp: Date.now(),
  };
}
