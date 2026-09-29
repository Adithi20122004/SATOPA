/**
 * Colorimetric conversions and CIEDE2000 standard implementations
 * Uses standard CIE D65 illuminant (Xn=0.95047, Yn=1.00000, Zn=1.08883)
 */

export type RGB = [number, number, number]; // 0-255
export type LinearRGB = [number, number, number]; // 0.0 - 1.0
export type XYZ = [number, number, number];
export type Lab = [number, number, number]; // [L: 0-100, a: -128-127, b: -128-127]

// CIE D65 Standard Illuminant reference white point
const D65_Xn = 0.95047;
const D65_Yn = 1.00000;
const D65_Zn = 1.08883;

/**
 * Converts 8-bit sRGB [0..255] to Linear RGB [0..1]
 * Inverse sRGB companding
 */
export function srgbToLinear(val: number): number {
  const c = Math.max(0, Math.min(255, val)) / 255.0;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Converts Linear RGB [0..1] to 8-bit sRGB [0..255]
 */
export function linearToSrgb(val: number): number {
  const c = Math.max(0, val);
  const s = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(255, s * 255.0)));
}

export function rgbToLinearRgb(rgb: RGB): LinearRGB {
  return [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])];
}

export function linearRgbToRgb(lin: LinearRGB): RGB {
  return [linearToSrgb(lin[0]), linearToSrgb(lin[1]), linearToSrgb(lin[2])];
}

/**
 * Converts Linear sRGB to CIE 1931 XYZ (D65)
 */
export function linearRgbToXyz([r, g, b]: LinearRGB): XYZ {
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
  const z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;
  return [x, y, z];
}

/**
 * Converts CIE 1931 XYZ (D65) to CIELAB (L*a*b*)
 */
export function xyzToLab([x, y, z]: XYZ): Lab {
  const xr = x / D65_Xn;
  const yr = y / D65_Yn;
  const zr = z / D65_Zn;

  const epsilon = 0.008856; // (24/116)^3
  const kappa = 903.3; // (29/3)^3

  const fx = xr > epsilon ? Math.cbrt(xr) : (kappa * xr + 16) / 116;
  const fy = yr > epsilon ? Math.cbrt(yr) : (kappa * yr + 16) / 116;
  const fz = zr > epsilon ? Math.cbrt(zr) : (kappa * zr + 16) / 116;

  const L = Math.max(0, Math.min(100, 116 * fy - 16));
  const a = 500 * (fx - fy);
  const b = 200 * (fy - fz);

  return [L, a, b];
}

/**
 * Direct sRGB [0-255] to CIELAB
 */
export function srgbToLab(rgb: RGB): Lab {
  const lin = rgbToLinearRgb(rgb);
  const xyz = linearRgbToXyz(lin);
  return xyzToLab(xyz);
}

/**
 * CIEDE2000 (ΔE00) Standard Color Difference implementation
 * Full standard Sharma-Wu-Dalal formulation
 */
export function deltaE00(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  const kL = 1.0;
  const kC = 1.0;
  const kH = 1.0;

  const deg2rad = Math.PI / 180.0;
  const rad2deg = 180.0 / Math.PI;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2.0;

  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1.0 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));

  const a1Prime = (1.0 + G) * a1;
  const a2Prime = (1.0 + G) * a2;

  const C1Prime = Math.hypot(a1Prime, b1);
  const C2Prime = Math.hypot(a2Prime, b2);

  let h1Prime = Math.atan2(b1, a1Prime) * rad2deg;
  if (h1Prime < 0) h1Prime += 360;

  let h2Prime = Math.atan2(b2, a2Prime) * rad2deg;
  if (h2Prime < 0) h2Prime += 360;

  const deltaLPrime = L2 - L1;
  const deltaCPrime = C2Prime - C1Prime;

  let deltahPrime = 0;
  if (C1Prime * C2Prime !== 0) {
    const diff = h2Prime - h1Prime;
    if (Math.abs(diff) <= 180) {
      deltahPrime = diff;
    } else if (diff > 180) {
      deltahPrime = diff - 360;
    } else {
      deltahPrime = diff + 360;
    }
  }

  const deltaHPrime = 2.0 * Math.sqrt(C1Prime * C2Prime) * Math.sin((deltahPrime * deg2rad) / 2.0);

  const LbarPrime = (L1 + L2) / 2.0;
  const CbarPrime = (C1Prime + C2Prime) / 2.0;

  let HbarPrime = h1Prime + h2Prime;
  if (C1Prime * C2Prime === 0) {
    HbarPrime = h1Prime + h2Prime;
  } else if (Math.abs(h1Prime - h2Prime) <= 180) {
    HbarPrime = (h1Prime + h2Prime) / 2.0;
  } else if (h1Prime + h2Prime < 360) {
    HbarPrime = (h1Prime + h2Prime + 360) / 2.0;
  } else {
    HbarPrime = (h1Prime + h2Prime - 360) / 2.0;
  }

  const T =
    1.0 -
    0.17 * Math.cos((HbarPrime - 30) * deg2rad) +
    0.24 * Math.cos(2 * HbarPrime * deg2rad) +
    0.32 * Math.cos((3 * HbarPrime + 6) * deg2rad) -
    0.20 * Math.cos((4 * HbarPrime - 63) * deg2rad);

  const deltaTheta = 30 * Math.exp(-Math.pow((HbarPrime - 275) / 25.0, 2));
  const CbarPrime7 = Math.pow(CbarPrime, 7);
  const RC = 2.0 * Math.sqrt(CbarPrime7 / (CbarPrime7 + Math.pow(25, 7)));

  const SL = 1.0 + (0.015 * Math.pow(LbarPrime - 50, 2)) / Math.sqrt(20 + Math.pow(LbarPrime - 50, 2));
  const SC = 1.0 + 0.045 * CbarPrime;
  const SH = 1.0 + 0.015 * CbarPrime * T;
  const RT = -Math.sin(2 * deltaTheta * deg2rad) * RC;

  const dL = deltaLPrime / (kL * SL);
  const dC = deltaCPrime / (kC * SC);
  const dH = deltaHPrime / (kH * SH);

  const dE2 = dL * dL + dC * dC + dH * dH + RT * dC * dH;
  return Math.sqrt(Math.max(0, dE2));
}

