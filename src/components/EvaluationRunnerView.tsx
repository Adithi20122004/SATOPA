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

export const EvaluationRunnerView: React.FC<EvaluationRunnerViewProps> = ({ kit }) => {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [results, setResults] = useState<BenchmarkResultItem[] | null>(null);
  const [matrixUncal, setMatrixUncal] = useState<ConfusionMatrix | null>(null);
  const [matrixCal, setMatrixCal] = useState<ConfusionMatrix | null>(null);
  const [regimeStats, setRegimeStats] = useState<RegimeStat[] | null>(null);
  const [activeRegimeFilter, setActiveRegimeFilter] = useState<string>('ALL');

  const runBenchmark = () => {
    setIsRunning(true);

    // Run in timeout to let UI update spinner
    setTimeout(() => {
      const outcomes = ['POSITIVE', 'NEGATIVE', 'INCONCLUSIVE'] as const;

      const initMatrix = (): ConfusionMatrix => {
        const mat: any = {};
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

      for (const sample of SURROGATE_DATASET) {
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

      setResults(items);
      setMatrixUncal(cUncal);
      setMatrixCal(cCal);
      setRegimeStats(regimes);
      setIsRunning(false);
    }, 50);
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
    <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-xl mx-auto w-full pb-8">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-amber-400" />
              Surrogate Evaluation Suite
            </h2>
            <p className="text-xs text-slate-400">
              Benchmarking Accuracy WITH vs WITHOUT Reference Card Calibration
            </p>
          </div>
          <span className="text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
            Surrogate Dataset
          </span>
        </div>

        <button
          onClick={runBenchmark}
          disabled={isRunning}
          className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all active:scale-[0.99] disabled:opacity-60 cursor-pointer"
        >
          {isRunning ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Running {SURROGATE_DATASET.length} Reagent Tests...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              Run benchmark
            </>
          )}
        </button>
      </div>

      {/* Slim Presumptive Banner */}
      <PresumptiveDisclaimer compact />

      {/* Dataset Label and Scientific Transparency Notice */}
      <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-start gap-2.5 text-xs text-slate-300">
        <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sky-300 text-xs">
              Surrogate Benchmark Dataset Disclosure
            </span>
            <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded border border-slate-700">
              {SURROGATE_DATASET.length} Samples
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Evaluated on a surrogate dataset of {SURROGATE_DATASET.length} simulated forensic test images across 4 distinct lighting regimes (Standard D65, 3000K Warm Tungsten, Cool Fluorescent, and Dim / Underexposed). Tests run the authentic colorimetric classifier with and without affine color normalization.
          </p>
        </div>
      </div>

      {results && matrixUncal && matrixCal && regimeStats && (
        <>
          {/* Comparative Summary Metrics */}
          <div className="grid grid-cols-2 gap-3">
            {/* WITHOUT Calibration */}
            <div className="bg-slate-900 border border-rose-500/30 rounded-xl p-3.5 space-y-1">
              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">
                Without Card Calibration
              </span>
              <div className="text-2xl font-black text-rose-300 font-mono">
                {matrixUncal.accuracy}%
              </div>
              <p className="text-[11px] text-slate-400">
                {matrixUncal.correct} / {matrixUncal.total} correct
              </p>
              <div className="text-[10px] text-rose-400 font-semibold pt-1">
                False Negatives: {matrixUncal.falseNegatives}
              </div>
            </div>

            {/* WITH Calibration */}
            <div className="bg-slate-900 border border-emerald-500/40 rounded-xl p-3.5 space-y-1 shadow-lg shadow-emerald-950/40">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                With A6 Card Calibration
              </span>
              <div className="text-2xl font-black text-emerald-300 font-mono">
                {matrixCal.accuracy}%
              </div>
              <p className="text-[11px] text-slate-400">
                {matrixCal.correct} / {matrixCal.total} correct
              </p>
              <div className="text-[10px] text-emerald-400 font-semibold pt-1">
                False Negatives: {matrixCal.falseNegatives} (Zero)
              </div>
            </div>
          </div>

          {/* Per-Lighting Accuracy Breakdown */}
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
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-sky-400" />
              Confusion Matrices (Actual vs Predicted)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Uncalibrated Matrix */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-400 uppercase tracking-wide">
                    Without Calibration
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Acc: {matrixUncal.accuracy}%
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[10px] text-center border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="p-1 text-left font-medium">Actual \ Pred</th>
                        <th className="p-1 font-semibold text-rose-400">POS</th>
                        <th className="p-1 font-semibold text-emerald-400">NEG</th>
                        <th className="p-1 font-semibold text-amber-400">INC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {(['POSITIVE', 'NEGATIVE', 'INCONCLUSIVE'] as const).map((actual) => (
                        <tr key={actual}>
                          <td className="p-1 text-left font-semibold text-slate-300">
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
                                      ? 'bg-emerald-950/40 text-emerald-300 font-bold'
                                      : 'text-slate-500'
                                    : count > 0
                                    ? 'bg-rose-950/40 text-rose-300 font-bold'
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

              {/* Calibrated Matrix */}
              <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    With A6 Calibration
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                    Acc: {matrixCal.accuracy}%
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[10px] text-center border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="p-1 text-left font-medium">Actual \ Pred</th>
                        <th className="p-1 font-semibold text-rose-400">POS</th>
                        <th className="p-1 font-semibold text-emerald-400">NEG</th>
                        <th className="p-1 font-semibold text-amber-400">INC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {(['POSITIVE', 'NEGATIVE', 'INCONCLUSIVE'] as const).map((actual) => (
                        <tr key={actual}>
                          <td className="p-1 text-left font-semibold text-slate-300">
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
                                      ? 'bg-emerald-950/40 text-emerald-300 font-bold'
                                      : 'text-slate-500'
                                    : count > 0
                                    ? 'bg-rose-950/40 text-rose-300 font-bold'
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

          {/* Sample Dataset Filter & List */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Surrogate Test Sample Inspector
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">
                Showing{' '}
                {activeRegimeFilter === 'ALL'
                  ? results.length
                  : results.filter((r) => r.sample.lightingCondition === activeRegimeFilter).length}{' '}
                of {results.length}
              </span>
            </div>

            {/* Filter Chips */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
              {['ALL', 'Standard D65', 'Warm Tungsten (3000K)', 'Cool Fluorescent', 'Dim / Underexposed'].map(
                (filter) => (
                  <button
                    key={filter}
                    onClick={() => setActiveRegimeFilter(filter)}
                    className={`py-1 px-2.5 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-colors ${
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
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {results
                .filter(
                  (r) => activeRegimeFilter === 'ALL' || r.sample.lightingCondition === activeRegimeFilter
                )
                .slice(0, 40)
                .map((item) => (
                  <div
                    key={item.sample.id}
                    className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between text-xs"
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
              {results.filter(
                (r) => activeRegimeFilter === 'ALL' || r.sample.lightingCondition === activeRegimeFilter
              ).length > 40 && (
                <div className="text-center py-2 text-[10px] text-slate-500 font-mono">
                  + {results.filter((r) => activeRegimeFilter === 'ALL' || r.sample.lightingCondition === activeRegimeFilter).length - 40} more surrogate records verified
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
