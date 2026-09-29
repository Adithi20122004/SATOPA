import React, { useState, useRef } from 'react';
import { Camera, Zap, ZapOff, RefreshCw, ShieldAlert, Upload, Sparkles } from 'lucide-react';
import { useCamera } from '../hooks/useCamera';
import { PresumptiveDisclaimer } from './PresumptiveDisclaimer';
import type { KitProfile, CapturedFrame } from '../types';
import { generateDemoCapturedFrame, type DemoCardType } from '../data/demoCardGenerator';

interface CameraCaptureViewProps {
  activeKit: KitProfile;
  onFrameCaptured: (frame: CapturedFrame) => void;
  operatorId: string;
}

export const CameraCaptureView: React.FC<CameraCaptureViewProps> = ({
  activeKit,
  onFrameCaptured,
  operatorId,
}) => {
  const {
    videoRef,
    isActive,
    isLoading,
    error: cameraError,
    errorType,
    hasTorch,
    torchOn,
    startCamera,
    toggleTorch,
    switchCamera,
    captureFrame,
    loadFrameFromImageFile,
  } = useCamera();

  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [showDemoSelector, setShowDemoSelector] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleCaptureClick = async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    try {
      const frame = await captureFrame();
      if (frame) {
        onFrameCaptured(frame);
      }
    } catch (e) {
      console.error('Capture failed:', e);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsCapturing(true);
      const frame = await loadFrameFromImageFile(file);
      onFrameCaptured(frame);
    } catch (err) {
      console.error('Failed to parse uploaded photo:', err);
    } finally {
      setIsCapturing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleLoadDemoCard = (type: DemoCardType) => {
    setIsCapturing(true);
    try {
      const frame = generateDemoCapturedFrame(type);
      onFrameCaptured(frame);
    } finally {
      setIsCapturing(false);
      setShowDemoSelector(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 relative overflow-hidden select-none">
      {/* Hidden file input for gallery upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Top Status Bar */}
      <div className="z-20 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 py-2 flex items-center justify-between text-xs">
        {/* Kit Info */}
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-slate-200">{activeKit.name}</span>
          <span className="text-slate-400 text-[10px] bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
            Lot: {activeKit.lotNumber}
          </span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono">
          Target: {activeKit.targetSubstance}
        </span>
      </div>

      {/* Main Viewfinder Canvas / Video */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        {isLoading && !cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 z-10">
            <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
            <p className="text-sm text-slate-300">Initializing camera feed...</p>
            <p className="text-[11px] text-slate-500">Detecting rear sensor and video stream...</p>
          </div>
        )}

        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950 z-20 space-y-4">
            <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-rose-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-rose-300">
                {errorType === 'permission_denied'
                  ? 'Camera Permission Denied'
                  : errorType === 'not_found'
                  ? 'No Camera Found'
                  : errorType === 'in_use'
                  ? 'Camera In Use'
                  : 'Camera Feed Unavailable'}
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">{cameraError}</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2 w-full max-w-xs">
              <button
                onClick={() => startCamera()}
                className="flex-1 py-2 px-3 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 shadow"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry Camera
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5 text-sky-400" />
                Upload Photo
              </button>
            </div>

            <div className="pt-2 border-t border-slate-800 w-full max-w-xs text-center">
              <button
                onClick={() => setShowDemoSelector(true)}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center justify-center gap-1 mx-auto"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Or Load Demo Test Card (1-Click)
              </button>
            </div>
          </div>
        )}

        {/* Live Video Element */}
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* A6 Target Guide Overlay */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
          <div className="relative w-full max-w-xs aspect-[1/1.414] border-2 border-sky-400/50 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
            {/* Corner Bracket Accents */}
            <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-sky-400 rounded-tl" />
            <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-sky-400 rounded-tr" />
            <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-sky-400 rounded-bl" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-sky-400 rounded-br" />

            {/* Target Window for Test Strip / Kit */}
            <div className="absolute top-[28%] left-[20%] right-[20%] bottom-[32%] border border-dashed border-amber-400/80 rounded-lg flex flex-col items-center justify-center bg-amber-400/5">
              <span className="text-[10px] font-mono tracking-wider text-amber-300 uppercase px-1.5 py-0.5 bg-black/60 rounded">
                Test Result Area
              </span>
              <div className="w-8 h-8 border border-amber-400/40 rounded-full mt-2 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              </div>
            </div>

            {/* Marker Corner Labels */}
            <span className="absolute top-2 left-2 text-[9px] font-mono text-sky-300/80">#0 TL</span>
            <span className="absolute top-2 right-2 text-[9px] font-mono text-sky-300/80">#1 TR</span>
            <span className="absolute bottom-2 right-2 text-[9px] font-mono text-sky-300/80">#2 BR</span>
            <span className="absolute bottom-2 left-2 text-[9px] font-mono text-sky-300/80">#3 BL</span>

            <div className="absolute bottom-3 left-0 right-0 text-center">
              <span className="text-[10px] text-sky-200/90 bg-black/60 px-2 py-0.5 rounded-full font-medium">
                Align A6 Reference Card in Box
              </span>
            </div>
          </div>
        </div>

        {/* Viewfinder Controls on Right */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-20">
          {hasTorch && (
            <button
              onClick={toggleTorch}
              className={`p-3 rounded-full backdrop-blur border transition-all ${
                torchOn
                  ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-lg shadow-amber-400/30'
                  : 'bg-slate-900/80 text-slate-200 border-slate-700'
              }`}
              title="Toggle Flashlight"
            >
              {torchOn ? <Zap className="w-5 h-5 fill-current" /> : <ZapOff className="w-5 h-5" />}
            </button>
          )}

          <button
            onClick={switchCamera}
            className="p-3 rounded-full bg-slate-900/80 text-slate-200 border border-slate-700 backdrop-blur"
            title="Switch Camera (Front/Rear)"
          >
            <RefreshCw className="w-5 h-5" />
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-3 rounded-full bg-slate-900/80 text-sky-400 border border-slate-700 backdrop-blur"
            title="Upload Photo from Gallery"
          >
            <Upload className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowDemoSelector(true)}
            className="p-3 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-700 backdrop-blur"
            title="Load Demo Sample Card"
          >
            <Sparkles className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Demo Card Preset Selector Modal */}
      {showDemoSelector && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-30 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 max-w-sm w-full space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Select Demo Sample (Real Pixels)
              </h4>
              <button
                onClick={() => setShowDemoSelector(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Generates a calibrated pixel frame for testing vision quality gates, CIEDE2000 classification, and signing.
            </p>
            <div className="space-y-1.5 pt-1">
              <button
                onClick={() => handleLoadDemoCard('positive_marquis')}
                className="w-full text-left p-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-emerald-500/60 transition-all flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-semibold text-emerald-300">1. Authentic Positive Card</div>
                  <div className="text-[10px] text-slate-400">Marquis reagent reacting purple with intact card</div>
                </div>
                <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold">
                  POSITIVE
                </span>
              </button>

              <button
                onClick={() => handleLoadDemoCard('negative_marquis')}
                className="w-full text-left p-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-sky-500/60 transition-all flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-semibold text-sky-300">2. Authentic Negative Card</div>
                  <div className="text-[10px] text-slate-400">Unreacted clear/straw reagent with intact card</div>
                </div>
                <span className="text-[9px] bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded font-bold">
                  NEGATIVE
                </span>
              </button>

              <button
                onClick={() => handleLoadDemoCard('glare_artifact')}
                className="w-full text-left p-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-amber-500/60 transition-all flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-semibold text-amber-300">3. Specular Glare Test</div>
                  <div className="text-[10px] text-slate-400">Reaction obscured by harsh specular reflection</div>
                </div>
                <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold">
                  GLARE GATE
                </span>
              </button>

              <button
                onClick={() => handleLoadDemoCard('blank_wall')}
                className="w-full text-left p-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-rose-500/60 transition-all flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-semibold text-rose-300">4. Blank Surface / Wall Test</div>
                  <div className="text-[10px] text-slate-400">No reference card or ArUco markers in view</div>
                </div>
                <span className="text-[9px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded font-bold">
                  INCONCLUSIVE
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Shutter & Info Section */}
      <div className="z-20 bg-slate-900/95 border-t border-slate-800 p-4 space-y-3">
        {/* Presumptive Disclaimer (always present) */}
        <PresumptiveDisclaimer compact />

        {/* Operator Badge + Shutter Button */}
        <div className="flex items-center justify-between pt-1">
          <div className="text-left">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Operator</span>
            <span className="text-xs font-mono font-medium text-slate-200">{operatorId}</span>
          </div>

          {/* Shutter Button */}
          <div className="relative">
            <button
              onClick={handleCaptureClick}
              disabled={!isActive || isCapturing}
              className={`w-18 h-18 p-1.5 rounded-full border-4 border-slate-700 bg-slate-800 flex items-center justify-center transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                isCapturing ? 'animate-pulse' : ''
              }`}
            >
              <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-sky-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-sky-500/20">
                <Camera className="w-7 h-7 text-slate-950" />
              </div>
            </button>
          </div>

          <div className="text-right">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-[10px] text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 justify-end"
            >
              <Upload className="w-3 h-3" />
              Upload Image
            </button>
            <span className="text-[10px] text-slate-400 font-mono">
              {isActive ? 'Rear / Webcam Active' : 'Gallery Ready'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

