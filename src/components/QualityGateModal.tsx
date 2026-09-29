import React, { useEffect, useRef } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  RotateCcw,
  ArrowRight,
  Maximize2,
  CheckCircle2,
  XCircle,
  Eye
} from 'lucide-react';
import type { QualityGateResult, CapturedFrame } from '../types';
import type { CardDetectionResult } from '../vision/cardDetector';
import { PresumptiveDisclaimer } from './PresumptiveDisclaimer';

interface QualityGateModalProps {
  frame?: CapturedFrame;
  quality: QualityGateResult;
  cardResult: CardDetectionResult | null;
  onRetake: () => void;
  onProceed: () => void;
}

export const QualityGateModal: React.FC<QualityGateModalProps> = ({
  quality,
  cardResult,
  onRetake,
  onProceed,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Render warped card to canvas
  useEffect(() => {
    if (cardResult?.warpedCardImageData && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = cardResult.warpedCardImageData.width;
      canvas.height = cardResult.warpedCardImageData.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.putImageData(cardResult.warpedCardImageData, 0, 0);
      }
    }
  }, [cardResult]);

  // Render cropped result window
  useEffect(() => {
    if (cardResult?.resultRegion?.croppedImageData && cropCanvasRef.current) {
      const canvas = cropCanvasRef.current;
      canvas.width = cardResult.resultRegion.croppedImageData.width;
      canvas.height = cardResult.resultRegion.croppedImageData.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.putImageData(cardResult.resultRegion.croppedImageData, 0, 0);
      }
    }
  }, [cardResult]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-[420px] max-h-[92vh] bg-slate-950 border border-slate-800 rounded-2xl flex flex-col justify-between p-4 overflow-y-auto shadow-2xl">
      {/* Header Banner */}
      <div className="shrink-0 flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          {quality.allPassed ? (
            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
          ) : (
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <ShieldAlert className="w-5 h-5" />
            </div>
          )}
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              {quality.allPassed ? 'Quality Gates Verified' : 'Quality Check Advisory'}
            </h3>
            <p className="text-[10px] text-slate-400">
              ISO/IEC Field Vision Calibration Protocol
            </p>
          </div>
        </div>

        <button
          onClick={onRetake}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 font-medium"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Retake
        </button>
      </div>

      {/* Recapture Action Instructions (if failed) */}
      {!quality.allPassed && (
        <div className="my-3 p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-300">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            Recapture Required for Evidentiary Standard
          </div>
          <ul className="space-y-1 pl-5 list-disc text-[11px] text-rose-200/90 leading-tight">
            {quality.instructions.map((inst, i) => (
              <li key={i}>{inst}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Quality Gate Checklist */}
      <div className="my-2 bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2 text-xs">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
          Automated Quality Verification
        </span>

        {/* 1. Card Detection */}
        <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            {quality.cardDetected ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-400" />
            )}
            <span className="text-slate-200">A6 Reference Card</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {quality.cardDetected ? '4/4 Markers Locked' : 'Not Locked'}
          </span>
        </div>

        {/* 2. Blur / Sharpness */}
        <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            {quality.blurPassed ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-400" />
            )}
            <span className="text-slate-200">Sharpness (Laplacian Var)</span>
          </div>
          <span className={`text-[11px] font-mono ${quality.blurPassed ? 'text-emerald-400' : 'text-rose-400'}`}>
            {quality.blurScore} / {quality.blurThreshold} min
          </span>
        </div>

        {/* 3. Tilt / Skew */}
        <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            {quality.tiltPassed ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-400" />
            )}
            <span className="text-slate-200">Camera Tilt Angle</span>
          </div>
          <span className={`text-[11px] font-mono ${quality.tiltPassed ? 'text-emerald-400' : 'text-rose-400'}`}>
            {quality.tiltAngleDeg}° (≤ 20°)
          </span>
        </div>

        {/* 4. Exposure Level */}
        <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            {quality.exposurePassed ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-400" />
            )}
            <span className="text-slate-200">Exposure Level (Luma)</span>
          </div>
          <span className={`text-[11px] font-mono ${quality.exposurePassed ? 'text-emerald-400' : 'text-rose-400'}`}>
            {quality.exposureScore} / 255 (35-230 range)
          </span>
        </div>

        {/* 5. Glare / Saturation */}
        <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            {quality.glarePassed ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-400" />
            )}
            <span className="text-slate-200">Specular Glare Clipping</span>
          </div>
          <span className={`text-[11px] font-mono ${quality.glarePassed ? 'text-emerald-400' : 'text-rose-400'}`}>
            {quality.glarePercent}% (≤ 4%)
          </span>
        </div>

        {/* 6. Illumination Uniformity */}
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2">
            {quality.evenLightingPassed ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-400" />
            )}
            <span className="text-slate-200">Illumination Uniformity</span>
          </div>
          <span className={`text-[11px] font-mono ${quality.evenLightingPassed ? 'text-emerald-400' : 'text-rose-400'}`}>
            {quality.lightingVariance}% variance
          </span>
        </div>
      </div>

      {/* Visual Extraction Previews */}
      <div className="grid grid-cols-2 gap-3 my-2">
        {/* Perspective Corrected Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 flex flex-col items-center">
          <span className="text-[10px] text-slate-400 font-medium mb-1.5 self-start flex items-center gap-1">
            <Maximize2 className="w-3 h-3 text-sky-400" />
            Perspective Warped Card
          </span>
          <div className="w-full aspect-[1/1.41] bg-black rounded overflow-hidden flex items-center justify-center border border-slate-800">
            <canvas ref={canvasRef} className="w-full h-full object-contain" />
          </div>
        </div>

        {/* Result Window Zoom + Median Color */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 flex flex-col justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-medium mb-1.5 flex items-center gap-1">
              <Eye className="w-3 h-3 text-amber-400" />
              Result ROI Sample
            </span>
            <div className="w-full aspect-square bg-black rounded overflow-hidden flex items-center justify-center border border-slate-800">
              <canvas ref={cropCanvasRef} className="w-full h-full object-contain" />
            </div>
          </div>

          {cardResult?.resultRegion && (
            <div className="mt-2 pt-2 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <div
                  className="w-5 h-5 rounded-md border border-white/20 shrink-0 shadow-inner"
                  style={{
                    backgroundColor: `rgb(${cardResult.resultRegion.medianRgb.join(',')})`,
                  }}
                />
                <div className="text-[10px] font-mono leading-none">
                  <span className="text-slate-400 block">Median RGB:</span>
                  <span className="text-slate-200">
                    [{cardResult.resultRegion.medianRgb.join(', ')}]
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Extracted 9 Calibration Patches Matrix */}
      {cardResult?.extractedPatches && cardResult.extractedPatches.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 my-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-2">
            9 Calibrated Color Swatches (Sampled vs Reference)
          </span>
          <div className="grid grid-cols-9 gap-1.5">
            {cardResult.extractedPatches.map((p) => (
              <div key={p.id} className="flex flex-col items-center gap-1">
                <div
                  className="w-full aspect-square rounded border border-white/20 shadow-sm"
                  style={{ backgroundColor: `rgb(${p.measuredRgb.join(',')})` }}
                  title={`${p.name}: RGB(${p.measuredRgb.join(',')})`}
                />
                <span className="text-[8px] font-mono text-slate-400 truncate w-full text-center">
                  {p.name.slice(0, 3)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Actions & Presumptive Disclaimer */}
      <div className="shrink-0 space-y-2.5 pt-2">
        <PresumptiveDisclaimer compact />

        <div className="flex gap-2">
          <button
            onClick={onRetake}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Retake Photo
          </button>

          <button
            onClick={onProceed}
            className={`flex-1 py-2.5 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 shadow-lg ${
              quality.allPassed
                ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                : 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30'
            }`}
          >
            <span>{quality.allPassed ? 'Proceed to Analysis' : 'Proceed (Yields INCONCLUSIVE)'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  </div>
  );
};
