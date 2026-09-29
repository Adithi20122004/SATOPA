import React, { useState } from 'react';
import { Camera, Zap, ZapOff, RefreshCw, MapPin, ShieldAlert } from 'lucide-react';
import { useCamera } from '../hooks/useCamera';
import { useGeolocation } from '../hooks/useGeolocation';
import { PresumptiveDisclaimer } from './PresumptiveDisclaimer';
import type { KitProfile, CapturedFrame } from '../types';

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
    hasTorch,
    torchOn,
    startCamera,
    toggleTorch,
    switchCamera,
    captureFrame,
  } = useCamera();

  const { coords, isLocating } = useGeolocation();
  const [isCapturing, setIsCapturing] = useState<boolean>(false);

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

  return (
    <div className="flex flex-col h-full bg-slate-950 relative overflow-hidden select-none">
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

        {/* GPS Pill */}
        <div className="flex items-center gap-1.5">
          <MapPin className={`w-3.5 h-3.5 ${
            coords && !coords.isLowAccuracy ? 'text-emerald-400' : coords?.isLowAccuracy ? 'text-amber-400' : 'text-rose-400'
          }`} />
          {coords ? (
            <span className={`text-[11px] font-mono ${coords.isLowAccuracy ? 'text-amber-300' : 'text-emerald-300'}`}>
              ±{coords.accuracy}m {coords.isLowAccuracy && '(Low)'}
            </span>
          ) : isLocating ? (
            <span className="text-[11px] text-slate-400 animate-pulse">Acquiring GPS...</span>
          ) : (
            <span className="text-[11px] text-rose-400">No GPS</span>
          )}
        </div>
      </div>

      {/* Main Viewfinder Canvas / Video */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 z-10">
            <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
            <p className="text-sm text-slate-300">Initializing camera feed...</p>
          </div>
        )}

        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950 z-20">
            <ShieldAlert className="w-12 h-12 text-rose-500 mb-3" />
            <h3 className="text-base font-bold text-rose-400 mb-1">Camera Access Required</h3>
            <p className="text-xs text-slate-300 max-w-sm mb-4 leading-relaxed">{cameraError}</p>
            <button
              onClick={() => startCamera()}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry Camera
            </button>
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
            title="Switch Camera"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Bottom Shutter & Info Section */}
      <div className="z-20 bg-slate-900/95 border-t border-slate-800 p-4 space-y-3">
        {/* Presumptive Disclaimer (always present) */}
        <PresumptiveDisclaimer compact />

        {/* Operator Badge + Shutter Button */}
        <div className="flex items-center justify-between pt-1">
          <div className="text-left">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Field Officer</span>
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
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Mode</span>
            <span className="text-xs font-mono font-medium text-emerald-400">Live Vision</span>
          </div>
        </div>
      </div>
    </div>
  );
};
