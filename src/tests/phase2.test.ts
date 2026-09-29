import { describe, it, expect } from 'vitest';
import { computeHomography } from '../vision/cardDetector';
import {
  computeLaplacianVariance,
  computeGlarePercent,
  computeQuadTiltAngle,
} from '../vision/qualityGates';
import {
  srgbToLab,
  deltaE00,
  fitLinearColorCorrectionMatrix,
  applyCorrectionMatrix,
} from '../vision/colorMath';
import type { LinearRGB } from '../vision/colorMath';

function createMockImageData(w: number, h: number): ImageData {
  return {
    width: w,
    height: h,
    data: new Uint8ClampedArray(w * h * 4),
    colorSpace: 'srgb',
  } as ImageData;
}

describe('Phase 2 Vision Pipeline & Quality Gates Tests', () => {
  it('computes accurate 2D Homography matrix via DLT', () => {
    const src = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    // Scale by 2 and offset by 50
    const dst = [
      { x: 50, y: 50 },
      { x: 250, y: 50 },
      { x: 250, y: 250 },
      { x: 50, y: 250 },
    ];

    const H = computeHomography(src, dst);
    expect(H).not.toBeNull();
    if (H) {
      expect(H.length).toBe(3);
      expect(H[0].length).toBe(3);
      // Verify center mapping (50, 50) -> (150, 150)
      const w = H[2][0] * 50 + H[2][1] * 50 + H[2][2];
      const xMap = (H[0][0] * 50 + H[0][1] * 50 + H[0][2]) / w;
      const yMap = (H[1][0] * 50 + H[1][1] * 50 + H[1][2]) / w;
      expect(Math.round(xMap)).toBe(150);
      expect(Math.round(yMap)).toBe(150);
    }
  });

  it('detects blur via Laplacian variance', () => {
    // 1. Uniform image -> zero variance
    const flatImg = createMockImageData(20, 20);
    flatImg.data.fill(128);
    const flatVar = computeLaplacianVariance(flatImg);
    expect(flatVar).toBe(0);

    // 2. High-contrast step edges (sharp transition) -> high variance
    const sharpImg = createMockImageData(20, 20);
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        // Half black, half white (sharp edge in center)
        const val = x < 10 ? 255 : 0;
        const idx = (y * 20 + x) * 4;
        sharpImg.data[idx] = val;
        sharpImg.data[idx + 1] = val;
        sharpImg.data[idx + 2] = val;
        sharpImg.data[idx + 3] = 255;
      }
    }
    const sharpVar = computeLaplacianVariance(sharpImg);
    expect(sharpVar).toBeGreaterThan(100);
  });

  it('detects specular glare and saturation clipping', () => {
    const img = createMockImageData(10, 10);
    img.data.fill(100);

    // 10 pixels saturated out of 100 => exactly 10%
    for (let i = 0; i < 10; i++) {
      img.data[i * 4] = 255;
      img.data[i * 4 + 1] = 255;
      img.data[i * 4 + 2] = 255;
    }

    const glare = computeGlarePercent(img);
    expect(glare).toBeCloseTo(10, 1);
  });

  it('calculates camera tilt and skew angle correctly', () => {
    // Perfectly parallel rectangle -> 0 deg tilt
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const tilt0 = computeQuadTiltAngle(square);
    expect(tilt0).toBe(0);

    // Skewed / trapezoidal quad -> significant tilt angle
    const skewed = [
      { x: 20, y: 0 },
      { x: 80, y: 0 },
      { x: 120, y: 100 },
      { x: -20, y: 100 },
    ];
    const tiltSkewed = computeQuadTiltAngle(skewed);
    expect(tiltSkewed).toBeGreaterThan(15);
  });

  it('calculates CIEDE2000 (ΔE00) color difference accurately', () => {
    const whiteLab = srgbToLab([255, 255, 255]);
    const blackLab = srgbToLab([0, 0, 0]);

    // Difference between white and black should be close to 100
    const dE_WB = deltaE00(whiteLab, blackLab);
    expect(dE_WB).toBeGreaterThan(90);

    // Difference with itself must be 0
    expect(deltaE00(whiteLab, whiteLab)).toBe(0);

    // Subtle difference
    const c1 = srgbToLab([200, 100, 100]);
    const c2 = srgbToLab([202, 100, 100]);
    const dE_Subtle = deltaE00(c1, c2);
    expect(dE_Subtle).toBeGreaterThan(0);
    expect(dE_Subtle).toBeLessThan(2.0);
  });

  it('fits linear color correction matrix with least-squares', () => {
    // 4 linearly independent vectors spanning 3D RGB space (R, G, B, White)
    const measured: LinearRGB[] = [
      [0.9, 0.9, 0.9], // White
      [0.8, 0.1, 0.1], // Red
      [0.1, 0.8, 0.1], // Green
      [0.1, 0.1, 0.8], // Blue
    ];
    const targets: LinearRGB[] = [
      [0.9, 0.9, 0.9],
      [0.8, 0.1, 0.1],
      [0.1, 0.8, 0.1],
      [0.1, 0.1, 0.8],
    ];

    const { matrix, rmse } = fitLinearColorCorrectionMatrix(measured, targets);
    expect(rmse).toBeLessThan(0.01);
    expect(matrix[0][0]).toBeCloseTo(1, 1);
    expect(matrix[1][1]).toBeCloseTo(1, 1);
    expect(matrix[2][2]).toBeCloseTo(1, 1);

    const testVec: LinearRGB = [0.5, 0.5, 0.5];
    const corrected = applyCorrectionMatrix(matrix, testVec);
    expect(corrected[0]).toBeCloseTo(0.5, 1);
  });
});