/**
 * Solves for 3x3 Linear Color Correction Matrix M by Least Squares:
 * Target = M * Measured
 * Using Normal Equations: M = (Target * Measured^T) * (Measured * Measured^T)^-1
 */
export function fitLinearColorCorrectionMatrix(
  measuredLinear: LinearRGB[],
  targetLinear: LinearRGB[]
): { matrix: number[][]; rmse: number } {
  const n = measuredLinear.length;
  if (n < 3) {
    // Identity fallback
    return {
      matrix: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      rmse: 0,
    };
  }

  // Measured matrix X: 3 x n
  // Target matrix Y: 3 x n
  // We want M (3 x 3) such that Y approx M * X
  // Normal equation: M * (X * X^T) = Y * X^T => M = (Y * X^T) * inv(X * X^T)

  const XXT = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  const YXT = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  for (let k = 0; k < n; k++) {
    const x = measuredLinear[k];
    const y = targetLinear[k];

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        XXT[r][c] += x[r] * x[c];
        YXT[r][c] += y[r] * x[c];
      }
    }
  }

  // Tikhonov ridge regularization for conditioning
  for (let i = 0; i < 3; i++) {
    XXT[i][i] += 1e-4;
  }

  // Invert 3x3 symmetric matrix XXT
  const invXXT = invert3x3(XXT);
  if (!invXXT) {
    return {
      matrix: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      rmse: 99.0,
    };
  }

  // M = YXT * invXXT
  const M = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      for (let k = 0; k < 3; k++) {
        M[r][c] += YXT[r][k] * invXXT[k][c];
      }
    }
  }

  // Calculate residual RMSE across fitted points
  let sumSqErr = 0;
  for (let k = 0; k < n; k++) {
    const x = measuredLinear[k];
    const y = targetLinear[k];
    const predR = M[0][0] * x[0] + M[0][1] * x[1] + M[0][2] * x[2];
    const predG = M[1][0] * x[0] + M[1][1] * x[1] + M[1][2] * x[2];
    const predB = M[2][0] * x[0] + M[2][1] * x[1] + M[2][2] * x[2];

    sumSqErr +=
      Math.pow(predR - y[0], 2) + Math.pow(predG - y[1], 2) + Math.pow(predB - y[2], 2);
  }

  const rmse = Math.sqrt(sumSqErr / (3 * n));
  return { matrix: M, rmse };
}

/**
 * Applies 3x3 linear matrix to a linear RGB vector, with clamping [0, 1]
 */
export function applyCorrectionMatrix(matrix: number[][], rgb: LinearRGB): LinearRGB {
  const r = matrix[0][0] * rgb[0] + matrix[0][1] * rgb[1] + matrix[0][2] * rgb[2];
  const g = matrix[1][0] * rgb[0] + matrix[1][1] * rgb[1] + matrix[1][2] * rgb[2];
  const b = matrix[2][0] * rgb[0] + matrix[2][1] * rgb[1] + matrix[2][2] * rgb[2];
  return [Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b))];
}

function invert3x3(A: number[][]): number[][] | null {
  const a00 = A[0][0], a01 = A[0][1], a02 = A[0][2];
  const a10 = A[1][0], a11 = A[1][1], a12 = A[1][2];
  const a20 = A[2][0], a21 = A[2][1], a22 = A[2][2];

  const b00 = a11 * a22 - a12 * a21;
  const b01 = a02 * a21 - a01 * a22;
  const b02 = a01 * a12 - a02 * a11;
  const b10 = a12 * a20 - a10 * a22;
  const b11 = a00 * a22 - a02 * a20;
  const b12 = a02 * a10 - a00 * a12;
  const b20 = a10 * a21 - a11 * a20;
  const b21 = a01 * a20 - a00 * a21;
  const b22 = a00 * a11 - a01 * a10;

  const det = a00 * b00 + a01 * b10 + a02 * b20;
  if (Math.abs(det) < 1e-12) return null;

  const invDet = 1.0 / det;
  return [
    [b00 * invDet, b01 * invDet, b02 * invDet],
    [b10 * invDet, b11 * invDet, b12 * invDet],
    [b20 * invDet, b21 * invDet, b22 * invDet],
  ];
}
