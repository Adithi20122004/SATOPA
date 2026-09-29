import type { QualityGateResult } from '../types';

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Computes Laplacian variance for blur detection.
 * Sharp images have high variance of the Laplacian; blurry images have low variance.
 */
export function computeLaplacianVariance(
  imageData: ImageData,
  sampleRect?: { x: number; y: number; w: number; h: number }
): number {
  const { data, width, height } = imageData;
  const sx = Math.max(1, Math.floor(sampleRect?.x || 0));
  const sy = Math.max(1, Math.floor(sampleRect?.y || 0));
  const sw = Math.min(width - 2, Math.floor(sampleRect?.w || width));
  const sh = Math.min(height - 2, Math.floor(sampleRect?.h || height));

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  // Grayscale helper
  const getLuma = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    return 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
  };

  // Adaptive step for high performance on 4K/1080p, while preserving resolution on small crops
  const step = (sw >= 400 && sh >= 400) ? 2 : 1;
  for (let y = sy; y < sy + sh; y += step) {
    for (let x = sx; x < sx + sw; x += step) {
      // Discrete Laplacian 3x3 kernel:
      //  0  1  0
      //  1 -4  1
      //  0  1  0
      const center = getLuma(x, y);
      const top = getLuma(x, y - 1);
      const bottom = getLuma(x, y + 1);
      const left = getLuma(x - 1, y);
      const right = getLuma(x + 1, y);

      const lap = top + bottom + left + right - 4 * center;
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return Math.max(0, variance);
}

/**
 * Evaluates exposure level (mean luminance of the sampled region).
 * Returns score 0-255. Valid range is 35 to 230.
 */
export function computeExposureScore(
  imageData: ImageData,
  sampleRect?: { x: number; y: number; w: number; h: number }
): number {
  const { data, width, height } = imageData;
  const sx = Math.max(0, Math.floor(sampleRect?.x || 0));
  const sy = Math.max(0, Math.floor(sampleRect?.y || 0));
  const sw = Math.min(width - sx, Math.floor(sampleRect?.w || width));
  const sh = Math.min(height - sy, Math.floor(sampleRect?.h || height));

  let totalLuma = 0;
  let count = 0;
  const step = (sw >= 400 && sh >= 400) ? 2 : 1;

  for (let y = sy; y < sy + sh; y += step) {
    for (let x = sx; x < sx + sw; x += step) {
      const idx = (y * width + x) * 4;
      totalLuma += 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
      count++;
    }
  }

  if (count === 0) return 128;
  return Math.round(totalLuma / count);
}

/**
 * Checks for specular glare / saturation clipping (RGB > 250 in all channels)
 */
export function computeGlarePercent(
  imageData: ImageData,
  sampleRect?: { x: number; y: number; w: number; h: number }
): number {
  const { data, width, height } = imageData;
  const sx = Math.max(0, Math.floor(sampleRect?.x || 0));
  const sy = Math.max(0, Math.floor(sampleRect?.y || 0));
  const sw = Math.min(width - sx, Math.floor(sampleRect?.w || width));
  const sh = Math.min(height - sy, Math.floor(sampleRect?.h || height));

  let glareCount = 0;
  let totalCount = 0;

  const step = (sw >= 400 && sh >= 400) ? 2 : 1;
  for (let y = sy; y < sy + sh; y += step) {
    for (let x = sx; x < sx + sw; x += step) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Blown out specular highlight
      if (r >= 250 && g >= 250 && b >= 250) {
        glareCount++;
      }
      totalCount++;
    }
  }

  if (totalCount === 0) return 0;
  return (glareCount / totalCount) * 100.0;
}

/**
 * Evaluates illumination variance across quadrants / regions
 */
export function computeLightingUniformity(
  imageData: ImageData,
  regions: Array<{ x: number; y: number; w: number; h: number }>
): { variancePercent: number; passed: boolean } {
  if (regions.length < 2) return { variancePercent: 0, passed: true };

  const { data, width } = imageData;
  const regionLumas: number[] = [];

  for (const r of regions) {
    let sum = 0;
    let count = 0;
    for (let y = r.y; y < r.y + r.h; y += 2) {
      for (let x = r.x; x < r.x + r.w; x += 2) {
        const idx = (y * width + x) * 4;
        sum += 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
        count++;
      }
    }
    if (count > 0) {
      regionLumas.push(sum / count);
    }
  }

  if (regionLumas.length < 2) return { variancePercent: 0, passed: true };

  const minLuma = Math.min(...regionLumas);
  const maxLuma = Math.max(...regionLumas);
  const avgLuma = regionLumas.reduce((a, b) => a + b, 0) / regionLumas.length;

  if (avgLuma === 0) return { variancePercent: 0, passed: true };

  const diffPercent = ((maxLuma - minLuma) / avgLuma) * 100.0;
  // Fail if lighting variation between corners/quadrants > 35%
  return {
    variancePercent: Math.round(diffPercent * 10) / 10,
    passed: diffPercent <= 35.0,
  };
}

/**
 * Computes tilt angle of a quadrilateral based on perspective distortion
 */
