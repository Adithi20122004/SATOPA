import { useState, useEffect } from 'react';
import {
  Camera,
  FileText,
  ShieldCheck,
  BarChart3,
  Printer,
  Settings,
  Shield
} from 'lucide-react';
import type { AppTab, KitProfile, CapturedFrame } from './types';
import { DEFAULT_KIT_PROFILES } from './data/defaultKits';
import { CameraCaptureView } from './components/CameraCaptureView';
import { PresumptiveDisclaimer } from './components/PresumptiveDisclaimer';

export function App() {
  const [currentTab, setCurrentTab] = useState<AppTab>('capture');
  const [operatorId, setOperatorId] = useState<string>('MHA-NDPS-8841');
  const [deviceId, setDeviceId] = useState<string>('');
  const [kitProfiles] = useState<KitProfile[]>(DEFAULT_KIT_PROFILES);
  const [selectedKitId, setSelectedKitId] = useState<string>(DEFAULT_KIT_PROFILES[0].id);
  const [capturedFrame, setCapturedFrame] = useState<CapturedFrame | null>(null);

  // Initialize or retrieve persistent pseudonymous device ID
  useEffect(() => {
    let devId = localStorage.getItem('sih_device_uuid');
    if (!devId) {
      devId = 'DEV-' + Math.random().toString(36).substring(2, 10).toUpperCase();
      localStorage.setItem('sih_device_uuid', devId);
    }
    setDeviceId(devId);
  }, []);

  const activeKit = kitProfiles.find((k) => k.id === selectedKitId) || kitProfiles[0];

  const handleFrameCaptured = (frame: CapturedFrame) => {
    setCapturedFrame(frame);
  };

  return (
    <div className="flex flex-col h-screen max-h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Application Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 via-sky-600 to-indigo-700 flex items-center justify-center p-0.5 shadow-md">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-bold tracking-tight text-white uppercase">
                MHA Field Companion
              </h1>
              <span className="text-[9px] font-semibold uppercase bg-sky-500/20 text-sky-300 border border-sky-500/30 px-1 py-0.2 rounded">
                SIH26231
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">
              Op: {operatorId} • Dev: {deviceId}
            </p>
          </div>
        </div>

        {/* Offline Badge */}
        <div className="flex items-center gap-1.5 bg-slate-800/80 px-2 py-1 rounded-full border border-slate-700">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-[11px] font-medium text-slate-300">Offline PWA</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        {currentTab === 'capture' && (
          <CameraCaptureView
            activeKit={activeKit}
            onFrameCaptured={handleFrameCaptured}
            operatorId={operatorId}
          />
        )}

        {currentTab === 'card' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-lg mx-auto w-full">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Printer className="w-5 h-5 text-sky-400" />
                  Printable A6 Reference Card
                </h2>
                <span className="text-xs bg-slate-800 px-2 py-0.5 rounded text-slate-300 font-mono">
                  105 × 148 mm
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Field kit calibration requires 4 ArUco markers (IDs 0–3) and standardized patches
                (White, Grey, Black, R, G, B, C, M, Y) around the reaction tube window.
              </p>
              
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-center">
                <p className="text-xs text-amber-300 font-medium">
                  Reference Card Generator will be fully rendered here in Phase 2.
                </p>
              </div>
            </div>
          </div>
        )}

        {currentTab === 'log' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-lg mx-auto w-full">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-sky-400" />
                Signed Field Audit Log
              </h2>
              <p className="text-xs text-slate-400">
                IndexedDB-backed cryptographically chained records with ECDSA P-256 signatures.
              </p>
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-6 text-center text-xs text-slate-500">
                Records will be stored and searchable here in Phase 4 & 5.
              </div>
            </div>
          </div>
        )}

        {currentTab === 'verify' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-lg mx-auto w-full">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                Evidence Verification & Tamper Demo
              </h2>
              <p className="text-xs text-slate-400">
                Independent verification of image SHA-256 digests, ECDSA P-256 signatures, and hash chain links.
              </p>
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-6 text-center text-xs text-slate-500">
                Stage tamper demo and verification analyzer available in Phase 5.
              </div>
            </div>
          </div>
        )}

        {currentTab === 'evaluate' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-lg mx-auto w-full">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-amber-400" />
                Surrogate Accuracy Evaluation
              </h2>
              <p className="text-xs text-slate-400">
                Confusion matrix & accuracy comparison WITH vs WITHOUT color card calibration.
              </p>
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-6 text-center text-xs text-slate-500">
                Evaluation benchmark suite available in Phase 6.
              </div>
            </div>
          </div>
        )}

        {currentTab === 'settings' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-lg mx-auto w-full">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-sky-400" />
                Field Kit & Officer Settings
              </h2>

              {/* Active Kit Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">
                  Select Active Colorimetric Kit
                </label>
                <select
                  value={selectedKitId}
                  onChange={(e) => setSelectedKitId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                >
                  {kitProfiles.map((kit) => (
                    <option key={kit.id} value={kit.id}>
                      {kit.name} (Lot: {kit.lotNumber})
                    </option>
                  ))}
                </select>
              </div>

              {/* Operator ID Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">
                  Pseudonymous Operator ID
                </label>
                <input
                  type="text"
                  value={operatorId}
                  onChange={(e) => setOperatorId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Device ID Display */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">
                  Device Secure Identifier
                </label>
                <div className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-400 font-mono">
                  {deviceId}
                </div>
              </div>

              {/* Kit Details Card */}
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Reagent:</span>
                  <span className="text-slate-200 font-medium">{activeKit.reagentType}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Target Drug:</span>
                  <span className="text-slate-200 font-medium">{activeKit.targetSubstance}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Lot Expiry:</span>
                  <span className="text-emerald-400 font-mono">{activeKit.expiryDate}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Reading Window:</span>
                  <span className="text-slate-200 font-mono">
                    {activeKit.readingTimeWindowSeconds.min}s – {activeKit.readingTimeWindowSeconds.max}s
                  </span>
                </div>
              </div>

              <PresumptiveDisclaimer />
            </div>
          </div>
        )}
      </main>

      {/* Captured Frame Review Modal (Phase 1 basic preview, Phase 2 quality check) */}
      {capturedFrame && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col justify-between p-4 max-w-md mx-auto">
          <div className="flex items-center justify-between text-slate-200">
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-sky-400" />
              Captured Frame
            </h3>
            <button
              onClick={() => setCapturedFrame(null)}
              className="text-xs bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded text-slate-300 font-medium"
            >
              Retake
            </button>
          </div>

          <div className="relative my-auto rounded-lg overflow-hidden border border-slate-800 shadow-xl max-h-[70vh]">
            <img
              src={capturedFrame.dataUrl}
              alt="Field Capture"
              className="w-full h-auto object-contain max-h-[65vh]"
            />
            <div className="absolute bottom-2 left-2 right-2 bg-black/75 backdrop-blur px-2.5 py-1.5 rounded text-[11px] font-mono text-slate-300 flex justify-between">
              <span>{capturedFrame.width} × {capturedFrame.height}px</span>
              <span>{new Date(capturedFrame.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>

          <div className="space-y-3">
            <PresumptiveDisclaimer compact />
            <div className="flex gap-2">
              <button
                onClick={() => setCapturedFrame(null)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg text-center"
              >
                Discard & Retake
              </button>
              <button
                onClick={() => {
                  alert('Phase 1 Live Camera verified! Frame captured at ' + capturedFrame.width + 'x' + capturedFrame.height + ' resolution.');
                  setCapturedFrame(null);
                }}
                className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg text-center shadow-lg shadow-sky-600/30"
              >
                Proceed to Analysis
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation Tab Bar */}
      <nav className="bg-slate-900 border-t border-slate-800 px-2 py-1.5 flex items-center justify-around shrink-0 z-30">
        <button
          onClick={() => setCurrentTab('capture')}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg transition-colors ${
            currentTab === 'capture'
              ? 'text-sky-400 bg-sky-500/10 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Camera className="w-5 h-5" />
          <span className="text-[10px]">Test</span>
        </button>

        <button
          onClick={() => setCurrentTab('card')}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg transition-colors ${
            currentTab === 'card'
              ? 'text-sky-400 bg-sky-500/10 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Printer className="w-5 h-5" />
          <span className="text-[10px]">Card</span>
        </button>

        <button
          onClick={() => setCurrentTab('log')}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg transition-colors ${
            currentTab === 'log'
              ? 'text-sky-400 bg-sky-500/10 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-5 h-5" />
          <span className="text-[10px]">Log</span>
        </button>

        <button
          onClick={() => setCurrentTab('verify')}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg transition-colors ${
            currentTab === 'verify'
              ? 'text-sky-400 bg-sky-500/10 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="w-5 h-5" />
          <span className="text-[10px]">Verify</span>
        </button>

        <button
          onClick={() => setCurrentTab('evaluate')}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg transition-colors ${
            currentTab === 'evaluate'
              ? 'text-sky-400 bg-sky-500/10 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BarChart3 className="w-5 h-5" />
          <span className="text-[10px]">Eval</span>
        </button>

        <button
          onClick={() => setCurrentTab('settings')}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg transition-colors ${
            currentTab === 'settings'
              ? 'text-sky-400 bg-sky-500/10 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px]">Config</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
