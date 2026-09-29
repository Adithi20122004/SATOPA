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

const NOMINAL_PATCHES: RGB[] = [
  [244, 245, 246], // White
  [125, 126, 126], // Grey
  [28, 28, 29],    // Black
  [208, 48, 48],   // Red
  [58, 140, 62],   // Green
  [26, 116, 208],  // Blue
  [2, 149, 165],   // Cyan
  [192, 25, 90],   // Magenta
  [249, 190, 46],  // Yellow
];

// Helper to clamp RGB values
function clampRgb(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

// Pseudo-random deterministic generator (LCG)
function createSeededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const rand = createSeededRandom(4226231);

const LIGHTING_CONFIGS: Array<{
  regime: 'Standard D65' | 'Warm Tungsten (3000K)' | 'Cool Fluorescent' | 'Dim / Underexposed';
  mult: [number, number, number];
  noiseAmp: number;
  description: string;
}> = [
  {
    regime: 'Standard D65',
    mult: [1.0, 1.0, 1.0],
    noiseAmp: 3,
    description: 'Daylight standard 6500K diffuse illumination',
  },
  {
    regime: 'Warm Tungsten (3000K)',
    mult: [1.24, 1.02, 0.72],
    noiseAmp: 4,
    description: 'Incandescent 3000K warm interior lighting with yellow-orange chromatic cast',
  },
  {
    regime: 'Cool Fluorescent',
    mult: [0.88, 1.16, 1.10],
    noiseAmp: 4,
    description: 'Cool office fluorescent lighting with mercury 546nm green/cyan emission spike',
  },
  {
    regime: 'Dim / Underexposed',
    mult: [0.55, 0.53, 0.52],
    noiseAmp: 5,
    description: 'Low-lux twilight / underexposed condition with sensor SNR attenuation',
  },
];

function generateSurrogateDataset(): SurrogateSample[] {
  const dataset: SurrogateSample[] = [];
  let sampleId = 1;

  for (const config of LIGHTING_CONFIGS) {
    // 50 samples per lighting regime = 200 total samples
    // 22 Positive, 20 Negative, 8 Inconclusive
    for (let i = 0; i < 50; i++) {
      let groundTruth: 'POSITIVE' | 'NEGATIVE' | 'INCONCLUSIVE';
      let nominalResult: RGB;
      let label: string;

      if (i < 22) {
        groundTruth = 'POSITIVE';
        // Deep purple/violet reaction with concentration variance
        const jitterR = Math.round((rand() - 0.5) * 8);
        const jitterG = Math.round((rand() - 0.5) * 6);
        const jitterB = Math.round((rand() - 0.5) * 10);
        nominalResult = [
          clampRgb(38 + jitterR),
          clampRgb(22 + jitterG),
          clampRgb(54 + jitterB),
        ];
        label = `Opioid/Alkaloid Positive #${i + 1}`;
      } else if (i < 42) {
        groundTruth = 'NEGATIVE';
        // Pale straw/yellow unreacted reagent blank
        const jitterR = Math.round((rand() - 0.5) * 8);
        const jitterG = Math.round((rand() - 0.5) * 8);
        const jitterB = Math.round((rand() - 0.5) * 10);
        nominalResult = [
          clampRgb(225 + jitterR),
          clampRgb(215 + jitterG),
          clampRgb(165 + jitterB),
        ];
        label = `Unreacted Blank Negative #${i - 21}`;
      } else {
        groundTruth = 'INCONCLUSIVE';
        // Intermediate reaction, atypical color, or borderline deltaE
        const jitter = Math.round((rand() - 0.5) * 14);
        nominalResult = [
          clampRgb(128 + jitter),
          clampRgb(120 - jitter),
          clampRgb(95 + jitter * 2),
        ];
        label = `Non-Target Intermediate Cross-Reaction #${i - 41}`;
      }

      // Apply illuminant chromatic multiplier and sensor noise to all 9 patches
      const rawPatchRgb: RGB[] = NOMINAL_PATCHES.map((nominal) => {
        const nr = (rand() - 0.5) * config.noiseAmp;
        const ng = (rand() - 0.5) * config.noiseAmp;
        const nb = (rand() - 0.5) * config.noiseAmp;
        return [
          clampRgb(nominal[0] * config.mult[0] + nr),
          clampRgb(nominal[1] * config.mult[1] + ng),
          clampRgb(nominal[2] * config.mult[2] + nb),
        ] as RGB;
      });

      // Apply the same illuminant transform to the reaction window
      const resNoiseR = (rand() - 0.5) * config.noiseAmp;
      const resNoiseG = (rand() - 0.5) * config.noiseAmp;
      const resNoiseB = (rand() - 0.5) * config.noiseAmp;
      const rawResultRgb: RGB = [
        clampRgb(nominalResult[0] * config.mult[0] + resNoiseR),
        clampRgb(nominalResult[1] * config.mult[1] + resNoiseG),
        clampRgb(nominalResult[2] * config.mult[2] + resNoiseB),
      ];

      dataset.push({
        id: `surrogate-${String(sampleId).padStart(3, '0')}`,
        name: `${label} (${config.regime})`,
        lightingCondition: config.regime,
        groundTruth,
        rawPatchRgb,
        rawResultRgb,
        notes: `${config.description}. Synthetic benchmark record.`,
      });

      sampleId++;
    }
  }

  return dataset;
}

export const SURROGATE_DATASET: SurrogateSample[] = generateSurrogateDataset();
