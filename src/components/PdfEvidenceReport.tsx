import React, { useEffect, useState } from 'react';
import { Printer, ArrowLeft, ShieldCheck, MapPin, AlertTriangle } from 'lucide-react';
import { QRCode } from '../utils/qrCode';
import type { SignedRecord } from '../types';
import { PRESUMPTIVE_DISCLAIMER, PRODUCT_NAME, PRODUCT_TAGLINE } from '../types';
import { computeRecordChainHash } from '../crypto/recordCrypto';

interface PdfEvidenceReportProps {
  record: SignedRecord;
  imageUrl?: string;
  onClose: () => void;
}

export const PdfEvidenceReport: React.FC<PdfEvidenceReportProps> = ({ record, imageUrl, onClose }) => {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [recordHash, setRecordHash] = useState<string>('');

  useEffect(() => {
    // Generate QR code encoding verification details
    const qrPayload = JSON.stringify({
      id: record.record_id,
      out: record.outcome,
      conf: record.confidence,
      time: record.timestamp_utc,
      img_sha: record.image_sha256.slice(0, 16),
      sig: record.signature_der_hex?.slice(0, 16),
      op: record.operator_id,
    });

    QRCode.toDataURL(qrPayload, {
      width: 140,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    }).then(setQrCodeDataUrl).catch(console.error);

    // Compute canonical record hash
    computeRecordChainHash(record).then(setRecordHash).catch(console.error);
  }, [record]);

  const handlePrint = () => {
    window.print();
  };

  const outcomeColors = {
    POSITIVE: 'border-rose-600 text-rose-700 bg-rose-50',
    NEGATIVE: 'border-emerald-600 text-emerald-700 bg-emerald-50',
    INCONCLUSIVE: 'border-amber-600 text-amber-700 bg-amber-50',
  }[record.outcome];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-sm overflow-y-auto p-4 sm:p-6 flex flex-col items-center">
      {/* Top Action Bar (hidden on print) */}
      <div className="w-full max-w-3xl flex items-center justify-between mb-4 print:hidden">
        <button
          onClick={onClose}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-md transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* Printable Sheet (A4 / Standard Letter Format) */}
      <div
        id="printable-evidence-report"
        className="w-full max-w-3xl bg-white text-slate-900 rounded-xl shadow-2xl p-6 sm:p-8 space-y-6 print:p-0 print:shadow-none print:rounded-none print:w-full"
      >
        {/* Header */}
        <div className="border-b-2 border-slate-900 pb-4 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-sky-600" />
              <h1 className="text-lg font-black tracking-tight uppercase text-slate-950">
                {PRODUCT_NAME} • {PRODUCT_TAGLINE.toUpperCase()}
              </h1>
            </div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Forensic Colorimetric Examination & Digital Chain-of-Custody Record
            </h2>
            <p className="text-[11px] text-slate-500 font-mono">
              Verifiable Field Test Record • Cryptographically Signed Evidence Report
            </p>
          </div>

          <div className="text-right space-y-0.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">Record ID</span>
            <span className="text-xs font-mono font-bold text-slate-800">{record.record_id.slice(0, 16)}...</span>
            <div className="text-[10px] text-slate-500 font-mono">
              {new Date(record.timestamp_utc).toUTCString()}
            </div>
          </div>
        </div>

        {/* Primary Case & Result Summary Box */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl border border-slate-300 bg-slate-50">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase text-slate-500 block">Case / Seizure Reference</span>
            <span className="text-xs font-bold text-slate-900 font-mono">
              {record.case_reference || 'N/A (Standard Field Check)'}
            </span>
            <div className="text-[11px] text-slate-600">
              Operator: <span className="font-semibold text-slate-800">{record.operator_id}</span>
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              Device: {record.device_id}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase text-slate-500 block">Reagent Kit Profile</span>
            <span className="text-xs font-bold text-slate-900">{record.kit_profile.name}</span>
            <div className="text-[11px] text-slate-600">
              Lot: <span className="font-mono">{record.kit_profile.lot_number}</span>
            </div>
            <div className="text-[10px] text-slate-500">
              Lot Expiry: {record.kit_profile.expiry_date}
            </div>
          </div>

          <div className={`p-3 rounded-lg border-2 flex flex-col justify-center items-center text-center ${outcomeColors}`}>
            <span className="text-[10px] font-bold uppercase tracking-wider block">Presumptive Result</span>
            <span className="text-xl font-black uppercase tracking-tight">{record.outcome}</span>
            <span className="text-[10px] font-semibold mt-0.5">
              Confidence: {record.confidence}% • Cal. RMSE: {record.calibration_score}
            </span>
          </div>
        </div>

        {/* Evidence Photo and Colorimetry Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          {/* Evidence Image */}
          <div className="border border-slate-300 rounded-lg p-3 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Ingested Evidence Image
            </span>
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Captured Evidence"
                className="w-full h-44 object-contain rounded border border-slate-200 bg-slate-100"
              />
            ) : (
              <div className="w-full h-44 rounded border border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-400 bg-slate-50">
                Binary Image Stored in Local Key-Value Ledger
              </div>
            )}
            <div className="text-[9px] font-mono text-slate-500 break-all">
              SHA-256: {record.image_sha256}
            </div>
          </div>

          {/* Colorimetry & Quality Gate Details */}
          <div className="border border-slate-300 rounded-lg p-3 space-y-3 text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Vision & CIELAB Coordinates
            </span>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-slate-50 rounded border border-slate-200">
                <span className="text-[9px] text-slate-500 block">Calibrated L*</span>
                <span className="font-mono font-bold text-slate-900">{record.measured_lab[0].toFixed(1)}</span>
              </div>
              <div className="p-2 bg-slate-50 rounded border border-slate-200">
                <span className="text-[9px] text-slate-500 block">Calibrated a*</span>
                <span className="font-mono font-bold text-slate-900">{record.measured_lab[1].toFixed(1)}</span>
              </div>
              <div className="p-2 bg-slate-50 rounded border border-slate-200">
                <span className="text-[9px] text-slate-500 block">Calibrated b*</span>
                <span className="font-mono font-bold text-slate-900">{record.measured_lab[2].toFixed(1)}</span>
              </div>
            </div>

            <div className="space-y-1.5 pt-1 text-[11px]">
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span className="text-slate-500">Laplacian Sharpness:</span>
                <span className="font-mono font-semibold">{record.quality_flags.blur_score} / 80 min</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span className="text-slate-500">Specular Glare:</span>
                <span className="font-mono font-semibold">{record.quality_flags.glare_percent}% (≤ 4% limit)</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span className="text-slate-500">Perspective Tilt:</span>
                <span className="font-mono font-semibold">{record.quality_flags.tilt_deg}° (≤ 20° limit)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Clock Skew Audit:</span>
                <span className="font-mono font-semibold text-emerald-700">
                  {record.clock_skew_flag ? 'FLAGGED (Clock drift)' : 'Normal (Verified)'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* GPS Geolocation & Verification QR Section */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 border border-slate-300 rounded-xl bg-slate-50 items-center">
          <div className="sm:col-span-2 space-y-1 text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-sky-600" />
              Geolocation & Timestamp Evidence
            </span>
            <div className="font-mono text-slate-800">
              {record.gps.status_text ? (
                record.gps.status_text
              ) : record.gps.latitude === 0 && record.gps.longitude === 0 ? (
                'GPS unavailable (No coordinate fix)'
              ) : (
                `${record.gps.latitude.toFixed(5)}° N, ${record.gps.longitude.toFixed(5)}° E (±${record.gps.accuracy}m)`
              )}
            </div>
            {record.gps.latitude !== 0 && (
              <a
                href={`https://www.google.com/maps?q=${record.gps.latitude},${record.gps.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-sky-600 underline font-mono block"
              >
                Open Geolocation in Google Maps ↗
              </a>
            )}
            <div className="text-[10px] text-slate-500 pt-1">
              Recorded at ISO-8601 UTC: <span className="font-mono">{record.timestamp_utc}</span>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center text-center">
            {qrCodeDataUrl ? (
              <img src={qrCodeDataUrl} alt="Verification QR Code" className="w-24 h-24 rounded border border-slate-200" />
            ) : (
              <div className="w-24 h-24 rounded bg-slate-200 animate-pulse" />
            )}
            <span className="text-[9px] font-mono text-slate-500 mt-1">Scan to Verify</span>
          </div>
        </div>

        {/* Cryptographic Provenance Block */}
        <div className="border border-slate-300 rounded-xl p-4 bg-slate-900 text-white space-y-2 text-[10px] font-mono">
          <div className="flex items-center justify-between text-xs font-sans border-b border-slate-800 pb-1.5">
            <span className="font-bold uppercase tracking-wider flex items-center gap-1 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              Cryptographic Tamper-Evidence Ledger
            </span>
            <span className="text-slate-400 text-[10px]">ECDSA P-256 (FIPS 186-4) / SHA-256</span>
          </div>

          <div>
            <span className="text-slate-400 block font-sans text-[9px] uppercase">Record Canonical Hash:</span>
            <span className="text-sky-300 break-all">{recordHash || 'Computing...'}</span>
          </div>

          <div>
            <span className="text-slate-400 block font-sans text-[9px] uppercase">Previous Block Chain Link:</span>
            <span className="text-indigo-300 break-all">{record.previous_record_hash}</span>
          </div>

          <div>
            <span className="text-slate-400 block font-sans text-[9px] uppercase">Officer ECDSA Signature (DER Hex):</span>
            <span className="text-emerald-300 break-all">{record.signature_der_hex}</span>
          </div>

          {record.public_key_spki_hex && (
            <div>
              <span className="text-slate-400 block font-sans text-[9px] uppercase">Officer Device Public Key (SPKI):</span>
              <span className="text-slate-400 break-all">{record.public_key_spki_hex.slice(0, 64)}...</span>
            </div>
          )}
        </div>

        {/* Statutory Legal Disclaimer */}
        <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-[11px] text-amber-950 space-y-1">
          <div className="font-bold flex items-center gap-1 text-amber-900">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
            Statutory Forensic Notice (NDPS Act / Directorate of Forensic Science Services)
          </div>
          <p className="leading-relaxed">
            {PRESUMPTIVE_DISCLAIMER} Colorimetric field test outcomes are presumptive only and indicate the presence of chemical functional groups. This digital document constitutes a contemporaneous chain-of-custody field log and must be accompanied by seized physical samples submitted to an accredited forensic science laboratory (FSL) for confirmatory analysis (GC-MS / HPLC).
          </p>
        </div>
      </div>
    </div>
  );
};
