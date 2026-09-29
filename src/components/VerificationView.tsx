import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Upload,
  RotateCcw,
  Flame,
  ImageOff,
  Search,
} from 'lucide-react';
import type { SignedRecord } from '../types';
import { db } from '../db/database';
import {
  verifyRecordSignature,
  computeRecordChainHash,
  sha256Hex,
} from '../crypto/recordCrypto';
import { PresumptiveDisclaimer } from './PresumptiveDisclaimer';
import { StatusChip } from './StatusChip';

interface VerificationViewProps {
  initialRecord?: SignedRecord | null;
}

interface VerificationReport {
  overallPass: boolean;
  imageHashPass: boolean;
  computedImageHash: string;
  expectedImageHash: string;
  signaturePass: boolean;
  chainPass: boolean;
  gpsPass: boolean;
  clockPass: boolean;
  failureReasons: string[];
}

export const VerificationView: React.FC<VerificationViewProps> = ({ initialRecord }) => {
  const [records, setRecords] = useState<SignedRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string>('');
  const [activeRecord, setActiveRecord] = useState<SignedRecord | null>(null);
  const [originalRecord, setOriginalRecord] = useState<SignedRecord | null>(null);
  const [, setImageBlob] = useState<Blob | null>(null);
  const [originalImageBlob, setOriginalImageBlob] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [tamperApplied, setTamperApplied] = useState<string | null>(null);

  // Load all records on mount
  useEffect(() => {
    const fetchRecords = async () => {
      const all = await db.records.orderBy('timestamp_utc').reverse().toArray();
      setRecords(all);
      if (initialRecord) {
        setSelectedRecordId(initialRecord.record_id);
      } else if (all.length > 0) {
        setSelectedRecordId(all[0].record_id);
      }
    };
    fetchRecords();
  }, [initialRecord]);

  // Load selected record and its image
  useEffect(() => {
    let isCancelled = false;

    const loadRecordData = async () => {
      if (!selectedRecordId) {
        if (!isCancelled) {
          setActiveRecord(null);
          setOriginalRecord(null);
          setImageBlob(null);
          setOriginalImageBlob(null);
          setImageUrl(null);
          setReport(null);
        }
        return;
      }

      const rec = await db.records.get(selectedRecordId);
      if (rec && !isCancelled) {
        setActiveRecord(JSON.parse(JSON.stringify(rec)));
        setOriginalRecord(JSON.parse(JSON.stringify(rec)));
        setTamperApplied(null);

        // Fetch image blob from DB
        const imgEntry = await db.images.get(rec.image_sha256);
        if (!isCancelled) {
          if (imgEntry?.blob) {
            setImageBlob(imgEntry.blob);
            setOriginalImageBlob(imgEntry.blob);
            setImageUrl(URL.createObjectURL(imgEntry.blob));
          } else {
            setImageBlob(null);
            setOriginalImageBlob(null);
            setImageUrl(null);
          }
        }
      }
    };

    void loadRecordData();

    return () => {
      isCancelled = true;
    };
  }, [selectedRecordId]);

  // Re-verify whenever activeRecord or imageBlob changes
  const runVerification = async (rec: SignedRecord, blob: Blob | null) => {
    const failureReasons: string[] = [];

    // 1. Verify Image Hash
    let imageHashPass = false;
    let computedImageHash = 'NO_IMAGE_DATA';
    if (blob) {
      const bytes = await blob.arrayBuffer();
      computedImageHash = await sha256Hex(bytes);
      imageHashPass = computedImageHash.toLowerCase() === rec.image_sha256.toLowerCase();
      if (!imageHashPass) {
        failureReasons.push('Image SHA-256 digest does not match recorded cryptographic hash');
      }
    } else {
      failureReasons.push('Original image blob missing from evidence record');
    }

    // 2. Verify Digital Signature
    const signaturePass = await verifyRecordSignature(rec);
    if (!signaturePass) {
      failureReasons.push('ECDSA P-256 digital signature is INVALID (record payload has been altered)');
    }

    // 3. Verify Chain Link
    let chainPass = true;
    const allChronological = await db.records.orderBy('timestamp_utc').toArray();
    const currentIndex = allChronological.findIndex((r) => r.record_id === rec.record_id);
    if (currentIndex > 0) {
      const prevRecord = allChronological[currentIndex - 1];
      const expectedHash = await computeRecordChainHash(prevRecord);
      chainPass = rec.previous_record_hash === expectedHash;
      if (!chainPass) {
        failureReasons.push('Cryptographic hash chain broken: previous_record_hash does not match predecessor');
      }
    }

    // 4. Quality & Temporal Audit
    const gpsPass = !rec.gps.low_accuracy_flag;
    const clockPass = !rec.clock_skew_flag;

    const overallPass = imageHashPass && signaturePass && chainPass;

    setReport({
      overallPass,
      imageHashPass,
      computedImageHash,
      expectedImageHash: rec.image_sha256,
      signaturePass,
      chainPass,
      gpsPass,
      clockPass,
      failureReasons,
    });
  };

  useEffect(() => {
    if (activeRecord) {
      db.images.get(activeRecord.image_sha256).then((img) => {
        runVerification(activeRecord, img?.blob || null);
      });
    }
  }, [activeRecord]);

  // Tamper Action 1: Mutate Image Bits
  const handleTamperImage = async () => {
    if (!originalImageBlob || !activeRecord) return;
    const bytes = await originalImageBlob.arrayBuffer();
    const tampered = new Uint8Array(bytes);
    tampered[Math.floor(tampered.length / 2)] ^= 0xff;
    const newBlob = new Blob([tampered], { type: 'image/jpeg' });

    setImageBlob(newBlob);
    setImageUrl(URL.createObjectURL(newBlob));
    setTamperApplied('IMAGE_MUTATED');
    runVerification(activeRecord, newBlob);
  };

  // Tamper Action 2: Alter Presumptive Outcome
  const handleTamperOutcome = () => {
    if (!activeRecord) return;
    const fakeOutcome: 'POSITIVE' | 'NEGATIVE' =
      activeRecord.outcome === 'POSITIVE' ? 'NEGATIVE' : 'POSITIVE';
    const tamperedRecord: SignedRecord = {
      ...activeRecord,
      outcome: fakeOutcome,
    };
    setActiveRecord(tamperedRecord);
    setTamperApplied('OUTCOME_ALTERED');
  };

  // Tamper Action 3: Corrupt Chain Link
  const handleTamperChain = () => {
    if (!activeRecord) return;
    const tamperedHash = 'ffff' + activeRecord.previous_record_hash.slice(4);
    const tamperedRecord = {
      ...activeRecord,
      previous_record_hash: tamperedHash,
    };
    setActiveRecord(tamperedRecord);
    setTamperApplied('CHAIN_CORRUPTED');
  };

  // Reset to Pristine Record
  const handleResetTamper = () => {
    if (originalRecord) {
      setActiveRecord(JSON.parse(JSON.stringify(originalRecord)));
    }
    if (originalImageBlob) {
      setImageBlob(originalImageBlob);
      setImageUrl(URL.createObjectURL(originalImageBlob));
    }
    setTamperApplied(null);
  };

  // Handle uploaded JSON file for zero-trust external verification
  const handleUploadJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text) as SignedRecord;
        if (!parsed.record_id || !parsed.signature_der_hex || !parsed.public_key_spki_hex) {
          setUploadError('Invalid record format: missing essential cryptographic signatures');
          return;
        }
        setActiveRecord(parsed);
        setOriginalRecord(parsed);
        setTamperApplied(null);
        setUploadError(null);
        runVerification(parsed, null);
      } catch {
        setUploadError('Invalid JSON: Could not parse uploaded record file');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-lg mx-auto w-full pb-8">
      {uploadError && (
        <div className="p-3 bg-rose-950/70 border border-rose-500/60 rounded-xl text-xs text-rose-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{uploadError}</span>
          </div>
          <button
            onClick={() => setUploadError(null)}
            className="text-xs text-slate-400 hover:text-white ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Cryptographic Evidence Verifier
            </h2>
            <p className="text-xs text-slate-400">
              Independent verification of Digital Signatures & Hash Integrity
            </p>
          </div>
        </div>

        {/* Record Selection Dropdown */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-300 block">
            Select Record to Audit
          </label>
          <select
            value={selectedRecordId}
            onChange={(e) => setSelectedRecordId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
          >
            {records.length === 0 ? (
              <option value="">No stored records yet</option>
            ) : (
              records.map((r) => (
                <option key={r.record_id} value={r.record_id}>
                  {r.case_reference || `Record #${r.record_id.slice(0, 8)}`} — {r.outcome} (
                  {new Date(r.timestamp_utc).toLocaleDateString()})
                </option>
              ))
            )}
          </select>
        </div>

        {/* Upload External Record Option */}
        <div className="pt-1 flex items-center justify-between">
          <label className="cursor-pointer text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium">
            <Upload className="w-3.5 h-3.5" />
            Upload external record.json
            <input type="file" accept=".json" onChange={handleUploadJson} className="hidden" />
          </label>
        </div>
      </div>

      {/* Slim Presumptive Banner */}
      <PresumptiveDisclaimer compact />

      {/* Empty State when no records exist */}
      {records.length === 0 && !activeRecord && (
        <div className="text-center py-10 bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3">
          <Search className="w-10 h-10 text-slate-600 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-200">No test records found to verify</h3>
            <p className="text-xs text-slate-400">
              Capture a field test or load sample data from the Log tab to begin verification.
            </p>
          </div>
        </div>
      )}

      {activeRecord && report && (
        <>
          {/* Main PASS / FAIL Verdict Banner */}
          <div
            className={`p-5 rounded-2xl border shadow-xl flex items-center gap-3.5 transition-colors ${
              report.overallPass
                ? 'bg-gradient-to-br from-emerald-950/70 via-slate-900 to-slate-950 border-emerald-500/50'
                : 'bg-gradient-to-br from-rose-950/70 via-slate-900 to-slate-950 border-rose-500/50'
            }`}
          >
            {report.overallPass ? (
              <ShieldCheck className="w-12 h-12 text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-12 h-12 text-rose-400 shrink-0" />
            )}

            <div>
              <div className="flex items-center gap-2">
                <h3
                  className={`text-xl font-black uppercase tracking-tight ${
                    report.overallPass ? 'text-emerald-300' : 'text-rose-400'
                  }`}
                >
                  {report.overallPass ? 'AUTHENTIC' : 'TAMPERED'}
                </h3>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {report.overallPass
                  ? 'All cryptographic proofs match. Evidence is authentic & unaltered.'
                  : 'Digital record integrity violation detected! Evidentiary chain broken.'}
              </p>
            </div>
          </div>

          {/* Full Presumptive Banner on Verify Results */}
          <PresumptiveDisclaimer compact={false} />

          {/* Tamper Alert Details (if failed) */}
          {!report.overallPass && report.failureReasons.length > 0 && (
            <div className="p-3.5 bg-rose-950/40 border border-rose-500/40 rounded-xl space-y-1.5 text-xs text-rose-200">
              <div className="font-bold text-rose-300 flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-rose-400" />
                Forensic Failure Diagnostics
              </div>
              <ul className="space-y-1 pl-5 list-disc text-[11px] text-rose-200/90 leading-tight">
                {report.failureReasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Tamper Demo Simulation Control Station */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                <Flame className="w-4 h-4" />
                Live Tamper Simulation
              </div>
              {tamperApplied && (
                <button
                  onClick={handleResetTamper}
                  className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 font-semibold cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset to Authentic
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Simulate attacks to demonstrate how modifying even 1 bit of evidence triggers an immediate cryptographic failure.
            </p>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                onClick={handleTamperImage}
                className={`p-2 rounded-lg text-[10px] font-semibold flex flex-col items-center gap-1 border transition-all cursor-pointer ${
                  tamperApplied === 'IMAGE_MUTATED'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                <span>Mutate Image</span>
                <span className="text-[9px] text-slate-500">Corrupt 1 byte</span>
              </button>

              <button
                onClick={handleTamperOutcome}
                className={`p-2 rounded-lg text-[10px] font-semibold flex flex-col items-center gap-1 border transition-all cursor-pointer ${
                  tamperApplied === 'OUTCOME_ALTERED'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                <span>Alter Outcome</span>
                <span className="text-[9px] text-slate-500">Flip Pos/Neg</span>
              </button>

              <button
                onClick={handleTamperChain}
                className={`p-2 rounded-lg text-[10px] font-semibold flex flex-col items-center gap-1 border transition-all cursor-pointer ${
                  tamperApplied === 'CHAIN_CORRUPTED'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                <span>Break Chain</span>
                <span className="text-[9px] text-slate-500">Fake prev_hash</span>
              </button>
            </div>
          </div>

          {/* 4-Point Cryptographic Checklist */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
              Multi-Layer Cryptographic Verification Breakdown
            </span>

            {/* Check 1: Image SHA-256 */}
            <div className="py-2 border-b border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">1. Raw Image SHA-256 Integrity</span>
                <StatusChip status={report.imageHashPass ? 'PASS' : 'TAMPER'} size="xs" />
              </div>
              <div className="text-[9px] font-mono text-slate-500 truncate pl-1">
                Expected: {report.expectedImageHash}
              </div>
            </div>

            {/* Check 2: ECDSA Signature */}
            <div className="py-2 border-b border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">2. ECDSA P-256 Digital Signature</span>
                <StatusChip status={report.signaturePass ? 'PASS' : 'TAMPER'} size="xs" />
              </div>
              <div className="text-[9px] font-mono text-slate-500 pl-1">
                Verified against device SPKI public key (NIST P-256 curve)
              </div>
            </div>

            {/* Check 3: Hash Chain Continuity */}
            <div className="py-2 border-b border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">3. Hash Chain Link Continuity</span>
                <StatusChip status={report.chainPass ? 'PASS' : 'TAMPER'} size="xs" />
              </div>
              <div className="text-[9px] font-mono text-slate-500 truncate pl-1">
                Previous Block: {activeRecord.previous_record_hash}
              </div>
            </div>

            {/* Check 4: Temporal & GPS Sanity */}
            <div className="pt-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">4. Temporal & GPS Sanity Audit</span>
                <StatusChip status={report.gpsPass && report.clockPass ? 'PASS' : 'WARNING'} size="xs" />
              </div>
              <div className="text-[9px] font-mono text-slate-500 pl-1">
                GPS Accuracy: ±{activeRecord.gps.accuracy}m • Clock Skew:{' '}
                {activeRecord.clock_skew_flag ? 'Flagged' : 'Normal'}
              </div>
            </div>
          </div>

          {/* Evidence Image Preview or Clean Empty State */}
          {imageUrl ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col items-center">
              <span className="text-[10px] text-slate-400 font-medium mb-1.5 self-start">
                Evidence image
              </span>
              <img
                src={imageUrl}
                alt="Evidence image"
                className="w-full max-h-48 object-contain rounded-lg border border-slate-800 bg-slate-950"
              />
            </div>
          ) : (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-1.5">
              <ImageOff className="w-8 h-8 text-slate-600 mb-1" />
              <span className="text-xs font-semibold text-slate-300">No evidence image available</span>
              <span className="text-[11px] text-slate-500">Binary image data was not recorded for this test</span>
            </div>
          )}
        </>
      )}
    </div>
  );
};
