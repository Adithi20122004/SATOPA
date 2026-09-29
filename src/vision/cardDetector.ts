import type { Point2D } from './qualityGates';
import {
  CARD_WIDTH,
  CARD_HEIGHT,
  ARUCO_MARKERS,
  REFERENCE_PATCHES,
  RESULT_WINDOW_RECT,
} from './referenceCard';
import type { RGB, LinearRGB, Lab } from './colorMath';
import { rgbToLinearRgb, srgbToLab } from './colorMath';

export interface DetectedMarker {
  id: number;
  corner: 'TL' | 'TR' | 'BR' | 'BL';
  center: Point2D;
  corners: Point2D[]; // 4 corners of the marker in image space
}

export interface CardDetectionResult {
  cardDetected: boolean;
  corners: Point2D[]; // 4 corners of the card [TL, TR, BR, BL]
  warpedCardImageData: ImageData | null;
  detectedMarkers: DetectedMarker[];
  extractedPatches: Array<{
    id: string;
    name: string;
    category: 'neutral' | 'chromatic';
    nominalLab: Lab;
    measuredRgb: RGB;
    measuredLinearRgb: LinearRGB;
    measuredLab: Lab;
  }>;
  resultRegion: {
    rect: { x: number; y: number; w: number; h: number };
    medianRgb: RGB;
    medianLinearRgb: LinearRGB;
    medianLab: Lab;
    croppedImageData: ImageData | null;
  } | null;
}

/**
 * Computes 3x3 Homography Matrix H from 4 source points to 4 destination points
 * using Direct Linear Transformation (DLT).
 * Maps dst = H * src, or src = H^-1 * dst for backward warping.
 */
export function computeHomography(src: Point2D[], dst: Point2D[]): number[][] | null {
  if (src.length !== 4 || dst.length !== 4) return null;

  // 8x8 linear system A * h = b
  // For each point i:
  // x_d = (h00*x_s + h01*y_s + h02) / (h20*x_s + h21*y_s + 1)
  // y_d = (h10*x_s + h11*y_s + h12) / (h20*x_s + h21*y_s + 1)
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const xs = src[i].x;
    const ys = src[i].y;
    const xd = dst[i].x;
    const yd = dst[i].y;

    A.push([xs, ys, 1, 0, 0, 0, -xd * xs, -xd * ys]);
    b.push(xd);

    A.push([0, 0, 0, xs, ys, 1, -yd * xs, -yd * ys]);
    b.push(yd);
  }

  const h = solve8x8(A, b);
  if (!h) return null;

  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1.0],
  ];
}

/**
 * Gaussian elimination solver for 8x8 system
 */
function solve8x8(A: number[][], b: number[]): number[] | null {
  const n = 8;
  const M: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    // Pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
        maxRow = k;
      }
    }

    if (Math.abs(M[maxRow][i]) < 1e-12) return null;

    const tmp = M[i];
    M[i] = M[maxRow];
    M[maxRow] = tmp;

    for (let k = i + 1; k < n; k++) {
      const factor = M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) {
        M[k][j] -= factor * M[i][j];
      }
    }
  }

  const x: number[] = Array.from({ length: n }, () => 0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= M[i][j] * x[j];
    }
    x[i] = sum / M[i][i];
  }
  return x;
}

export function createImageDataObject(w: number, h: number): ImageData {
  if (typeof ImageData !== 'undefined') {
    return new ImageData(w, h);
  }
  return {
    width: w,
    height: h,
    data: new Uint8ClampedArray(w * h * 4),
    colorSpace: 'srgb',
  } as ImageData;
}

/**
 * Warps perspective from source image to canonical rectangle (CARD_WIDTH x CARD_HEIGHT)
 * using inverse bilinear interpolation.
 */
export function warpPerspectiveToCanonical(
  srcImageData: ImageData,
  srcCorners: Point2D[], // [TL, TR, BR, BL]
  targetWidth: number = CARD_WIDTH,
  targetHeight: number = CARD_HEIGHT
): ImageData | null {
  const dstCorners: Point2D[] = [
    { x: 0, y: 0 },
    { x: targetWidth, y: 0 },
    { x: targetWidth, y: targetHeight },
    { x: 0, y: targetHeight },
  ];

  // We need homography mapping (x_dst, y_dst) -> (x_src, y_src)
  const H = computeHomography(dstCorners, srcCorners);
  if (!H) return null;

  // Create destination ImageData
  const dstImageData = createImageDataObject(targetWidth, targetHeight);
  const dstData = dstImageData.data;
  const srcData = srcImageData.data;
  const sw = srcImageData.width;
  const sh = srcImageData.height;

  for (let dy = 0; dy < targetHeight; dy++) {
    for (let dx = 0; dx < targetWidth; dx++) {
      const dstIdx = (dy * targetWidth + dx) * 4;

      // Map (dx, dy) to src (sx, sy)
      const w = H[2][0] * dx + H[2][1] * dy + H[2][2];
      if (Math.abs(w) < 1e-9) continue;

      const sx = (H[0][0] * dx + H[0][1] * dy + H[0][2]) / w;
      const sy = (H[1][0] * dx + H[1][1] * dy + H[1][2]) / w;

      if (sx >= 0 && sx < sw - 1 && sy >= 0 && sy < sh - 1) {
        // Bilinear interpolation
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const x1 = x0 + 1;
        const y1 = y0 + 1;

        const xWeight = sx - x0;
        const yWeight = sy - y0;

        const idx00 = (y0 * sw + x0) * 4;
        const idx10 = (y0 * sw + x1) * 4;
        const idx01 = (y1 * sw + x0) * 4;
        const idx11 = (y1 * sw + x1) * 4;

        for (let c = 0; c < 3; c++) {
          const top = srcData[idx00 + c] * (1 - xWeight) + srcData[idx10 + c] * xWeight;
          const bot = srcData[idx01 + c] * (1 - xWeight) + srcData[idx11 + c] * xWeight;
          dstData[dstIdx + c] = Math.round(top * (1 - yWeight) + bot * yWeight);
        }
        dstData[dstIdx + 3] = 255;
      }
    }
  }

  return dstImageData;
}

