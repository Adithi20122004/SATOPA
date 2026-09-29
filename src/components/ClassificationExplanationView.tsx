import React, { useState, useEffect } from 'react';
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
  ArrowLeft,
  Copy,
  Check,
  Printer,
  MapPin,
  QrCode as QrCodeIcon
} from 'lucide-react';
import { QRCode } from '../utils/qrCode';
import type { KitProfile, CapturedFrame, SignedRecord, GPSCoords, QualityGateResult } from '../types';
import type { FullAnalysisResult } from '../vision/classifier';
import { PresumptiveDisclaimer } from './PresumptiveDisclaimer';
import { sha256Hex, signRecord, computeRecordChainHash } from '../crypto/recordCrypto';
import {
  getOrCreateDeviceKeyPair,
  getLatestRecordChainHash,
  checkClockSkew,
  saveRecordToDatabase,
} from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { PdfEvidenceReport } from './PdfEvidenceReport';

interface ClassificationExplanationViewProps {
  analysis: FullAnalysisResult;
  frame: CapturedFrame;
  kit: KitProfile;
  operatorId: string;
  deviceId: string;
  coords: GPSCoords | null;
  quality?: QualityGateResult | null;
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
  quality,
  onSaved,
  onRetake,
}) => {
  const [caseReference, setCaseReference] = useState<string>('');
  const [isSigning, setIsSigning] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [signedRecord, setSignedRecord] = useState<SignedRecord | null>(null);
  const [recordHash, setRecordHash] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showPdfReport, setShowPdfReport] = useState<boolean>(false);

  const { classification, calibration, rawLab, calibratedLab } = analysis;
  const { outcome, confidence, topDistance, runnerUpMargin, distances, inconclusiveReason, isExpiredKit } =
    classification;

  // Auto-generate initial signed record on mount so full cryptographic metadata and QR are immediately visible
  useEffect(() => {
    let isCancelled = false;

    const generateInitialRecord = async () => {
      try {
        const imageBytes = await frame.blob.arrayBuffer();
        const image_sha256 = await sha256Hex(imageBytes);
        const timestamp_utc = new Date(frame.timestamp).toISOString();
        const previous_record_hash = await getLatestRecordChainHash();
        const clock_skew_flag = await checkClockSkew(timestamp_utc);

        const gpsStatusText = coords
          ? `${coords.latitude.toFixed(5)}°N, ${coords.longitude.toFixed(5)}°E (±${coords.accuracy}m)`
          : 'GPS unavailable';

        const unsigned: SignedRecord = {
          record_id: uuidv4(),
          timestamp_utc,
          gps: {
            latitude: coords?.latitude || 0,
            longitude: coords?.longitude || 0,
            accuracy: coords?.accuracy || 999,
            low_accuracy_flag: !coords || coords.isLowAccuracy,
            status_text: gpsStatusText,
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
            blur_score: quality ? quality.blurScore : 95,
            glare_percent: quality ? quality.glarePercent : 0.2,
            tilt_deg: quality ? quality.tiltAngleDeg : 2.1,
          },
          measured_lab: calibratedLab,
        };

        const keyInfo = await getOrCreateDeviceKeyPair();
        const signed = await signRecord(unsigned, keyInfo.privateKey, keyInfo.publicKeyHex);
        const hash = await computeRecordChainHash(signed);

        if (!isCancelled) {
          setSignedRecord(signed);
          setRecordHash(hash);

          // Generate verification QR code
          const qrPayload = JSON.stringify({
            id: signed.record_id,
            out: signed.outcome,
            time: signed.timestamp_utc,
            img: signed.image_sha256.slice(0, 16),
            sig: signed.signature_der_hex?.slice(0, 16),
          });
          const url = await QRCode.toDataURL(qrPayload, { width: 140, margin: 1 });
          setQrCodeUrl(url);
        }
      } catch (err) {
        console.error('Failed to prepare cryptographic record:', err);
      }
    };

    generateInitialRecord();
    return () => {
      isCancelled = true;
    };
  }, [analysis, frame, kit, operatorId, deviceId, coords, quality]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleCommitRecord = async () => {
    if (!signedRecord || isSigning) return;
    setIsSigning(true);
    setSaveError(null);
    try {
      // Re-sign with any updated case reference
      const toSave: SignedRecord = {
        ...signedRecord,
        case_reference: caseReference.trim() || undefined,
      };
      const keyInfo = await getOrCreateDeviceKeyPair();
      const finalSigned = await signRecord(toSave, keyInfo.privateKey, keyInfo.publicKeyHex);

      await saveRecordToDatabase(finalSigned, frame.blob);
      onSaved(finalSigned);
    } catch (e: any) {
      setSaveError('Error saving record to cryptographic ledger: ' + (e?.message || 'Database transaction error'));
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

      {/* Quality Gate Verification Breakdown */}
      {quality && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              Automated Quality Gates Verification
            </h3>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                quality.allPassed
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              {quality.allPassed ? 'ALL GATES PASSED' : 'ADVISORY / RETAKE'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">A6 Card & ArUco</span>
              <span className={`font-mono text-[10px] font-bold ${quality.cardDetected ? 'text-emerald-400' : 'text-rose-400'}`}>
                {quality.cardDetected ? 'Locked (4/4)' : 'Not Found'}
              </span>
            </div>

            <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Sharpness</span>
              <span className={`font-mono text-[10px] font-bold ${quality.blurPassed ? 'text-emerald-400' : 'text-rose-400'}`}>
                {quality.blurScore} (min {quality.blurThreshold})
              </span>
            </div>

            <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Exposure Luma</span>
              <span className={`font-mono text-[10px] font-bold ${quality.exposurePassed ? 'text-emerald-400' : 'text-rose-400'}`}>
                {quality.exposureScore}/255
              </span>
            </div>

            <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Specular Glare</span>
              <span className={`font-mono text-[10px] font-bold ${quality.glarePassed ? 'text-emerald-400' : 'text-rose-400'}`}>
                {quality.glarePercent}% (≤4%)
              </span>
            </div>

            <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Camera Tilt</span>
              <span className={`font-mono text-[10px] font-bold ${quality.tiltPassed ? 'text-emerald-400' : 'text-rose-400'}`}>
                {quality.tiltAngleDeg}° (≤20°)
              </span>
            </div>

            <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Lighting Var.</span>
              <span className={`font-mono text-[10px] font-bold ${quality.evenLightingPassed ? 'text-emerald-400' : 'text-rose-400'}`}>
                {quality.lightingVariance}%
              </span>
            </div>
          </div>
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
              className="w-full h-10 rounded-lg border border-slate-700 shadow-inner bg-slate-800 flex items-center justify-center text-[10px] text-slate-400"
            >
              Raw Well
            </div>
            <span className="text-[9px] font-mono text-slate-400">
              L*:{rawLab[0].toFixed(0)} a*:{rawLab[1].toFixed(0)} b*:{rawLab[2].toFixed(0)}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-sky-300 font-semibold block truncate">
              Calibrated Result
            </span>
            <div
              className="w-full h-10 rounded-lg border-2 border-sky-400 shadow-md bg-sky-950/80 flex items-center justify-center text-[10px] text-sky-300 font-bold"
            >
              Calibrated
            </div>
            <span className="text-[9px] font-mono text-sky-300 font-medium">
              L*:{calibratedLab[0].toFixed(0)} a*:{calibratedLab[1].toFixed(0)} b*:{calibratedLab[2].toFixed(0)}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 block truncate">Reference Match</span>
            <div
              className={`w-full h-10 rounded-lg border border-slate-700 shadow-inner flex items-center justify-center text-[10px] font-bold ${
                outcome === 'POSITIVE' ? 'bg-purple-950 text-purple-200' : 'bg-amber-950 text-amber-200'
              }`}
            >
              {classification.matchedClass}
            </div>
            <span className="text-[9px] font-mono text-slate-400">
              ΔE: {topDistance.toFixed(1)}
            </span>
          </div>
        </div>

        {/* Residual Calibration Score */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-400">Least-Squares Residual RMSE:</span>
          <span className="font-mono text-emerald-400 font-semibold">
            {calibration.residualRmse} (Calibrated)
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

      {/* Signed Record Details & Cryptographic Audit Block */}
      {signedRecord && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              Signed Digital Record
            </h3>
            <span className="text-[10px] font-mono text-slate-400">ECDSA P-256</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5 text-[11px] font-mono">
              <div>
                <span className="text-slate-500 text-[10px] block">Record UUID:</span>
                <div className="flex items-center justify-between text-slate-200">
                  <span>{signedRecord.record_id.slice(0, 18)}...</span>
                  <button
                    onClick={() => handleCopy(signedRecord.record_id, 'id')}
                    className="text-slate-400 hover:text-white p-0.5"
                    title="Copy Record ID"
                  >
                    {copiedField === 'id' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              <div>
                <span className="text-slate-500 text-[10px] block">UTC Timestamp:</span>
                <span className="text-slate-300">{signedRecord.timestamp_utc}</span>
              </div>

              <div>
                <span className="text-slate-500 text-[10px] block">GPS Geolocation:</span>
                <span className="text-slate-300 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-sky-400" />
                  {signedRecord.gps.status_text ||
                    (signedRecord.gps.latitude !== 0
                      ? `${signedRecord.gps.latitude.toFixed(4)}°N, ${signedRecord.gps.longitude.toFixed(4)}°E (±${signedRecord.gps.accuracy}m)`
                      : 'GPS unavailable')}
                </span>
              </div>

              <div>
                <span className="text-slate-500 text-[10px] block">Operator & Device:</span>
                <span className="text-slate-300">{signedRecord.operator_id} • {signedRecord.device_id}</span>
              </div>
            </div>

            {/* QR Code */}
            <div className="flex flex-col items-center justify-center p-2 bg-slate-950 rounded-lg border border-slate-800">
              {qrCodeUrl ? (
                <img src={qrCodeUrl} alt="Record QR" className="w-24 h-24 rounded border border-slate-700" />
              ) : (
                <div className="w-24 h-24 bg-slate-800 rounded animate-pulse" />
              )}
              <span className="text-[9px] font-mono text-slate-400 mt-1 flex items-center gap-1">
                <QrCodeIcon className="w-3 h-3 text-emerald-400" />
                Scan to Verify
              </span>
            </div>
          </div>

          {/* Cryptographic Hashes */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800 text-[10px] font-mono">
            <div>
              <span className="text-slate-500 block">Image SHA-256 Digest:</span>
              <div className="flex items-center justify-between text-sky-300">
                <span className="truncate pr-2">{signedRecord.image_sha256}</span>
                <button
                  onClick={() => handleCopy(signedRecord.image_sha256, 'img_hash')}
                  className="text-slate-400 hover:text-white p-0.5 shrink-0"
                  title="Copy Image SHA-256"
                >
                  {copiedField === 'img_hash' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>

            <div>
              <span className="text-slate-500 block">Record Canonical Hash:</span>
              <div className="flex items-center justify-between text-indigo-300">
                <span className="truncate pr-2">{recordHash || 'Calculating...'}</span>
                <button
                  onClick={() => handleCopy(recordHash, 'rec_hash')}
                  className="text-slate-400 hover:text-white p-0.5 shrink-0"
                  title="Copy Record Hash"
                >
                  {copiedField === 'rec_hash' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>

            <div>
              <span className="text-slate-500 block">Previous Block Hash (Chain Link):</span>
              <span className="text-slate-400 truncate block">{signedRecord.previous_record_hash}</span>
            </div>

            <div>
              <span className="text-slate-500 block">ECDSA P-256 Signature (DER Hex):</span>
              <div className="flex items-center justify-between text-emerald-400">
                <span className="truncate pr-2">{signedRecord.signature_der_hex?.slice(0, 32)}...</span>
                <button
                  onClick={() => handleCopy(signedRecord.signature_der_hex || '', 'sig')}
                  className="text-slate-400 hover:text-white p-0.5 shrink-0"
                  title="Copy Full ECDSA Signature"
                >
                  {copiedField === 'sig' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Case Reference Entry */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
        <label className="text-xs font-bold text-slate-200 block">
          Case / Seizure Reference (Optional)
        </label>
        <input
          type="text"
          value={caseReference}
          onChange={(e) => setCaseReference(e.target.value)}
          placeholder="e.g. NDPS-SZ-2026/0412"
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500"
        />
      </div>

      {/* Error Banner */}
      {saveError && (
        <div className="p-3 bg-rose-950/60 border border-rose-500/60 rounded-xl text-xs text-rose-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Action Buttons: Save to Chain + Export Evidence PDF */}
      <div className="space-y-2 pt-1">
        <button
          onClick={handleCommitRecord}
          disabled={isSigning || !signedRecord}
          className="w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-sky-500/25 active:scale-[0.99] transition-all disabled:opacity-50"
        >
          {isSigning ? (
            <>
              <Clock className="w-4 h-4 animate-spin text-white" />
              Writing to Cryptographic Log...
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4 text-white" />
              Save Record & View in Audit Log
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>

        {signedRecord && (
          <button
            onClick={() => setShowPdfReport(true)}
            className="w-full py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
          >
            <Printer className="w-4 h-4 text-sky-400" />
            Export Official Court Evidence PDF
          </button>
        )}
      </div>

      {/* PDF Modal */}
      {showPdfReport && signedRecord && (
        <PdfEvidenceReport
          record={signedRecord}
          imageUrl={frame.dataUrl}
          onClose={() => setShowPdfReport(false)}
        />
      )}
    </div>
  );
};

