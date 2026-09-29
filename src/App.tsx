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
  Info,
  Database,
  Lock,
} from 'lucide-react';
import type { AppTab, KitProfile, CapturedFrame, QualityGateResult, SignedRecord } from './types';
import { PRODUCT_NAME, PRODUCT_TAGLINE, APP_CONFIG } from './types';
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
  const [operatorId, setOperatorId] = useState<string>('OP-8841');
  const [deviceId] = useState<string>(() => {
    let devId = typeof localStorage !== 'undefined' ? localStorage.getItem('satopa_device_id') : null;
    if (!devId) {
      devId = 'DEV-SATOPA-' + Math.random().toString(36).substring(2, 6).toUpperCase();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('satopa_device_id', devId);
      }
    }
    return devId;
  });
  const [kitProfiles] = useState<KitProfile[]>(DEFAULT_KIT_PROFILES);
  const [selectedKitId, setSelectedKitId] = useState<string>(DEFAULT_KIT_PROFILES[0].id);

  // Sandbox Mode (hackathon demo mode)
  const [isSandboxMode, setIsSandboxMode] = useState<boolean>(true);
  const [showGuidedTour, setShowGuidedTour] = useState<boolean>(false);
  const [seedNotice, setSeedNotice] = useState<string | null>(null);

  // Vision & capture pipeline state
  const [capturedFrame, setCapturedFrame] = useState<CapturedFrame | null>(null);
  const [cardResult, setCardResult] = useState<CardDetectionResult | null>(null);
  const [qualityResult, setQualityResult] = useState<QualityGateResult | null>(null);
  const [analysisResult, setAnalysisResult] = useState<FullAnalysisResult | null>(null);

  // Selected record for Verifier tab
  const [recordToVerify, setRecordToVerify] = useState<SignedRecord | null>(null);

  // GPS geolocation state
  const { coords, error: gpsError, isLocating: isGpsLocating, requestLocation: requestGpsLocation } = useGeolocation();
  const [showGpsFixModal, setShowGpsFixModal] = useState<boolean>(false);

  // Online / Offline State
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
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

  const handleFixLocationClick = () => {
    requestGpsLocation();
    if (gpsError || !coords) {
      setShowGpsFixModal(true);
    }
  };

  const navItems: { tab: AppTab; label: string; icon: React.ReactNode }[] = [
    { tab: 'capture', label: 'Test', icon: <Camera className="w-5 h-5" /> },
    { tab: 'card', label: 'Card', icon: <Printer className="w-5 h-5" /> },
    { tab: 'log', label: 'Log', icon: <FileText className="w-5 h-5" /> },
    { tab: 'verify', label: 'Verify', icon: <ShieldCheck className="w-5 h-5" /> },
    { tab: 'evaluate', label: 'Eval', icon: <BarChart3 className="w-5 h-5" /> },
    { tab: 'settings', label: 'Config', icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col font-sans overflow-x-hidden pt-[env(safe-area-inset-top,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]">
      {/* Top Application Header (Compact, never truncates or wraps awkwardly) */}
      <header className="bg-slate-900 border-b border-slate-800 px-3.5 sm:px-6 py-2.5 flex items-center justify-between shrink-0 z-30 w-full sticky top-0">
        {/* Left: Product Wordmark & Operator Badge */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 via-cyan-600 to-indigo-700 flex items-center justify-center p-0.5 shadow-md shrink-0">
            <Shield className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-white uppercase whitespace-nowrap">
                {PRODUCT_NAME}
              </h1>
              <span className="hidden md:inline-block text-[10px] text-slate-400 font-mono">
                · {PRODUCT_TAGLINE}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
              Op: {operatorId}
            </p>
          </div>
        </div>

        {/* Right: Status Chips (GPS, Mode, Offline) - Collapsible on small screens */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* 1. Offline Ready Chip */}
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-slate-300 text-[10px] font-mono cursor-default shrink-0"
            title={isOnline ? 'Network connected • Local ledger active' : 'Offline mode • Local storage active'}
          >
            <Database className="w-3 h-3 text-sky-400 shrink-0" />
            <span className="hidden sm:inline">Offline ready</span>
          </div>

          {/* 2. GPS Status Chip */}
          {coords ? (
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono shrink-0 cursor-default"
              title={`GPS fix acquired: ±${Math.round(coords.accuracy)}m accuracy`}
            >
              <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
              <span className="hidden sm:inline">GPS fix (±{Math.round(coords.accuracy)}m)</span>
            </div>
          ) : isGpsLocating ? (
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-950/70 border border-amber-500/40 text-amber-300 text-[10px] font-mono shrink-0 animate-pulse"
              title="Locating GPS coordinates..."
            >
              <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="hidden sm:inline">Locating...</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleFixLocationClick}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-rose-950/70 border border-rose-500/40 text-rose-300 text-[10px] font-mono cursor-pointer hover:bg-rose-900/60 transition-colors"
                title="GPS off - Tap to request location fix"
              >
                <MapPin className="w-3 h-3 text-rose-400 shrink-0" />
                <span className="hidden sm:inline">GPS off</span>
              </button>
              <button
                onClick={handleFixLocationClick}
                className="hidden md:inline-block text-[10px] font-semibold px-2 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer"
                title="Re-request location permission"
              >
                Fix
              </button>
            </div>
          )}

          {/* 3. Sandbox / Guided Tour Mode Chip */}
          {isSandboxMode && (
            <button
              onClick={() => setShowGuidedTour(!showGuidedTour)}
              className="min-h-[32px] py-1 px-2 sm:px-2.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold flex items-center gap-1 hover:bg-amber-500/30 transition-colors cursor-pointer shrink-0"
              title="Toggle Guided Tour Checklist"
            >
              <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="hidden sm:inline">Guided tour</span>
              {showGuidedTour ? <ChevronUp className="w-3 h-3 hidden sm:inline" /> : <ChevronDown className="w-3 h-3 hidden sm:inline" />}
            </button>
          )}
        </div>
      </header>

      {/* Floating Guided Tour Checklist Overlay */}
      {isSandboxMode && showGuidedTour && (
        <div className="bg-slate-900/95 border-b border-slate-800 px-4 py-3 z-40 text-xs shadow-xl animate-in slide-in-from-top duration-200 w-full">
          <div className="max-w-5xl mx-auto space-y-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
              <span className="font-bold text-amber-300 text-xs flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                {PRODUCT_NAME} Guided Tour Walkthrough:
              </span>
              <button
                onClick={() => setShowGuidedTour(false)}
                className="text-xs text-slate-400 hover:text-white cursor-pointer px-2 py-1"
              >
                ✕ Close
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 text-[11px]">
              <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 space-y-0.5">
                <span className="text-sky-400 font-bold block">1. Test & Capture</span>
                <p className="text-slate-400">Scan reference card or click 'Sample photos' to demo</p>
              </div>
              <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 space-y-0.5">
                <span className="text-emerald-400 font-bold block">2. Quality Gates</span>
                <p className="text-slate-400">Automated sharpness, tilt, exposure, and glare check</p>
              </div>
              <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 space-y-0.5">
                <span className="text-indigo-400 font-bold block">3. Result & Sign</span>
                <p className="text-slate-400">CIEDE2000 ΔE match, QR code, WebCrypto ECDSA signature</p>
              </div>
              <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 space-y-0.5">
                <span className="text-amber-400 font-bold block">4. Log & Verify</span>
                <p className="text-slate-400">Cryptographic hash chain, live tamper simulation, PDF export</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GPS Fix Modal */}
      {showGpsFixModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Enable Location Services</h3>
                <p className="text-[11px] text-slate-400">Accurate GPS required for audit trail</p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs space-y-2 text-slate-300">
              <p className="font-semibold text-slate-200 text-[11px]">How to fix:</p>
              <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-400">
                <li>Click the lock or site settings icon in your browser URL bar.</li>
                <li>Set <strong className="text-slate-200">Location</strong> permission to <strong className="text-emerald-400">Allow</strong>.</li>
                <li>Tap the button below to re-request location.</li>
              </ol>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  requestGpsLocation();
                  setShowGpsFixModal(false);
                }}
                className="min-h-[44px] flex-1 py-2 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow cursor-pointer transition-colors"
              >
                Retry Location Fix
              </button>
              <button
                onClick={() => setShowGpsFixModal(false)}
                className="min-h-[44px] py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Body Layout: Desktop Sidebar (lg+) + Fluid Responsive Stage */}
      <div className="flex-1 flex w-full overflow-hidden">
        {/* Left Sidebar on Desktop (lg+) */}
        <aside className="hidden lg:flex w-60 xl:w-64 bg-slate-900/60 border-r border-slate-800 flex-col justify-between p-4 shrink-0">
          <div className="space-y-4">
            {/* Nav Links with >= 44px targets */}
            <nav className="space-y-1">
              {navItems.map((item) => {
                const isActive = currentTab === item.tab;
                return (
                  <button
                    key={item.tab}
                    onClick={() => {
                      handleRetake();
                      setCurrentTab(item.tab);
                    }}
                    className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-3 transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-sky-600 text-white shadow-md shadow-sky-950/50'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/80'
                    }`}
                  >
                    <span className={isActive ? 'text-white' : 'text-slate-400'}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Quick Kit Profile Widget */}
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5 text-xs">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                Active Reagent Kit
              </span>
              <p className="font-semibold text-slate-200 truncate">{activeKit.name}</p>
              <p className="text-[10px] text-slate-400 font-mono">Lot: {activeKit.lotNumber}</p>
            </div>
          </div>

          {/* Bottom Sidebar Info */}
          <div className="pt-3 border-t border-slate-800 text-[10px] text-slate-500 font-mono space-y-1">
            <div className="flex justify-between">
              <span>Device:</span>
              <span className="text-slate-400 truncate max-w-[120px]">{deviceId}</span>
            </div>
            <div className="flex justify-between">
              <span>App:</span>
              <span className="text-slate-400">v{APP_CONFIG.version}</span>
            </div>
            <div className="flex justify-between">
              <span>Reference:</span>
              <span className="text-slate-400">{APP_CONFIG.sihId}</span>
            </div>
          </div>
        </aside>

        {/* Main Content Stage (Fluid responsive container: 100% mobile, ~720px tablet, ~1100-1200px desktop) */}
        <main className="flex-1 flex flex-col overflow-hidden relative w-full">
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
            <div className="flex-1 flex flex-col overflow-hidden w-full max-w-full sm:max-w-3xl lg:max-w-6xl xl:max-w-7xl mx-auto">
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
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 w-full pb-10">
                  {/* Slim Presumptive Banner for Config */}
                  <PresumptiveDisclaimer compact />

                  {/* Config: Two columns of settings cards on lg+ */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Column 1: Field Kit & Operator Configuration */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-md">
                      <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <Settings className="w-5 h-5 text-sky-400" />
                        Field Kit & Operator Configuration
                      </h2>

                      {/* Sandbox Mode Toggle */}
                      <div className="p-3 bg-amber-950/30 border border-amber-500/40 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-amber-300 block flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            Sandbox mode
                          </span>
                          <p className="text-[10px] text-slate-400">
                            Enables guided walkthrough and sample dataset photos
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSandboxMode}
                            onChange={(e) => setIsSandboxMode(e.target.checked)}
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
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 min-h-[44px]"
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
                          Operator ID (format: OP-####)
                        </label>
                        <input
                          type="text"
                          value={operatorId}
                          onChange={(e) => setOperatorId(e.target.value)}
                          placeholder="OP-8841"
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500 min-h-[44px]"
                        />
                      </div>

                      {/* Device ID Display */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-300 block">
                          Device Secure Identifier
                        </label>
                        <div className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-400 font-mono">
                          {deviceId}
                        </div>
                      </div>

                      {/* Load Sample Data Button */}
                      <div className="pt-2 border-t border-slate-800 space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <span className="text-xs font-semibold text-slate-300 block">Load sample records</span>
                            <span className="text-[10px] text-slate-500">Insert 6 verified records with intact cryptographic chain</span>
                          </div>
                          <button
                            onClick={async () => {
                              await seedDemoRecords();
                              setSeedNotice('Loaded 6 authentic sample records into local ledger with intact chain!');
                              setTimeout(() => setSeedNotice(null), 4000);
                            }}
                            className="min-h-[44px] py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow cursor-pointer transition-colors"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Load sample data</span>
                          </button>
                        </div>

                        {seedNotice && (
                          <div className="p-2.5 bg-emerald-950/70 border border-emerald-500/60 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span>{seedNotice}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Column 2: Kit Profile Details & System Architecture */}
                    <div className="space-y-4">
                      {/* Kit Details Card */}
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 shadow-md">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <Info className="w-4 h-4 text-emerald-400" />
                          Kit Specifications & Decision Bounds
                        </h3>

                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Reagent:</span>
                            <span className="text-slate-200 font-medium">{activeKit.reagentType}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Target Substance:</span>
                            <span className="text-slate-200 font-medium">{activeKit.targetSubstance}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Lot Expiry:</span>
                            <span className="text-emerald-400 font-mono">{activeKit.expiryDate}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Acceptance Threshold (T):</span>
                            <span className="text-slate-200 font-mono">ΔE ≤ {activeKit.deltaEAcceptanceThreshold}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Separation Margin (M):</span>
                            <span className="text-slate-200 font-mono">ΔE ≥ {activeKit.deltaEMarginThreshold}</span>
                          </div>
                        </div>
                      </div>

                      {/* Cryptographic Architecture Card */}
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 shadow-md">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <Lock className="w-4 h-4 text-sky-400" />
                          Cryptographic Standards
                        </h3>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          All test records are signed client-side with W3C WebCrypto ECDSA P-256 and chained using SHA-256 blocks with deterministic genesis linking.
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono pt-1">
                          <div className="p-2 bg-slate-950 rounded border border-slate-800">
                            <span className="text-slate-500 block">Curve:</span>
                            <span className="text-slate-300">NIST P-256 / SPKI</span>
                          </div>
                          <div className="p-2 bg-slate-950 rounded border border-slate-800">
                            <span className="text-slate-500 block">Hash Chain:</span>
                            <span className="text-slate-300">SHA-256 Continuous</span>
                          </div>
                        </div>
                      </div>

                      {/* About Section */}
                      <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-5 space-y-2 text-xs shadow-md">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                            <Shield className="w-4 h-4 text-sky-400" />
                            About {PRODUCT_NAME}
                          </span>
                          <span className="text-[10px] font-mono bg-sky-500/20 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded">
                            {APP_CONFIG.sihId}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          {PRODUCT_NAME} provides {PRODUCT_TAGLINE.toLowerCase()}. Built for field colorimetric drug test kit analysis with CIELAB color-space calibration, tamper-evident ECDSA hash chaining, and independent offline verification.
                        </p>
                        <div className="pt-2 flex items-center justify-between text-[10px] text-slate-500 font-mono border-t border-slate-800">
                          <span>Version {APP_CONFIG.version}</span>
                          <span>Reference: {APP_CONFIG.sihId}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Quality Gate Verification Modal */}
      {capturedFrame && qualityResult && !analysisResult && (
        <QualityGateModal
          frame={capturedFrame}
          quality={qualityResult}
          cardResult={cardResult}
          onRetake={handleRetake}
          onProceed={handleProceedToAnalysis}
        />
      )}

      {/* Bottom Navigation Tab Bar (Visible on mobile/tablet, hidden on lg+ desktop) */}
      <nav className="bg-slate-900 border-t border-slate-800 px-2 py-1.5 flex items-center justify-around shrink-0 z-30 lg:hidden pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))]">
        {navItems.map((item) => {
          const isActive = currentTab === item.tab;
          return (
            <button
              key={item.tab}
              onClick={() => {
                handleRetake();
                setCurrentTab(item.tab);
              }}
              className={`flex-1 min-h-[44px] flex flex-col items-center justify-center gap-1 py-1 px-1 rounded-lg transition-colors cursor-pointer ${
                isActive
                  ? 'text-sky-400 bg-sky-500/10 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.icon}
              <span className="text-[10px] tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default App;