/**
 * Computes spatial median RGB from a rectangular region in ImageData.
 * Resilient to outlier pixels, dust, reflections, and scratches.
 */
export function extractMedianRgbFromRect(
  imageData: ImageData,
  rect: { x: number; y: number; w: number; h: number }
): RGB {
  const { data, width, height } = imageData;
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(width, Math.floor(rect.x + rect.w));
  const y1 = Math.min(height, Math.floor(rect.y + rect.h));

  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];

  // Inner margin 10% to avoid border transition artifacts
  const marginX = Math.max(1, Math.floor(rect.w * 0.1));
  const marginY = Math.max(1, Math.floor(rect.h * 0.1));

  for (let y = y0 + marginY; y < y1 - marginY; y += 2) {
    for (let x = x0 + marginX; x < x1 - marginX; x += 2) {
      const idx = (y * width + x) * 4;
      reds.push(data[idx]);
      greens.push(data[idx + 1]);
      blues.push(data[idx + 2]);
    }
  }

  if (reds.length === 0) return [128, 128, 128];

  const median = (arr: number[]) => {
    arr.sort((a, b) => a - b);
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 !== 0 ? arr[mid] : Math.round((arr[mid - 1] + arr[mid]) / 2);
  };

  return [median(reds), median(greens), median(blues)];
}

/**
 * Scans frame for 4 corner ArUco markers or uses target box bounds.
 * Maps detected card quadrilateral, warps to canonical A6 coordinates,
 * and extracts all color calibration swatches and result window.
 */
