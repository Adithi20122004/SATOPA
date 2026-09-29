import React, { useState, useRef } from 'react';
import {
  Camera,
  Zap,
  ZapOff,
  RefreshCw,
  ShieldAlert,
  Upload,
  Sparkles,
  Sun,
  Flame,
  Moon,
  Info,
  Layers,
} from 'lucide-react';
import { useCamera } from '../hooks/useCamera';
import { PresumptiveDisclaimer } from './PresumptiveDisclaimer';
import type { KitProfile, CapturedFrame } from '../types';
import { generateDemoCapturedFrame, type DemoCardType } from '../data/demoCardGenerator';

interface CameraCaptureViewProps {
  activeKit: KitProfile;
  onFrameCaptured: (frame: CapturedFrame) => void;
  operatorId: string;
}

interface SampleOption {
  type: DemoCardType;
  title: string;
  lighting: string;
  description: string;
  badge: string;
  badgeColor: string;
  icon: React.ReactNode;
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

  const samplePhotos: SampleOption[] = [
    {
      type: 'clean_negative',
      title: 'Clean Negative',
      lighting: 'Standard D65 Daylight',
      description: 'Unreacted pale straw reagent blank with intact A6 reference card',
      badge: 'NEGATIVE',
      badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
      icon: <Sun className="w-4 h-4 text-sky-400" />,
    },
    {
      type: 'clean_positive',
      title: 'Clean Positive',
      lighting: 'Standard D65 Daylight',
      description: 'Opioid/alkaloid deep violet purple reaction with intact A6 reference card',
      badge: 'POSITIVE',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      icon: <Sun className="w-4 h-4 text-emerald-400" />,
    },
    {
      type: 'tungsten',
      title: 'Tungsten Lighting',
      lighting: 'Warm 3000K Incandescent',
      description: 'Color-shifted yellow-orange chromatic cast; corrected by 9-patch affine matrix',
      badge: 'POSITIVE (SHIFTED)',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      icon: <Flame className="w-4 h-4 text-amber-400" />,
    },
    {
      type: 'low_light',
      title: 'Low Light / Dim',
      lighting: 'Dim Twilight / Underexposed',
      description: 'Low-lux sensor attenuation; tests exposure gate and illuminant recovery',
      badge: 'DIM LIGHT',
      badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
      icon: <Moon className="w-4 h-4 text-indigo-400" />,
    },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-950 relative select-none w-full">
      {/* Hidden file input for gallery upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Top Status Bar */}
      <div className="z-20 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 py-2.5 flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-slate-200">{activeKit.name}</span>
          <span className="text-slate-400 text-[10px] bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
            Lot: {activeKit.lotNumber}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDemoSelector(true)}
            className="min-h-[32px] px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-600/40 text-emerald-300 hover:bg-emerald-900/60 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Choose from sample dataset photos (no camera needed)"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Sample photos</span>
          </button>
          <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
            Target: {activeKit.targetSubstance}
          </span>
        </div>
      </div>

