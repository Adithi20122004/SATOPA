import { useState, useEffect } from 'react';
import {
  Camera,
  FileText,
  ShieldCheck,
  BarChart3,
  Printer,
  Settings,
  Shield,
  Sparkles,
  ChevronDown,
  ChevronUp,
  MapPin,
  CheckCircle2,
} from 'lucide-react';
import type { AppTab, KitProfile, CapturedFrame, QualityGateResult, SignedRecord } from './types';
import { DEFAULT_KIT_PROFILES } from './data/defaultKits';
import { CameraCaptureView } from './components/CameraCaptureView';
import { PresumptiveDisclaimer } from './components/PresumptiveDisclaimer';
import { PrintableCardView } from './components/PrintableCardView';
import { QualityGateModal } from './components/QualityGateModal';
import { ClassificationExplanationView } from './components/ClassificationExplanationView';
import { AuditLogView } from './components/AuditLogView';
import { VerificationView } from './components/VerificationView';
import { EvaluationRunnerView } from './components/EvaluationRunnerView';
import { processCardCapture } from './vision/cardDetector';
import type { CardDetectionResult } from './vision/cardDetector';
import { evaluateQualityGates } from './vision/qualityGates';
import { analyzeTestResult } from './vision/classifier';
import type { FullAnalysisResult } from './vision/classifier';
import { useGeolocation } from './hooks/useGeolocation';
import { seedDemoRecords } from './data/seedDemoData';