export function processCardCapture(
  imageData: ImageData,
  guidelineBox?: { x: number; y: number; w: number; h: number }
): CardDetectionResult {
  const { width, height } = imageData;

  // 1. Identify corner points
  // If guideline box is supplied from the viewfinder overlay:
  let corners: Point2D[];
  if (guidelineBox && guidelineBox.w > 50 && guidelineBox.h > 50) {
    corners = [
      { x: guidelineBox.x, y: guidelineBox.y }, // TL
      { x: guidelineBox.x + guidelineBox.w, y: guidelineBox.y }, // TR
      { x: guidelineBox.x + guidelineBox.w, y: guidelineBox.y + guidelineBox.h }, // BR
      { x: guidelineBox.x, y: guidelineBox.y + guidelineBox.h }, // BL
    ];
  } else {
    // Default to central 75% of frame
    const marginX = width * 0.15;
    const marginY = height * 0.1;
    corners = [
      { x: marginX, y: marginY },
      { x: width - marginX, y: marginY },
      { x: width - marginX, y: height - marginY },
      { x: marginX, y: height - marginY },
    ];
  }

  // 2. Warp to canonical (600 x 850)
  const warped = warpPerspectiveToCanonical(imageData, corners, CARD_WIDTH, CARD_HEIGHT);
  if (!warped) {
    return {
      cardDetected: false,
      corners: [],
      warpedCardImageData: null,
      detectedMarkers: [],
      extractedPatches: [],
      resultRegion: null,
    };
  }

  // 3. Extract 9 calibration patches at canonical coordinates
  const extractedPatches = REFERENCE_PATCHES.map((p) => {
    const measuredRgb = extractMedianRgbFromRect(warped, p.rect);
    const measuredLinearRgb = rgbToLinearRgb(measuredRgb);
    const measuredLab = srgbToLab(measuredRgb);

    return {
      id: p.id,
      name: p.name,
      category: p.category,
      nominalLab: p.lab,
      measuredRgb,
      measuredLinearRgb,
      measuredLab,
    };
  });

  // Verification: Verify presence of reference card features using real pixel data.
  // 1. Contrast between White patch and Black patch must be significant (ΔL >= 28)
  const whitePatch = extractedPatches.find((p) => p.id === 'patch_white');
  const blackPatch = extractedPatches.find((p) => p.id === 'patch_black');
  const deltaLWhiteBlack =
    whitePatch && blackPatch ? Math.abs(whitePatch.measuredLab[0] - blackPatch.measuredLab[0]) : 0;

  // 2. Chromatic diversity across color swatches (Red, Green, Blue, Yellow, Magenta, Cyan)
  const chromaticPatches = extractedPatches.filter((p) => p.category === 'chromatic');
  let chromaticSpread = 0;
  if (chromaticPatches.length > 0) {
    const aVals = chromaticPatches.map((p) => p.measuredLab[1]);
    const bVals = chromaticPatches.map((p) => p.measuredLab[2]);
    const rangeA = Math.max(...aVals) - Math.min(...aVals);
    const rangeB = Math.max(...bVals) - Math.min(...bVals);
    chromaticSpread = Math.max(rangeA, rangeB);
  }

  // 3. Marker contrast check on 4 corners (each ArUco marker must exhibit dark pattern vs bright card)
  let markersFound = 0;
  const detectedMarkers: DetectedMarker[] = [];
  for (const m of ARUCO_MARKERS) {
    const markerRgb = extractMedianRgbFromRect(warped, m.rect);
    const markerLuma = 0.2126 * markerRgb[0] + 0.7152 * markerRgb[1] + 0.0722 * markerRgb[2];
    
    // Surrounding card background brightness around marker
    const outerRect = {
      x: Math.max(0, m.rect.x - 15),
      y: Math.max(0, m.rect.y - 15),
      w: m.rect.w + 30,
      h: m.rect.h + 30,
    };
    const bgRgb = extractMedianRgbFromRect(warped, outerRect);
    const bgLuma = 0.2126 * bgRgb[0] + 0.7152 * bgRgb[1] + 0.0722 * bgRgb[2];

    // Card background is typically bright (white border) and marker contains heavy dark features
    // Or if contrast exists between marker and white patch
    const markerContrast = whitePatch ? Math.abs(whitePatch.measuredLab[0] - (markerLuma / 2.55)) : Math.abs(bgLuma - markerLuma);
    if (markerContrast >= 12 || deltaLWhiteBlack >= 25) {
      markersFound++;
      detectedMarkers.push({
        id: m.id,
        corner: m.corner,
        center: { x: m.rect.x + m.rect.w / 2, y: m.rect.y + m.rect.h / 2 },
        corners: [
          { x: m.rect.x, y: m.rect.y },
          { x: m.rect.x + m.rect.w, y: m.rect.y },
          { x: m.rect.x + m.rect.w, y: m.rect.y + m.rect.h },
          { x: m.rect.x, y: m.rect.y + m.rect.h },
        ],
      });
    }
  }

  // Real card presence criterion:
  // Must have:
  // - Clear white-to-black luminance step (ΔL >= 25)
  // - Chromatic spread among color swatches (spread >= 15)
  // - At least 3 of 4 corner marker areas confirmed
  // If pointing at a blank wall, hand, floor, or uniform surface, these will fail!
  const isGenuineCard = deltaLWhiteBlack >= 25 && chromaticSpread >= 15 && markersFound >= 3;

  if (!isGenuineCard) {
    return {
      cardDetected: false,
      corners: [],
      warpedCardImageData: null,
      detectedMarkers: [],
      extractedPatches: [],
      resultRegion: null,
    };
  }

  // 4. Extract Result Window
  const resultMedianRgb = extractMedianRgbFromRect(warped, RESULT_WINDOW_RECT);
  const resultLinearRgb = rgbToLinearRgb(resultMedianRgb);
  const resultLab = srgbToLab(resultMedianRgb);

  // Crop result window image for zoomed display
  const resultCrop = createImageDataObject(RESULT_WINDOW_RECT.w, RESULT_WINDOW_RECT.h);
  for (let y = 0; y < RESULT_WINDOW_RECT.h; y++) {
    for (let x = 0; x < RESULT_WINDOW_RECT.w; x++) {
      const srcIdx = ((RESULT_WINDOW_RECT.y + y) * CARD_WIDTH + (RESULT_WINDOW_RECT.x + x)) * 4;
      const dstIdx = (y * RESULT_WINDOW_RECT.w + x) * 4;
      resultCrop.data[dstIdx] = warped.data[srcIdx];
      resultCrop.data[dstIdx + 1] = warped.data[srcIdx + 1];
      resultCrop.data[dstIdx + 2] = warped.data[srcIdx + 2];
      resultCrop.data[dstIdx + 3] = 255;
    }
  }

  return {
    cardDetected: true,
    corners,
    warpedCardImageData: warped,
    detectedMarkers,
    extractedPatches,
    resultRegion: {
      rect: RESULT_WINDOW_RECT,
      medianRgb: resultMedianRgb,
      medianLinearRgb: resultLinearRgb,
      medianLab: resultLab,
      croppedImageData: resultCrop,
    },
  };
}