      {/* Main Container - 2 columns on lg+ */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden relative">
        {/* Left Column (or full mobile): Viewfinder */}
        <div className="lg:col-span-8 relative bg-black flex items-center justify-center overflow-hidden min-h-[360px] lg:min-h-full">
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
                  className="min-h-[44px] flex-1 py-2 px-3 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 shadow cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Retry Camera</span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[44px] flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-sky-400" />
                  <span>Upload Photo</span>
                </button>
              </div>

              <div className="pt-2 border-t border-slate-800 w-full max-w-xs text-center">
                <button
                  onClick={() => setShowDemoSelector(true)}
                  className="min-h-[44px] w-full py-2 px-3 text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-600/40 rounded-lg hover:bg-emerald-900/40 font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Load Sample Photos (No camera needed)</span>
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
                className={`w-11 h-11 rounded-full backdrop-blur border flex items-center justify-center transition-all cursor-pointer ${
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
              className="w-11 h-11 rounded-full bg-slate-900/80 text-slate-200 border border-slate-700 backdrop-blur flex items-center justify-center cursor-pointer"
              title="Switch Camera (Front/Rear)"
            >
              <RefreshCw className="w-5 h-5" />
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-11 h-11 rounded-full bg-slate-900/80 text-sky-400 border border-slate-700 backdrop-blur flex items-center justify-center cursor-pointer"
              title="Upload Photo from Gallery"
            >
              <Upload className="w-5 h-5" />
            </button>

            <button
              onClick={() => setShowDemoSelector(true)}
              className="w-11 h-11 rounded-full bg-emerald-950/90 text-emerald-400 border border-emerald-600 backdrop-blur flex items-center justify-center shadow-lg cursor-pointer"
              title="Open Sample Photos Picker"
            >
              <Sparkles className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Right Column on lg+: Information, Quality Instructions, & Sample Photos Panel */}
        <div className="hidden lg:flex lg:col-span-4 bg-slate-900/95 border-l border-slate-800 p-5 flex-col justify-between overflow-y-auto space-y-4">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-sky-400" />
                Active Test Protocol
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Align reagent window inside the A6 fiducial boundary
              </p>
            </div>

            {/* Kit Spec Card */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Reagent:</span>
                <span className="font-semibold text-slate-200">{activeKit.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Target Drug:</span>
                <span className="text-slate-200">{activeKit.targetSubstance}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Time Window:</span>
                <span className="font-mono text-slate-300">
                  {activeKit.readingTimeWindowSeconds.min}s – {activeKit.readingTimeWindowSeconds.max}s
                </span>
              </div>
            </div>

            {/* Embedded Sample Photos Picker */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  Dataset Sample Photos
                </span>
                <span className="text-[10px] text-slate-400 font-mono">No camera needed</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Click any calibrated frame below to run a complete verification demo:
              </p>

              <div className="space-y-2">
                {samplePhotos.map((photo) => (
                  <button
                    key={photo.type}
                    onClick={() => handleLoadDemoCard(photo.type)}
                    className="w-full text-left p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-emerald-500/60 transition-all flex items-start justify-between gap-2 cursor-pointer group"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        {photo.icon}
                        <span className="text-xs font-semibold text-slate-200 group-hover:text-emerald-300">
                          {photo.title}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">{photo.lighting}</p>
                    </div>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${photo.badgeColor} shrink-0`}>
                      {photo.badge}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>Presumptive test records are hashed and signed locally using WebCrypto ECDSA.</span>
          </div>
        </div>
      </div>

      {/* Demo Card Preset Selector Modal (Mobile & Tablet) */}
      {showDemoSelector && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Select Sample Photo (Dataset Fixtures)
              </h4>
              <button
                onClick={() => setShowDemoSelector(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Run the full computer vision and colorimetric classification pipeline without needing a physical camera or paper reference card:
            </p>

            <div className="space-y-2 pt-1 max-h-[60vh] overflow-y-auto pr-1">
              {samplePhotos.map((photo) => (
                <button
                  key={photo.type}
                  onClick={() => handleLoadDemoCard(photo.type)}
                  className="w-full text-left p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/60 transition-all flex items-start justify-between gap-3 cursor-pointer"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      {photo.icon}
                      <span className="text-xs font-semibold text-slate-200">{photo.title}</span>
                    </div>
                    <p className="text-[11px] text-slate-400">{photo.description}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${photo.badgeColor} shrink-0`}>
                    {photo.badge}
                  </span>
                </button>
              ))}

              {/* Edge Case Tests */}
              <div className="pt-2 border-t border-slate-800/80">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
                  Quality Gate Edge Case Tests
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleLoadDemoCard('glare_artifact')}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-amber-500/60 text-left cursor-pointer"
                  >
                    <span className="text-[11px] font-semibold text-amber-300 block">Specular Glare</span>
                    <span className="text-[9px] text-slate-500">Reflective hotspot test</span>
                  </button>

                  <button
                    onClick={() => handleLoadDemoCard('blank_wall')}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-rose-500/60 text-left cursor-pointer"
                  >
                    <span className="text-[11px] font-semibold text-rose-300 block">Blank Surface / Wall</span>
                    <span className="text-[9px] text-slate-500">No card / markers</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Shutter & Info Section */}
      <div className="z-20 bg-slate-900/95 border-t border-slate-800 p-4 space-y-3 shrink-0">
        <PresumptiveDisclaimer compact />

        <div className="flex items-center justify-between pt-1">
          <div className="text-left">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Operator</span>
            <span className="text-xs font-mono font-medium text-slate-200">{operatorId}</span>
          </div>

          {/* Shutter Button with >= 44px hit target */}
          <div className="relative">
            <button
              onClick={handleCaptureClick}
              disabled={!isActive || isCapturing}
              className={`w-18 h-18 p-1.5 rounded-full border-4 border-slate-700 bg-slate-800 flex items-center justify-center transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                isCapturing ? 'animate-pulse' : ''
              }`}
              title="Capture Photo"
            >
              <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-sky-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-sky-500/20">
                <Camera className="w-7 h-7 text-slate-950" />
              </div>
            </button>
          </div>

          <div className="text-right flex flex-col items-end gap-1">
            <button
              onClick={() => setShowDemoSelector(true)}
              className="min-h-[36px] px-2.5 py-1 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-950/40 border border-emerald-700/50 rounded-lg font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Sample photos</span>
            </button>
            <span className="text-[10px] text-slate-400 font-mono">
              {isActive ? 'Sensor Active' : 'Demo Ready'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
