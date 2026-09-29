import type { RGB } from '../vision/colorMath';

export interface SurrogateSample {
  id: string;
  name: string;
  lightingCondition: 'Standard D65' | 'Warm Tungsten (3000K)' | 'Cool Fluorescent' | 'Dim / Underexposed';
  groundTruth: 'POSITIVE' | 'NEGATIVE' | 'INCONCLUSIVE';
  rawPatchRgb: RGB[]; // 9 measured patches under this illuminant
  rawResultRgb: RGB; // measured reaction window under this illuminant
  notes: string;
}

// Illuminant color shifts:
// Tungsten adds +25% red, -20% blue
// Fluorescent adds +15% green, -10% red
export const SURROGATE_DATASET: SurrogateSample[] = [
  {
    id: 'sample-01',
    name: 'Opioid Standard Reaction (Controlled Lighting)',
    lightingCondition: 'Standard D65',
    groundTruth: 'POSITIVE',
    rawPatchRgb: [
      [244, 245, 246], // White
      [125, 126, 126], // Grey
      [28, 28, 29],    // Black
      [208, 48, 48],   // Red
      [58, 140, 62],   // Green
      [26, 116, 208],  // Blue
      [2, 149, 165],   // Cyan
      [192, 25, 90],   // Magenta
      [249, 190, 46],  // Yellow
    ],
    rawResultRgb: [38, 22, 54], // Deep violet purple
    notes: 'Ideal diffuse ambient lighting. High baseline fidelity.',
  },
  {
    id: 'sample-02',
    name: 'Alkaloid Positive under Warm Incandescent (Tungsten 3000K)',
    lightingCondition: 'Warm Tungsten (3000K)',
    groundTruth: 'POSITIVE',
    rawPatchRgb: [
      [255, 225, 175], // White (heavily yellow-tinted)
      [145, 120, 85],  // Grey
      [36, 26, 16],    // Black
      [235, 45, 30],   // Red
      [68, 140, 40],   // Green
      [20, 95, 155],   // Blue (attenuated)
      [10, 145, 130],  // Cyan
      [205, 30, 70],   // Magenta
      [255, 200, 35],  // Yellow
    ],
    rawResultRgb: [65, 30, 32], // Shifted into dark reddish-brown due to warm light!
    notes: 'Without calibration, yellow cast shifts violet into brownish tone.',
  },
  {
    id: 'sample-03',
    name: 'Unreacted Clear Reagent (Standard D65)',
    lightingCondition: 'Standard D65',
    groundTruth: 'NEGATIVE',
    rawPatchRgb: [
      [245, 246, 247],
      [126, 127, 127],
      [27, 27, 27],
      [210, 47, 47],
      [56, 141, 60],
      [25, 117, 209],
      [0, 150, 166],
      [193, 24, 91],
      [250, 191, 45],
    ],
    rawResultRgb: [225, 215, 165], // Pale straw/yellow
    notes: 'Standard negative blank.',
  },
  {
    id: 'sample-04',
    name: 'Negative Reagent under Cool Fluorescent (Green/Blue Shift)',
    lightingCondition: 'Cool Fluorescent',
    groundTruth: 'NEGATIVE',
    rawPatchRgb: [
      [220, 245, 255], // White (cool bluish cast)
      [110, 130, 140], // Grey
      [22, 28, 32],    // Black
      [185, 45, 55],   // Red
      [52, 155, 75],   // Green
      [28, 128, 230],  // Blue
      [0, 162, 185],   // Cyan
      [175, 22, 105],  // Magenta
      [225, 195, 55],  // Yellow
    ],
    rawResultRgb: [185, 218, 190], // Pale yellow shifted towards dull greenish!
    notes: 'Fluorescent spike shifts straw color towards pale green.',
  },
  {
    id: 'sample-05',
    name: 'Non-Target Intermediate Cross-Reaction',
    lightingCondition: 'Standard D65',
    groundTruth: 'INCONCLUSIVE',
    rawPatchRgb: [
      [245, 245, 245],
      [127, 127, 127],
      [26, 26, 26],
      [211, 47, 47],
      [56, 142, 60],
      [25, 118, 210],
      [0, 151, 167],
      [194, 24, 91],
      [251, 192, 45],
    ],
    rawResultRgb: [120, 68, 55], // Muddy orange-brown intermediate
    notes: 'Exhibits intermediate reaction outside distinct primary positive zone.',
  },
  {
    id: 'sample-06',
    name: 'Weak Reaction under Underexposed Ambient Shadow',
    lightingCondition: 'Dim / Underexposed',
    groundTruth: 'INCONCLUSIVE',
    rawPatchRgb: [
      [150, 150, 150], // White crushed to grey
      [75, 75, 75],    // Grey
      [15, 15, 15],    // Black
      [125, 28, 28],
      [32, 85, 36],
      [15, 70, 125],
      [0, 90, 100],
      [115, 14, 54],
      [150, 115, 26],
    ],
    rawResultRgb: [55, 42, 50], // Very dark low-contrast shade
    notes: 'Severe underexposure reduces chromatic contrast below margin threshold.',
  },
  {
    id: 'sample-07',
    name: 'Strong Positive under Incandescent Lamp',
    lightingCondition: 'Warm Tungsten (3000K)',
    groundTruth: 'POSITIVE',
    rawPatchRgb: [
      [255, 228, 180],
      [148, 122, 88],
      [38, 28, 18],
      [238, 48, 32],
      [70, 142, 42],
      [22, 98, 158],
      [12, 148, 132],
      [208, 32, 72],
      [255, 202, 38],
    ],
    rawResultRgb: [50, 24, 40], // Deep violet shifted with red bias
    notes: 'Color matrix recovers true deep violet chromaticity.',
  },
  {
    id: 'sample-08',
    name: 'Unreacted Negative Reagent (High Ambient Sunlight)',
    lightingCondition: 'Standard D65',
    groundTruth: 'NEGATIVE',
    rawPatchRgb: [
      [250, 250, 252],
      [130, 130, 130],
      [28, 28, 28],
      [215, 50, 50],
      [58, 145, 62],
      [26, 120, 215],
      [0, 154, 170],
      [198, 26, 94],
      [254, 195, 48],
    ],
    rawResultRgb: [230, 220, 170],
    notes: 'Clear negative under bright indirect sunlight.',
  },
];