export function App() {
  const [currentTab, setCurrentTab] = useState<AppTab>('capture');
  const [operatorId, setOperatorId] = useState<string>('MHA-NDPS-8841');
  const [deviceId, setDeviceId] = useState<string>('');
  const [kitProfiles] = useState<KitProfile[]>(DEFAULT_KIT_PROFILES);
  const [selectedKitId, setSelectedKitId] = useState<string>(DEFAULT_KIT_PROFILES[0].id);

  // Demo Mode helpers
  const [isDemoMode, setIsDemoMode] = useState<boolean>(true);
  const [showDemoGuide, setShowDemoGuide] = useState<boolean>(false);
  const [seedNotice, setSeedNotice] = useState<string | null>(null);

  // Vision & capture pipeline state
  const [capturedFrame, setCapturedFrame] = useState<CapturedFrame | null>(null);
  const [cardResult, setCardResult] = useState<CardDetectionResult | null>(null);
  const [qualityResult, setQualityResult] = useState<QualityGateResult | null>(null);
  const [analysisResult, setAnalysisResult] = useState<FullAnalysisResult | null>(null);

  // Selected record for Verifier tab
  const [recordToVerify, setRecordToVerify] = useState<SignedRecord | null>(null);

  const { coords, isLocating: isGpsLocating, statusText: gpsStatusText, requestLocation: requestGpsLocation } = useGeolocation();

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

    // Compute central guideline box based on frame aspect ratio
    const boxW = Math.round(frame.width * 0.65);
    const boxH = Math.round(boxW * 1.414);
    const boxX = Math.round((frame.width - boxW) / 2);
    const boxY = Math.round((frame.height - boxH) / 2);
    const guidelineBox = {
      x: Math.max(0, boxX),
      y: Math.max(0, boxY),
      w: boxW,
      h: Math.min(boxH, frame.height),
    };

    const detected = processCardCapture(frame.imageData, guidelineBox);
    setCardResult(detected);

    const quality = evaluateQualityGates({
      cardDetected: detected.cardDetected,
      corners: detected.corners,
      imageData: frame.imageData,
      cardRect: guidelineBox,
      resultWindowRect: detected.resultRegion?.rect,
    });
    setQualityResult(quality);
  };

  const handleProceedToAnalysis = () => {
    if (!cardResult || !qualityResult) return;
    const fullAnalysis = analyzeTestResult(cardResult, qualityResult, activeKit);
    setAnalysisResult(fullAnalysis);
  };

  const handleRetake = () => {
    setCapturedFrame(null);
    setCardResult(null);
    setQualityResult(null);
    setAnalysisResult(null);
  };

  const handleRecordSaved = (_signedRecord: SignedRecord) => {
    handleRetake();
    setCurrentTab('log');
  };

  const handleNavigateToVerify = (record: SignedRecord) => {
    setRecordToVerify(record);
    setCurrentTab('verify');
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

        {/* Demo Mode Guide Toggle & Offline Badge */}
        <div className="flex items-center gap-2">
          {/* Header GPS Status Button (Click to request/refresh) */}
          <button
            onClick={requestGpsLocation}
            title="Click to request or refresh high-accuracy GPS fix"
            className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-colors"
          >
            <MapPin
              className={`w-3.5 h-3.5 shrink-0 ${
                coords && !coords.isLowAccuracy
                  ? 'text-emerald-400'
                  : coords?.isLowAccuracy
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            />
            <span
              className={`text-[11px] font-mono truncate max-w-[190px] ${
                coords
                  ? coords.isLowAccuracy
                    ? 'text-amber-300'
                    : 'text-emerald-300'
                  : isGpsLocating
                  ? 'text-slate-400 animate-pulse'
                  : 'text-rose-400'
              }`}
            >
              {gpsStatusText}
            </span>
          </button>

          {isDemoMode && (
            <button
              onClick={() => setShowDemoGuide(!showDemoGuide)}
              className="py-1 px-2.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold flex items-center gap-1 hover:bg-amber-500/30 transition-colors"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              Demo Flow
              {showDemoGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}

          <div className="flex items-center gap-1.5 bg-slate-800/80 px-2 py-1 rounded-full border border-slate-700">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-[11px] font-medium text-slate-300">Offline PWA</span>
          </div>
        </div>
      </header>

      {/* Floating Demo Steps Checklist Overlay */}
      {isDemoMode && showDemoGuide && (
        <div className="bg-slate-900/95 border-b border-slate-800 px-4 py-3 z-40 text-xs shadow-xl animate-in slide-in-from-top duration-200">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
            <span className="font-bold text-amber-300 text-[11px] flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              SIH Hackathon Demo Walkthrough:
            </span>
            <button
              onClick={() => setShowDemoGuide(false)}
              className="text-[10px] text-slate-400 hover:text-white"
            >
              ✕ Close
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[10px]">
            <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 space-y-0.5">
              <span className="text-sky-400 font-bold block">1. Test Tab</span>
              <p className="text-slate-400">Rear camera or load demo card (Positive / Negative / Glare / Wall)</p>
            </div>
            <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 space-y-0.5">
              <span className="text-emerald-400 font-bold block">2. Quality Gates</span>
              <p className="text-slate-400">Sharpness, tilt, exposure, glare, and marker lock</p>
            </div>
            <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 space-y-0.5">
              <span className="text-indigo-400 font-bold block">3. Result & Sign</span>
              <p className="text-slate-400">CIEDE2000 ΔE, QR code, WebCrypto ECDSA signature</p>
            </div>
            <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 space-y-0.5">
              <span className="text-amber-400 font-bold block">4. Log & Verify</span>
              <p className="text-slate-400">Chain integrity badge, simulate tampering demo, PDF export</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        {/* Explanation Screen Overlay (when analysis is active) */}
        {analysisResult && capturedFrame ? (
          <ClassificationExplanationView
            analysis={analysisResult}
            frame={capturedFrame}
            kit={activeKit}
            operatorId={operatorId}
            deviceId={deviceId}
            coords={coords}
            quality={qualityResult}
            onSaved={handleRecordSaved}
            onRetake={handleRetake}
          />
        ) : (
          <>
            {currentTab === 'capture' && (
              <CameraCaptureView
                activeKit={activeKit}
                onFrameCaptured={handleFrameCaptured}
                operatorId={operatorId}
              />
            )}

            {currentTab === 'card' && <PrintableCardView />}

            {currentTab === 'log' && <AuditLogView onVerifyRecord={handleNavigateToVerify} />}

            {currentTab === 'verify' && <VerificationView initialRecord={recordToVerify} />}

            {currentTab === 'evaluate' && <EvaluationRunnerView kit={activeKit} />}

            {currentTab === 'settings' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-lg mx-auto w-full pb-8">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Settings className="w-5 h-5 text-sky-400" />
                    Field Kit & Officer Settings
                  </h2>

                  {/* Demo Mode Toggle */}
                  <div className="p-3 bg-amber-950/30 border border-amber-500/40 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-amber-300 block flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        Hackathon Demo Mode
                      </span>
                      <p className="text-[10px] text-slate-400">
                        Enables step checklist overlay and quick sample fixtures
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isDemoMode}
                        onChange={(e) => setIsDemoMode(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500" />
                    </label>
                  </div>

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

                  {/* Quick Seed Demo Button */}
                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-slate-300 block">Populate Audit Ledger</span>
                        <span className="text-[10px] text-slate-500">Insert 6 verified records with real ECDSA signatures</span>
                      </div>
                      <button
                        onClick={async () => {
                          await seedDemoRecords();
                          setSeedNotice('Seeded 6 authentic sample records into local IndexedDB ledger!');
                          setTimeout(() => setSeedNotice(null), 4000);
                        }}
                        className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Seed 6 Records
                      </button>
                    </div>

                    {seedNotice && (
                      <div className="p-2.5 bg-emerald-950/70 border border-emerald-500/60 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{seedNotice}</span>
                      </div>
                    )}
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
                      <span className="text-slate-400">Acceptance Threshold (T):</span>
                      <span className="text-slate-200 font-mono">ΔE ≤ {activeKit.deltaEAcceptanceThreshold}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Separation Margin (M):</span>
                      <span className="text-slate-200 font-mono">ΔE ≥ {activeKit.deltaEMarginThreshold}</span>
                    </div>
                  </div>

                  <PresumptiveDisclaimer />
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Quality Gate Verification Modal (Step before Explanation) */}
      {capturedFrame && qualityResult && !analysisResult && (
        <QualityGateModal
          frame={capturedFrame}
          quality={qualityResult}
          cardResult={cardResult}
          onRetake={handleRetake}
          onProceed={handleProceedToAnalysis}
        />
      )}

      {/* Bottom Navigation Tab Bar */}
      <nav className="bg-slate-900 border-t border-slate-800 px-2 py-1.5 flex items-center justify-around shrink-0 z-30">
        <button
          onClick={() => {
            handleRetake();
            setCurrentTab('capture');
          }}
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
          onClick={() => {
            handleRetake();
            setCurrentTab('card');
          }}
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
          onClick={() => {
            handleRetake();
            setCurrentTab('log');
          }}
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
          onClick={() => {
            handleRetake();
            setCurrentTab('verify');
          }}
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
          onClick={() => {
            handleRetake();
            setCurrentTab('evaluate');
          }}
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
          onClick={() => {
            handleRetake();
            setCurrentTab('settings');
          }}
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
