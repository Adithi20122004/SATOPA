import type { KitProfile, ClassificationResult, CalibrationResult, QualityGateResult } from '../types';
import type { CardDetectionResult } from './cardDetector';
import type { LinearRGB, Lab } from './colorMath';
import {
  fitLinearColorCorrectionMatrix,
  applyCorrectionMatrix,
  linearRgbToRgb,
  srgbToLab,
  deltaE00,
} from './colorMath';
import { REFERENCE_PATCHES } from './referenceCard';

export interface FullAnalysisResult {
  calibration: CalibrationResult;
  classification: ClassificationResult;
  rawLab: Lab;
  calibratedLab: Lab;
}

/**
 * Executes full colorimetric calibration and abstain-first CIEDE2000 classification
 */
export function analyzeTestResult(
  cardResult: CardDetectionResult,
  quality: QualityGateResult,
  kit: KitProfile
): FullAnalysisResult {
  // 1. Gather measured linear RGB vs nominal linear RGB for all 9 patches
  const measuredLinearList: LinearRGB[] = [];
  const targetLinearList: LinearRGB[] = [];

  for (const patch of cardResult.extractedPatches) {
    const nominal = REFERENCE_PATCHES.find((p) => p.id === patch.id);
    if (nominal) {
      measuredLinearList.push(patch.measuredLinearRgb);
      targetLinearList.push(nominal.linearRgb);
    }
  }

  // 2. Fit least-squares linear color correction matrix M
  const { matrix, rmse } = fitLinearColorCorrectionMatrix(measuredLinearList, targetLinearList);

  // 3. Extract raw result window color
  const rawLinear = cardResult.resultRegion?.medianLinearRgb || [0.5, 0.5, 0.5];
  const rawLab = cardResult.resultRegion?.medianLab || srgbToLab([128, 128, 128]);

  // 4. Apply correction matrix in linear RGB space
  const calibratedLinear = applyCorrectionMatrix(matrix, rawLinear);
  const calibratedRgb = linearRgbToRgb(calibratedLinear);
  const calibratedLab = srgbToLab(calibratedRgb);

  const calibrationResult: CalibrationResult = {
    matrix,
    residualRmse: Math.round(rmse * 1000) / 1000,
    measuredPatchesLab: cardResult.extractedPatches.map((p) => p.measuredLab),
    calibratedResultLab: calibratedLab,
    rawResultLab: rawLab,
  };

  // 5. Expiry & Timing Checks
  const todayIso = new Date().toISOString().split('T')[0];
  const isExpiredKit = kit.expiryDate < todayIso;

  const classificationResult = classifyLabDirectly(
    calibratedLab,
    kit,
    quality.allPassed,
    quality.instructions
  );
  classificationResult.isExpiredKit = isExpiredKit;

  return {
    calibration: calibrationResult,
    classification: classificationResult,
    rawLab,
    calibratedLab,
  };
}

/**
 * Direct classification of a measured Lab coordinate using the real kit profile rules
 */
export function classifyLabDirectly(
  lab: Lab,
  kit: KitProfile,
  qualityPassed: boolean = true,
  qualityInstructions: string[] = []
): ClassificationResult {
  const classDistances = kit.classes.map((cls) => ({
    className: cls.name,
    description: cls.description,
    deltaE00: Math.round(deltaE00(lab, cls.expectedLab) * 10) / 10,
  }));

  // Sort by ascending distance (closest match first)
  classDistances.sort((a, b) => a.deltaE00 - b.deltaE00);

  const top = classDistances[0];
  const runnerUp = classDistances.length > 1 ? classDistances[1] : null;
  const runnerUpMargin = runnerUp ? Math.round((runnerUp.deltaE00 - top.deltaE00) * 10) / 10 : 99.0;

  // Abstain-First Classification Rule
  let outcome: 'POSITIVE' | 'NEGATIVE' | 'INCONCLUSIVE';
  let inconclusiveReason: string | undefined;

  const T = kit.deltaEAcceptanceThreshold;
  const M = kit.deltaEMarginThreshold;

  if (!qualityPassed) {
    outcome = 'INCONCLUSIVE';
    inconclusiveReason = `Evidentiary quality standards not met (${qualityInstructions.join('; ')}).`;
  } else if (top.deltaE00 > T) {
    outcome = 'INCONCLUSIVE';
    inconclusiveReason = `Colorimetric distance to nearest class (ΔE=${top.deltaE00}) exceeds acceptance threshold (T=${T}). Unmatched spectral signature.`;
  } else if (runnerUp && runnerUpMargin < M) {
    outcome = 'INCONCLUSIVE';
    inconclusiveReason = `Ambiguous reaction: margin between ${top.className} (ΔE=${top.deltaE00}) and ${runnerUp.className} (ΔE=${runnerUp.deltaE00}) is ΔE=${runnerUpMargin} (required margin M≥${M}).`;
  } else if (top.className === 'INCONCLUSIVE') {
    outcome = 'INCONCLUSIVE';
    inconclusiveReason = 'Reaction matched intermediate inconclusive reference zone.';
  } else {
    outcome = top.className as 'POSITIVE' | 'NEGATIVE';
  }

  // Confidence computation: 100% at ΔE=0, scaling down towards threshold T
  const confidence =
    outcome === 'INCONCLUSIVE'
      ? Math.max(20, Math.round((1 - Math.min(top.deltaE00, T * 1.5) / (T * 1.5)) * 60))
      : Math.min(99, Math.max(50, Math.round((1 - top.deltaE00 / (T * 1.2)) * 100)));

  return {
    outcome,
    matchedClass: top.className,
    confidence,
    distances: classDistances.map((d) => ({ className: d.className, deltaE00: d.deltaE00 })),
    topDistance: top.deltaE00,
    runnerUpMargin,
    inconclusiveReason,
    isExpiredKit: false,
    isOutsideTimeWindow: false,
  };
}