export function computeQuadTiltAngle(corners: Point2D[]): number {
  if (corners.length !== 4) return 0;

  // Compute angles between adjacent sides
  // corner 0: TL, 1: TR, 2: BR, 3: BL
  const vTop = { x: corners[1].x - corners[0].x, y: corners[1].y - corners[0].y };
  const vBottom = { x: corners[2].x - corners[3].x, y: corners[2].y - corners[3].y };
  const vLeft = { x: corners[3].x - corners[0].x, y: corners[3].y - corners[0].y };
  const vRight = { x: corners[2].x - corners[1].x, y: corners[2].y - corners[1].y };

  const angleRad = (v1: Point2D, v2: Point2D) => {
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.hypot(v1.x, v1.y);
    const mag2 = Math.hypot(v2.x, v2.y);
    if (mag1 === 0 || mag2 === 0) return 0;
    return Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2))));
  };

  // Angle difference between opposite sides (parallelism)
  const angleHoriz = (angleRad(vTop, vBottom) * 180) / Math.PI;
  const angleVert = (angleRad(vLeft, vRight) * 180) / Math.PI;

  return Math.round(Math.max(angleHoriz, angleVert) * 10) / 10;
}

/**
 * Evaluates all Quality Gates against the captured frame and detected card.
 */
export function evaluateQualityGates(params: {
  cardDetected: boolean;
  corners?: Point2D[];
  imageData: ImageData;
  cardRect?: { x: number; y: number; w: number; h: number };
  resultWindowRect?: { x: number; y: number; w: number; h: number };
}): QualityGateResult {
  const instructions: string[] = [];

  // Gate 1: Card Detection
  if (!params.cardDetected || !params.corners || params.corners.length !== 4) {
    instructions.push('Reference card not detected. Align all 4 corner ArUco markers (#0, #1, #2, #3) in frame.');
    return {
      cardDetected: false,
      blurPassed: false,
      blurScore: 0,
      blurThreshold: 80,
      glarePassed: false,
      glarePercent: 0,
      exposurePassed: false,
      exposureScore: 0,
      evenLightingPassed: false,
      lightingVariance: 0,
      tiltPassed: false,
      tiltAngleDeg: 0,
      allPassed: false,
      instructions,
    };
  }

  // Gate 2: Excessive Tilt (threshold: 20 deg)
  const tiltDeg = computeQuadTiltAngle(params.corners);
  const tiltPassed = tiltDeg <= 20.0;
  if (!tiltPassed) {
    instructions.push(`Excessive camera tilt (${tiltDeg}° > 20°). Hold phone parallel directly above card.`);
  }

  // Gate 3: Blur (Laplacian Variance, threshold: 80)
  const blurScore = Math.round(computeLaplacianVariance(params.imageData, params.cardRect));
  const blurThreshold = 80;
  const blurPassed = blurScore >= blurThreshold;
  if (!blurPassed) {
    instructions.push(`Image is blurry (Sharpness: ${blurScore}/${blurThreshold}). Hold camera steady and tap to focus.`);
  }

  // Gate 4: Exposure (mean luminance between 35 and 230)
  const exposureScore = computeExposureScore(params.imageData, params.cardRect);
  const exposurePassed = exposureScore >= 35 && exposureScore <= 230;
  if (!exposurePassed) {
    if (exposureScore < 35) {
      instructions.push(`Underexposed frame (Luma: ${exposureScore}/255). Increase ambient lighting.`);
    } else {
      instructions.push(`Overexposed frame (Luma: ${exposureScore}/255). Reduce glare or direct harsh light.`);
    }
  }

  // Gate 5: Specular Glare / Saturation Clipping (threshold: 4%)
  const glarePercent = Math.round(computeGlarePercent(params.imageData, params.resultWindowRect) * 10) / 10;
  const glarePassed = glarePercent <= 4.0;
  if (!glarePassed) {
    instructions.push(`Specular glare detected (${glarePercent}%). Move away from direct lighting or angle card slightly.`);
  }

  // Gate 6: Uneven Lighting
  // Sample 4 quadrants
  const cr = params.cardRect || { x: 0, y: 0, w: params.imageData.width, h: params.imageData.height };
  const qw = Math.floor(cr.w / 3);
  const qh = Math.floor(cr.h / 3);
  const quadrants = [
    { x: cr.x, y: cr.y, w: qw, h: qh }, // TL
    { x: cr.x + cr.w - qw, y: cr.y, w: qw, h: qh }, // TR
    { x: cr.x + cr.w - qw, y: cr.y + cr.h - qh, w: qw, h: qh }, // BR
    { x: cr.x, y: cr.y + cr.h - qh, w: qw, h: qh }, // BL
  ];
  const lightingCheck = computeLightingUniformity(params.imageData, quadrants);
  const evenLightingPassed = lightingCheck.passed;
  if (!evenLightingPassed) {
    instructions.push(`Uneven illumination across card (${lightingCheck.variancePercent}% variance). Use uniform ambient lighting.`);
  }

  const allPassed = tiltPassed && blurPassed && exposurePassed && glarePassed && evenLightingPassed;

  return {
    cardDetected: true,
    blurPassed,
    blurScore,
    blurThreshold,
    glarePassed,
    glarePercent,
    exposurePassed,
    exposureScore,
    evenLightingPassed,
    lightingVariance: lightingCheck.variancePercent,
    tiltPassed,
    tiltAngleDeg: tiltDeg,
    allPassed,
    instructions,
  };
}
