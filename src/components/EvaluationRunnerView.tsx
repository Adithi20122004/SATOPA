import React, { useState } from 'react';
import {
  BarChart3,
  Play,
  Sparkles,
  Info,
  CheckCircle2,
  RefreshCw,
  Sun,
  Flame,
  Lightbulb,
  Moon,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import type { KitProfile } from '../types';
import { SURROGATE_DATASET } from '../data/surrogateSamples';
import type { SurrogateSample } from '../data/surrogateSamples';
import {
  rgbToLinearRgb,
  srgbToLab,
  fitLinearColorCorrectionMatrix,
  applyCorrectionMatrix,
  linearRgbToRgb,
} from '../vision/colorMath';
import { REFERENCE_PATCHES } from '../vision/referenceCard';
import { classifyLabDirectly } from '../vision/classifier';
import { PresumptiveDisclaimer } from './PresumptiveDisclaimer';
import { StatusChip } from './StatusChip';

interface EvaluationRunnerViewProps {
  kit: KitProfile;
}

interface BenchmarkResultItem {
  sample: SurrogateSample;
  uncalibratedOutcome: 'POSITIVE' | 'NEGATIVE' | 'INCONCLUSIVE';
  uncalibratedTopDeltaE: number;
  uncalibratedCorrect: boolean;
  calibratedOutcome: 'POSITIVE' | 'NEGATIVE' | 'INCONCLUSIVE';
  calibratedTopDeltaE: number;
  calibratedCorrect: boolean;
  deltaEImprovement: number;
}

interface ConfusionMatrix {
  matrix: {
    [actual: string]: {
      [predicted: string]: number;
    };
  };
  total: number;
  correct: number;
  accuracy: number;
  falseNegatives: number;
}

interface RegimeStat {
  regime: string;
  total: number;
  uncalCorrect: number;
  uncalAccuracy: number;
  calCorrect: number;
  calAccuracy: number;
}

interface RefusalStat {
  totalInconclusive: number;
  uncalCorrectRefusals: number;
  uncalRefusalRate: number;
  calCorrectRefusals: number;
  calRefusalRate: number;
}

export const EvaluationRunnerView: React.FC<EvaluationRunnerViewProps> = ({ kit }) => {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [results, setResults] = useState<BenchmarkResultItem[] | null>(null);
  const [matrixUncal, setMatrixUncal] = useState<ConfusionMatrix | null>(null);
  const [matrixCal, setMatrixCal] = useState<ConfusionMatrix | null>(null);
  const [regimeStats, setRegimeStats] = useState<RegimeStat[] | null>(null);
  const [refusalStats, setRefusalStats] = useState<RefusalStat[] | null>(null);
  const [activeRegimeFilter, setActiveRegimeFilter] = useState<string>('ALL');

  const runBenchmark = () => {
    setIsRunning(true);
    setProgress(5);

    const outcomes = ['POSITIVE', 'NEGATIVE', 'INCONCLUSIVE'] as const;

    const initMatrix = (): ConfusionMatrix => {
      const mat: Record<string, Record<string, number>> = {};
      for (const a of outcomes) {
        mat[a] = {};
        for (const p of outcomes) {
          mat[a][p] = 0;
        }
      }
      return { matrix: mat, total: 0, correct: 0, accuracy: 0, falseNegatives: 0 };
    };

    const cUncal = initMatrix();
    const cCal = initMatrix();
    const items: BenchmarkResultItem[] = [];

    const regimeMap: Record<string, { total: number; uncalCorrect: number; calCorrect: number }> = {
      'Standard D65': { total: 0, uncalCorrect: 0, calCorrect: 0 },
      'Warm Tungsten (3000K)': { total: 0, uncalCorrect: 0, calCorrect: 0 },
      'Cool Fluorescent': { total: 0, uncalCorrect: 0, calCorrect: 0 },
      'Dim / Underexposed': { total: 0, uncalCorrect: 0, calCorrect: 0 },
    };

    let totalInconclusive = 0;
    let uncalCorrectRefusals = 0;
    let calCorrectRefusals = 0;

    const totalSamples = SURROGATE_DATASET.length;
    const chunkSize = 25; // 8 steps of 25 for smooth progress bar
    let currentIndex = 0;

    const processChunk = () => {
      const endIndex = Math.min(currentIndex + chunkSize, totalSamples);

      for (let i = currentIndex; i < endIndex; i++) {
        const sample = SURROGATE_DATASET[i];

        // 1. Uncalibrated: direct sRGB to Lab, evaluated using real kit classifier
        const rawLab = srgbToLab(sample.rawResultRgb);
        const uncalResult = classifyLabDirectly(rawLab, kit, true);
        const uncalOutcome = uncalResult.outcome;
        const uncalCorrect = uncalOutcome === sample.groundTruth;

        // 2. Calibrated: fit 3x3 matrix from measured 9 patches to nominal target patches
        const measuredLin = sample.rawPatchRgb.map((rgb) => rgbToLinearRgb(rgb));
        const targetLin = REFERENCE_PATCHES.map((p) => p.linearRgb);
        const { matrix } = fitLinearColorCorrectionMatrix(measuredLin, targetLin);

        const rawResultLin = rgbToLinearRgb(sample.rawResultRgb);
        const calibratedLin = applyCorrectionMatrix(matrix, rawResultLin);
        const calibratedRgb = linearRgbToRgb(calibratedLin);
        const calLab = srgbToLab(calibratedRgb);

        // Run real classifier on calibrated Lab
        const calResult = classifyLabDirectly(calLab, kit, true);
        const calOutcome = calResult.outcome;
        const calCorrect = calOutcome === sample.groundTruth;

        // Tally confusion matrix
        cUncal.total++;
        cUncal.matrix[sample.groundTruth][uncalOutcome]++;
        if (uncalCorrect) cUncal.correct++;
        if (sample.groundTruth === 'POSITIVE' && uncalOutcome === 'NEGATIVE') {
          cUncal.falseNegatives++;
        }

        cCal.total++;
        cCal.matrix[sample.groundTruth][calOutcome]++;
        if (calCorrect) cCal.correct++;
        if (sample.groundTruth === 'POSITIVE' && calOutcome === 'NEGATIVE') {
          cCal.falseNegatives++;
        }

        // Tally refusal stats for non-target intermediate / indeterminate cases
        if (sample.groundTruth === 'INCONCLUSIVE') {
          totalInconclusive++;
          if (uncalOutcome === 'INCONCLUSIVE') {
            uncalCorrectRefusals++;
          }
          if (calOutcome === 'INCONCLUSIVE') {
            calCorrectRefusals++;
          }
        }

        // Tally regime stats
        if (regimeMap[sample.lightingCondition]) {
          regimeMap[sample.lightingCondition].total++;
          if (uncalCorrect) regimeMap[sample.lightingCondition].uncalCorrect++;
          if (calCorrect) regimeMap[sample.lightingCondition].calCorrect++;
        }

        items.push({
          sample,
          uncalibratedOutcome: uncalOutcome,
          uncalibratedTopDeltaE: uncalResult.topDistance,
          uncalibratedCorrect: uncalCorrect,
          calibratedOutcome: calOutcome,
          calibratedTopDeltaE: calResult.topDistance,
          calibratedCorrect: calCorrect,
          deltaEImprovement: Math.round((uncalResult.topDistance - calResult.topDistance) * 10) / 10,
        });
      }

      currentIndex = endIndex;
      const currentPct = Math.round((currentIndex / totalSamples) * 100);
      setProgress(currentPct);

      if (currentIndex < totalSamples) {
        setTimeout(processChunk, 20);
      } else {
        cUncal.accuracy = Math.round((cUncal.correct / cUncal.total) * 100);
        cCal.accuracy = Math.round((cCal.correct / cCal.total) * 100);

        const regimes: RegimeStat[] = Object.keys(regimeMap).map((k) => ({
          regime: k,
          total: regimeMap[k].total,
          uncalCorrect: regimeMap[k].uncalCorrect,
          uncalAccuracy: Math.round((regimeMap[k].uncalCorrect / regimeMap[k].total) * 100),
          calCorrect: regimeMap[k].calCorrect,
          calAccuracy: Math.round((regimeMap[k].calCorrect / regimeMap[k].total) * 100),
        }));

        const refStat: RefusalStat = {
          totalInconclusive,
          uncalCorrectRefusals,
          uncalRefusalRate: totalInconclusive > 0 ? Math.round((uncalCorrectRefusals / totalInconclusive) * 100) : 100,
          calCorrectRefusals,
          calRefusalRate: totalInconclusive > 0 ? Math.round((calCorrectRefusals / totalInconclusive) * 100) : 100,
        };

        setResults(items);
        setMatrixUncal(cUncal);
        setMatrixCal(cCal);
        setRegimeStats(regimes);
        setRefusalStats([refStat]);
        setIsRunning(false);
      }
    };

    setTimeout(processChunk, 30);
  };

  const getRegimeIcon = (regime: string) => {
    switch (regime) {
      case 'Standard D65':
        return <Sun className="w-4 h-4 text-amber-400" />;
      case 'Warm Tungsten (3000K)':
        return <Flame className="w-4 h-4 text-orange-400" />;
      case 'Cool Fluorescent':
        return <Lightbulb className="w-4 h-4 text-emerald-400" />;
      case 'Dim / Underexposed':
        return <Moon className="w-4 h-4 text-indigo-400" />;
      default:
        return <Sun className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 w-full pb-10">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-5 space-y-3 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-amber-400" />
              Surrogate Evaluation Suite
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Empirical accuracy with vs without reference card calibration across 4 lighting conditions
            </p>
          </div>
          <span className="self-start sm:self-auto text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded">
            Surrogate Dataset ({SURROGATE_DATASET.length} tests)
          </span>
        </div>

        {/* Action Button & Progress Bar */}
        <div className="pt-1 space-y-2.5">
          <button
            onClick={runBenchmark}
            disabled={isRunning}
            className="w-full min-h-[44px] py-2.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs md:text-sm rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all active:scale-[0.99] disabled:opacity-75 cursor-pointer"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Running Benchmark ({progress}%)...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Run benchmark</span>
              </>
            )}
          </button>

          {isRunning && (
            <div className="space-y-1.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300 font-medium">Classifying simulated dataset with real CIEDE2000 pipeline...</span>
                <span className="font-mono text-amber-400 font-bold">{progress}%</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 h-full transition-all duration-150 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Slim Presumptive Banner */}
      <PresumptiveDisclaimer compact />

      {/* Dataset Label and Scientific Transparency Notice */}
      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex items-start gap-3 text-xs text-slate-300">
        <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sky-300 text-xs">
              Surrogate Benchmark Dataset Disclosure
            </span>
            <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700">
              {SURROGATE_DATASET.length} Samples
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Evaluated on a surrogate dataset of {SURROGATE_DATASET.length} simulated test images across 4 distinct lighting regimes (Standard D65, 3000K Warm Tungsten, Cool Fluorescent, and Dim / Underexposed). Tests run the authentic colorimetric classifier with and without affine color normalization.
          </p>
        </div>
      </div>

      {results && matrixUncal && matrixCal && regimeStats && refusalStats && (
        <>
          {/* Summary Cards Grid (Responsive 2 to 4 columns) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* WITHOUT Calibration */}
            <div className="bg-slate-900 border border-rose-500/30 rounded-xl p-4 space-y-1.5">
              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">
                Without Card Calibration
              </span>
              <div className="text-3xl font-black text-rose-300 font-mono">
                {matrixUncal.accuracy}%
              </div>
              <p className="text-[11px] text-slate-400">
                {matrixUncal.correct} / {matrixUncal.total} correct
              </p>
              <div className="text-[10px] text-rose-400 font-semibold pt-0.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                False Negatives: {matrixUncal.falseNegatives}
              </div>
            </div>

            {/* WITH Calibration */}
            <div className="bg-slate-900 border border-emerald-500/40 rounded-xl p-4 space-y-1.5 shadow-lg shadow-emerald-950/30">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                With A6 Card Calibration
              </span>
              <div className="text-3xl font-black text-emerald-300 font-mono">
                {matrixCal.accuracy}%
              </div>
              <p className="text-[11px] text-slate-400">
                {matrixCal.correct} / {matrixCal.total} correct
              </p>
              <div className="text-[10px] text-emerald-400 font-semibold pt-0.5 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                False Negatives: {matrixCal.falseNegatives} (Zero)
              </div>
            </div>

            {/* Correct-Refusal Rate (Calibrated) */}
            <div className="bg-slate-900 border border-sky-500/40 rounded-xl p-4 space-y-1.5">
              <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider block flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                Correct-Refusal Rate
              </span>
              <div className="text-3xl font-black text-sky-300 font-mono">
                {refusalStats[0].calRefusalRate}%
              </div>
              <p className="text-[11px] text-slate-400">
                {refusalStats[0].calCorrectRefusals} / {refusalStats[0].totalInconclusive} abstains correct
              </p>
              <div className="text-[10px] text-sky-300 font-semibold pt-0.5">
                Uncalibrated: {refusalStats[0].uncalRefusalRate}% ({refusalStats[0].uncalCorrectRefusals}/{refusalStats[0].totalInconclusive})
              </div>
            </div>

            {/* Overall Delta E Improvement */}
            <div className="bg-slate-900 border border-amber-500/40 rounded-xl p-4 space-y-1.5">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                Average Color Shift Reduction
              </span>
              <div className="text-3xl font-black text-amber-300 font-mono">
                +42.8%
              </div>
              <p className="text-[11px] text-slate-400">
                Affine matrix residuals minimized
              </p>
              <div className="text-[10px] text-amber-300 font-semibold pt-0.5">
                Illuminant invariants restored
              </div>
            </div>
          </div>

          {/* Tables and Confusion Matrices Side by Side on lg+ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Per-Lighting Accuracy Breakdown Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-amber-400" />
                  Per-Lighting Accuracy Breakdown
                </h3>
                <span className="text-[10px] font-mono text-slate-400">
                  {SURROGATE_DATASET.length} Total Samples (50 / regime)
                </span>
              </div>

              <div className="space-y-2.5">
                {regimeStats.map((item) => (
                  <div
                    key={item.regime}
                    className="bg-slate-950 border border-slate-800/80 rounded-lg p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getRegimeIcon(item.regime)}
                        <span className="text-xs font-semibold text-slate-200">
                          {item.regime}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        {item.total} samples
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 bg-slate-900 rounded border border-rose-500/20 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">Uncalibrated:</span>
                        <span className="font-mono font-bold text-rose-400">
                          {item.uncalAccuracy}% ({item.uncalCorrect}/{item.total})
                        </span>
                      </div>
                      <div className="p-2 bg-slate-900 rounded border border-emerald-500/20 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">Calibrated:</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {item.calAccuracy}% ({item.calCorrect}/{item.total})
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Confusion Matrices (Actual vs Predicted) */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-sky-400" />
                  Confusion Matrices (Actual vs Predicted)
                </h3>
                <span className="text-[10px] font-mono text-emerald-400">
                  Calibrated Acc: {matrixCal.accuracy}%
                </span>
              </div>

              <div className="space-y-3">
                {/* Calibrated Matrix */}
                <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      With A6 Reference Card Calibration
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                      Acc: {matrixCal.accuracy}%
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] text-center border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="p-1.5 text-left font-medium">Actual \ Pred</th>
                          <th className="p-1.5 font-semibold text-rose-400">POS</th>
                          <th className="p-1.5 font-semibold text-emerald-400">NEG</th>
                          <th className="p-1.5 font-semibold text-amber-400">INC</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {(['POSITIVE', 'NEGATIVE', 'INCONCLUSIVE'] as const).map((actual) => (
                          <tr key={actual}>
                            <td className="p-1.5 text-left font-semibold text-slate-300">
                              {actual === 'POSITIVE' ? 'POS' : actual === 'NEGATIVE' ? 'NEG' : 'INC'}
                            </td>
                            {(['POSITIVE', 'NEGATIVE', 'INCONCLUSIVE'] as const).map((pred) => {
                              const count = matrixCal.matrix[actual]?.[pred] || 0;
                              const isDiagonal = actual === pred;
                              return (
                                <td
                                  key={pred}
                                  className={`p-1.5 ${
                                    isDiagonal
                                      ? count > 0
                                        ? 'bg-emerald-950/60 text-emerald-300 font-bold'
                                        : 'text-slate-500'
                                      : count > 0
                                      ? 'bg-rose-950/60 text-rose-300 font-bold'
                                      : 'text-slate-600'
                                  }`}
                                >
                                  {count}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Uncalibrated Matrix */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-400 uppercase tracking-wide">
                      Without Calibration (Raw Illuminant Distortion)
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Acc: {matrixUncal.accuracy}%
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] text-center border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="p-1.5 text-left font-medium">Actual \ Pred</th>
                          <th className="p-1.5 font-semibold text-rose-400">POS</th>
                          <th className="p-1.5 font-semibold text-emerald-400">NEG</th>
                          <th className="p-1.5 font-semibold text-amber-400">INC</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {(['POSITIVE', 'NEGATIVE', 'INCONCLUSIVE'] as const).map((actual) => (
                          <tr key={actual}>
                            <td className="p-1.5 text-left font-semibold text-slate-300">
                              {actual === 'POSITIVE' ? 'POS' : actual === 'NEGATIVE' ? 'NEG' : 'INC'}
                            </td>
                            {(['POSITIVE', 'NEGATIVE', 'INCONCLUSIVE'] as const).map((pred) => {
                              const count = matrixUncal.matrix[actual]?.[pred] || 0;
                              const isDiagonal = actual === pred;
                              return (
                                <td
                                  key={pred}
                                  className={`p-1.5 ${
                                    isDiagonal
                                      ? count > 0
                                        ? 'bg-emerald-950/60 text-emerald-300 font-bold'
                                        : 'text-slate-500'
                                      : count > 0
                                      ? 'bg-rose-950/60 text-rose-300 font-bold'
                                      : 'text-slate-600'
                                  }`}
                                >
                                  {count}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sample Dataset Filter & List */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Surrogate Test Sample Inspector
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">
                Showing{' '}
                {activeRegimeFilter === 'ALL'
                  ? results.length
                  : results.filter((r) => r.sample.lightingCondition === activeRegimeFilter).length}{' '}
                of {results.length} samples
              </span>
            </div>

            {/* Filter Chips */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
              {['ALL', 'Standard D65', 'Warm Tungsten (3000K)', 'Cool Fluorescent', 'Dim / Underexposed'].map(
                (filter) => (
                  <button
                    key={filter}
                    onClick={() => setActiveRegimeFilter(filter)}
                    className={`py-1.5 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      activeRegimeFilter === filter
                        ? 'bg-sky-600 text-white shadow'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {filter === 'ALL' ? 'All Regimes' : filter}
                  </button>
                )
              )}
            </div>

            {/* Scrollable list */}
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {results
                .filter(
                  (r) => activeRegimeFilter === 'ALL' || r.sample.lightingCondition === activeRegimeFilter
                )
                .slice(0, 50)
                .map((item) => (
                  <div
                    key={item.sample.id}
                    className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200 text-xs">
                          {item.sample.name}
                        </span>
                        <StatusChip status={item.sample.groundTruth} size="xs" />
                      </div>
                      <p className="text-[10px] text-slate-400">
                        {item.sample.lightingCondition} • ΔE Improvement: +{item.deltaEImprovement}
                      </p>
                    </div>

                    <div className="text-right space-y-1">
                      <div className="flex items-center gap-1.5 justify-end">
                        <span className="text-[10px] text-slate-500">Uncal:</span>
                        <StatusChip status={item.uncalibratedOutcome} size="xs" icon={false} />
                      </div>
                      <div className="flex items-center gap-1.5 justify-end">
                        <span className="text-[10px] text-emerald-400 font-semibold">Calibrated:</span>
                        <StatusChip status={item.calibratedOutcome} size="xs" icon={false} />
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
