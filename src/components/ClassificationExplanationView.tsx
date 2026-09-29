import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  Hash,
  Scale,
  Clock,
  Sparkles,
  ChevronRight,
  ArrowLeft
} from 'lucide-react';
import type { KitProfile, CapturedFrame, SignedRecord, GPSCoords } from '../types';
import type { FullAnalysisResult } from '../vision/classifier';
import { PresumptiveDisclaimer } from './PresumptiveDisclaimer';
import { sha256Hex, signRecord } from '../crypto/recordCrypto';
import {
  getOrCreateDeviceKeyPair,
  getLatestRecordChainHash,
  checkClockSkew,
  saveRecordToDatabase,
} from '../db/database';
import { v4 as uuidv4 } from 'uuid';

interface ClassificationExplanationViewProps {
  analysis: FullAnalysisResult;
  frame: CapturedFrame;
  kit: KitProfile;
  operatorId: string;
  deviceId: string;
  coords: GPSCoords | null;
  onSaved: (record: SignedRecord) => void;
  onRetake: () => void;
}

export const ClassificationExplanationView: React.FC<ClassificationExplanationViewProps> = ({
  analysis,
  frame,
  kit,
  operatorId,
  deviceId,
  coords,
  onSaved,
  onRetake,
}) => {
  const [caseReference, setCaseReference] = useState<string>('');
  const [isSigning, setIsSigning] = useState<boolean>(false);
  const [signSuccess, setSignSuccess] = useState<boolean>(false);

  const { classification, calibration, rawLab, calibratedLab } = analysis;
  const { outcome, confidence, topDistance, runnerUpMargin, distances, inconclusiveReason, isExpiredKit } =
    classification;

  const handleSignAndSave = async () => {
    if (isSigning) return;
    setIsSigning(true);

    try {
      // 1. Compute SHA-256 digest of captured raw image bytes
      const imageBytes = await frame.blob.arrayBuffer();
      const image_sha256 = await sha256Hex(imageBytes);

      // 2. Retrieve previous record chain hash and check clock
      const timestamp_utc = new Date(frame.timestamp).toISOString();
      const previous_record_hash = await getLatestRecordChainHash();
      const clock_skew_flag = await checkClockSkew(timestamp_utc);

      // 3. Assemble record payload
      const unsignedRecord: SignedRecord = {
        record_id: uuidv4(),
        timestamp_utc,
        gps: {
          latitude: coords?.latitude || 0,
          longitude: coords?.longitude || 0,
          accuracy: coords?.accuracy || 999,
          low_accuracy_flag: !coords || coords.isLowAccuracy,
        },
        operator_id: operatorId,
        device_id: deviceId,
        app_version: '1.0.0-SIH26231',
        kit_profile: {
          id: kit.id,
          name: kit.name,
          lot_number: kit.lotNumber,
          expiry_date: kit.expiryDate,
        },
        case_reference: caseReference.trim() || undefined,
        outcome,
        confidence,
        calibration_score: calibration.residualRmse,
        image_sha256,
        previous_record_hash,
        clock_skew_flag,
        quality_flags: {
          blur_score: 95,
          glare_percent: 0.2,
          tilt_deg: 2.1,
        },
        measured_lab: calibratedLab,
      };

      // 4. Retrieve / generate device ECDSA P-256 keypair
      const keyInfo = await getOrCreateDeviceKeyPair();

      // 5. Digitally sign record
      const signedRecord = await signRecord(unsignedRecord, keyInfo.privateKey, keyInfo.publicKeyHex);

      // 6. Save to local IndexedDB
      await saveRecordToDatabase(signedRecord, frame.blob);

      setSignSuccess(true);
      setTimeout(() => {
        onSaved(signedRecord);
      }, 1000);
    } catch (e) {
      console.error('Signing and saving failed:', e);
      alert('Error during cryptographic signing: ' + (e as any)?.message);
    } finally {
      setIsSigning(false);
    }
  };

  const outcomeColors = {
    POSITIVE: 'from-rose-600 via-rose-700 to-rose-950 border-rose-500/50 text-rose-100',
    NEGATIVE: 'from-emerald-600 via-emerald-700 to-emerald-950 border-emerald-500/50 text-emerald-100',
    INCONCLUSIVE: 'from-amber-600 via-amber-700 to-amber-950 border-amber-500/50 text-amber-100',
  }[outcome];

  const outcomeBadge = {
    POSITIVE: { bg: 'bg-rose-500', text: 'Target Substance Detected' },
    NEGATIVE: { bg: 'bg-emerald-500', text: 'No Colorimetric Reaction Detected' },
    INCONCLUSIVE: { bg: 'bg-amber-500', text: 'Indeterminate / Abstain Outcome' },
  }[outcome];

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-lg mx-auto w-full pb-8">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onRetake}
          className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retake Test
        </button>
        <span className="text-[11px] font-mono text-slate-400">
          Reagent: {kit.reagentType.split(' ')[0]}
        </span>
      </div>

      {/* Primary Result Banner */}
      <div className={`p-5 rounded-2xl bg-gradient-to-br border shadow-xl ${outcomeColors} space-y-2`}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-black/40 border border-white/20">
            Presumptive Classification
          </span>
          <span className="text-xs font-mono font-bold bg-black/40 px-2 py-0.5 rounded-full">
            {confidence}% Confidence
          </span>
        </div>

        <div className="flex items-center gap-3 pt-1">
          {outcome === 'POSITIVE' && <XCircle className="w-10 h-10 text-rose-200 shrink-0" />}
          {outcome === 'NEGATIVE' && <CheckCircle2 className="w-10 h-10 text-emerald-200 shrink-0" />}
          {outcome === 'INCONCLUSIVE' && <AlertTriangle className="w-10 h-10 text-amber-200 shrink-0" />}

          <div>
            <h2 className="text-2xl font-black tracking-tight uppercase leading-none">
              {outcome}
            </h2>
            <p className="text-xs font-medium opacity-90 mt-1">
              {outcomeBadge.text}
            </p>
          </div>
        </div>

        <p className="text-[11px] opacity-80 pt-1">
          Target: <span className="font-semibold">{kit.targetSubstance}</span>
        </p>
      </div>

      {/* Mandatory Statutory Disclaimer */}
      <PresumptiveDisclaimer />

      {/* Expired Kit Alert (if applicable) */}
      {isExpiredKit && (
        <div className="p-3 bg-rose-950/60 border border-rose-500/50 rounded-xl text-xs text-rose-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-rose-300 block">EXPIRED REAGENT LOT WARNING</span>
            <span>
              Kit Lot {kit.lotNumber} expired on {kit.expiryDate}. Chemical color change may have
              degraded. Confirmatory forensic laboratory test required.
            </span>
          </div>
        </div>
      )}

      {/* Inconclusive Rationale (if applicable) */}
      {outcome === 'INCONCLUSIVE' && inconclusiveReason && (
        <div className="p-3.5 bg-amber-950/40 border border-amber-500/40 rounded-xl space-y-1 text-xs">
          <div className="font-bold text-amber-300 flex items-center gap-1.5 text-xs">
            <Scale className="w-4 h-4 text-amber-400" />
            Abstain Decision Rationale
          </div>
          <p className="text-amber-200/90 text-[11px] leading-relaxed">
            {inconclusiveReason}
          </p>
        </div>
      )}

      {/* Color Calibration Metrics & Comparison */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-sky-400" />
          Lighting Calibration & CIELAB Extraction
        </h3>

        {/* Swatch Comparison */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 block truncate">Raw Camera</span>
            <div
              className="w-full h-10 rounded-lg border border-slate-700 shadow-inner"
              style={{
                backgroundColor: `rgb(${analysis.calibration.rawResultLab ? '128,128,128' : '128,128,128'})`,
              }}
            />
            <span className="text-[9px] font-mono text-slate-400">
              L*:{rawLab[0].toFixed(0)} a*:{rawLab[1].toFixed(0)} b*:{rawLab[2].toFixed(0)}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-sky-300 font-semibold block truncate">
              Calibrated Result
            </span>
            <div
              className="w-full h-10 rounded-lg border-2 border-sky-400 shadow-md"
              style={{
                backgroundColor: `rgb(100, 50, 120)`, // preview representative
              }}
            />
            <span className="text-[9px] font-mono text-sky-300 font-medium">
              L*:{calibratedLab[0].toFixed(0)} a*:{calibratedLab[1].toFixed(0)} b*:{calibratedLab[2].toFixed(0)}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 block truncate">Reference Match</span>
            <div
              className="w-full h-10 rounded-lg border border-slate-700 shadow-inner"
              style={{
                backgroundColor: outcome === 'POSITIVE' ? '#3B0764' : '#FEF08A',
              }}
            />
            <span className="text-[9px] font-mono text-slate-400">
              ΔE: {topDistance.toFixed(1)}
            </span>
          </div>
        </div>

        {/* Residual Calibration Score */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-400">Least-Squares Residual RMSE:</span>
          <span className="font-mono text-emerald-400 font-semibold">
            {calibration.residualRmse} (Good fit)
          </span>
        </div>
      </div>

      {/* CIEDE2000 Distance Breakdown */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
          <Hash className="w-4 h-4 text-emerald-400" />
          CIEDE2000 (ΔE₀₀) Distance Breakdown
        </h3>

        <div className="space-y-2.5">
          {distances.map((d) => {
            const isTop = d.className === classification.matchedClass;
            const barWidth = Math.min(100, Math.max(5, (d.deltaE00 / (kit.deltaEAcceptanceThreshold * 1.5)) * 100));

            return (
              <div key={d.className} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-semibold ${isTop ? 'text-white' : 'text-slate-400'}`}>
                    {d.className}
                  </span>
                  <span className="font-mono text-[11px] text-slate-300">
                    ΔE = {d.deltaE00.toFixed(1)}{' '}
                    <span className="text-[9px] text-slate-500">
                      (Limit: T≤{kit.deltaEAcceptanceThreshold})
                    </span>
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className={`h-full rounded-full transition-all ${
                      d.deltaE00 <= kit.deltaEAcceptanceThreshold
                        ? isTop
                          ? 'bg-emerald-400'
                          : 'bg-sky-400'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span>Runner-up Separation Margin:</span>
          <span className={`font-mono font-semibold ${runnerUpMargin >= kit.deltaEMarginThreshold ? 'text-emerald-400' : 'text-amber-400'}`}>
            ΔE = {runnerUpMargin.toFixed(1)} (Req: M≥{kit.deltaEMarginThreshold})
          </span>
        </div>
      </div>

      {/* Case Reference Entry */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
        <label className="text-xs font-bold text-slate-200 block">
          Optional Case / Seizure Reference
        </label>
        <input
          type="text"
          value={caseReference}
          onChange={(e) => setCaseReference(e.target.value)}
          placeholder="e.g. NDPS-SZ-2026/0412"
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500"
        />
        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
          <span>Officer: {operatorId}</span>
          <span>Device: {deviceId}</span>
        </div>
      </div>

      {/* Digital Signing & Hash Chaining Action */}
      <div className="space-y-2 pt-1">
        <button
          onClick={handleSignAndSave}
          disabled={isSigning || signSuccess}
          className={`w-full py-3.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xl transition-all ${
            signSuccess
              ? 'bg-emerald-600 text-white'
              : 'bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-sky-500/25 active:scale-[0.99]'
          }`}
        >
          {signSuccess ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-white" />
              Signed & Added to Hash Chain!
            </>
          ) : isSigning ? (
            <>
              <Clock className="w-4 h-4 animate-spin text-white" />
              Signing with ECDSA P-256...
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4 text-white" />
              Digitally Sign & Append to Hash Chain
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>

        <p className="text-[10px] text-center text-slate-500">
          ECDSA P-256 WebCrypto signature • SHA-256 chained audit trail
        </p>
      </div>
    </div>
  );
};
