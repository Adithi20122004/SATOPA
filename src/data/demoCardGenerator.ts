import { CARD_WIDTH, CARD_HEIGHT, ARUCO_MARKERS, REFERENCE_PATCHES, RESULT_WINDOW_RECT } from '../vision/referenceCard';
import type { CapturedFrame } from '../types';

export type DemoCardType = 'positive_marquis' | 'negative_marquis' | 'glare_artifact' | 'blank_wall';

/**
 * Generates an authentic canvas-rendered captured frame simulating physical test cards or blank surfaces
 */
import { PRODUCT_NAME } from '../types';

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
      imgData.data[i] = Math.min(255, Math.max(0, imgData.data[i] + noise));
      imgData.data[i + 1] = Math.min(255, Math.max(0, imgData.data[i + 1] + noise));
      imgData.data[i + 2] = Math.min(255, Math.max(0, imgData.data[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    return {
      dataUrl,
      blob: new Blob([dataUrl], { type: 'image/jpeg' }),
      imageData: ctx.getImageData(0, 0, width, height),
      width,
      height,
      timestamp: Date.now(),
    };
  }

  // Desk/field background
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, width, height);

  // Position reference card in center
  const cardW = 440;
  const cardH = Math.round(cardW * (CARD_HEIGHT / CARD_WIDTH)); // ~623px
  const cardX = Math.round((width - cardW) / 2);
  const cardY = Math.round((height - cardH) / 2);

  // Draw white card body
  ctx.fillStyle = '#FFFFFF';
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
    ctx.fillStyle = '#000000';
    ctx.fillRect(mx, my, mw, mh);

    // Inner white grid area
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(mx + mw * 0.2, my + mh * 0.2, mw * 0.6, mh * 0.6);

    // Inner fiducial black blocks (unique per marker)
    ctx.fillStyle = '#000000';
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
    ctx.strokeStyle = '#CCCCCC';
    ctx.lineWidth = 1;
    ctx.strokeRect(px, py, pw, ph);

    // Nominal RGB fill
    const [r, g, b] = p.srgb;
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2);
  }

  // Draw reaction test window
  const rx = cardX + RESULT_WINDOW_RECT.x * scaleX;
  const ry = cardY + RESULT_WINDOW_RECT.y * scaleY;
  const rw = RESULT_WINDOW_RECT.w * scaleX;
  const rh = RESULT_WINDOW_RECT.h * scaleY;

  // Window border & container
  ctx.strokeStyle = '#D97706';
  ctx.lineWidth = 2;
  ctx.strokeRect(rx, ry, rw, rh);

  // Reaction color fill depending on demo type
  if (type === 'positive_marquis') {
    // Marquis positive for opioids/MDMA: deep rich violet-purple [42, 24, 58]
    ctx.fillStyle = '#2A183A';
    ctx.fillRect(rx + 2, ry + 2, rw - 4, rh - 4);
  } else if (type === 'negative_marquis') {
    // Marquis unreacted negative blank: pale straw-yellow [228, 220, 168]
    ctx.fillStyle = '#E4DCA8';
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
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(`${PRODUCT_NAME} COLORIMETRIC CALIBRATION CARD (A6)`, cardX + 35, cardY + cardH - 18);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  return {
    dataUrl,
    blob: new Blob([dataUrl], { type: 'image/jpeg' }),
    imageData: ctx.getImageData(0, 0, width, height),
    width,
    height,
    timestamp: Date.now(),
  };
}
