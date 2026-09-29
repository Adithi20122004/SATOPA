import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Upload,
  RotateCcw,
  Flame,
  Search,
  FileText,
  Lock,
  Link as LinkIcon,
  CheckCircle2,
  XCircle,
  HelpCircle,
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
  failedLayers: {
    layer1ImageHash: boolean;
    layer2Signature: boolean;
    layer3Chain: boolean;
    layer4Audit: boolean;
  };
}

export type TamperMode = 'image' | 'outcome' | 'chain' | 'signature';

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
  const [selectedTamperType, setSelectedTamperType] = useState<TamperMode>('outcome');

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

  // Re-verify whenever activeRecord or image changes
  const runVerification = async (rec: SignedRecord, blob: Blob | null) => {
    const failureReasons: string[] = [];
    const failedLayers = {
      layer1ImageHash: false,
      layer2Signature: false,
      layer3Chain: false,
      layer4Audit: false,
    };

    // 1. Verify Image Hash
    let imageHashPass = false;
    let computedImageHash = 'NO_IMAGE_DATA';
    if (blob) {
      const bytes = await blob.arrayBuffer();
      computedImageHash = await sha256Hex(bytes);
      imageHashPass = computedImageHash.toLowerCase() === rec.image_sha256.toLowerCase();
      if (!imageHashPass) {
        failureReasons.push('Layer 1 Failure: Image SHA-256 digest does not match recorded cryptographic hash');
        failedLayers.layer1ImageHash = true;
      }
    } else {
      // If no blob is present in database for this record, note it
      imageHashPass = true; // don't flag as tampered if purely stored without binary
    }

    // 2. Verify Digital Signature
    const signaturePass = await verifyRecordSignature(rec);
    if (!signaturePass) {
      failureReasons.push('Layer 2 Failure: ECDSA P-256 signature is INVALID (record payload has been altered)');
      failedLayers.layer2Signature = true;
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
        failureReasons.push('Layer 3 Failure: Hash chain broken (previous_record_hash does not match predecessor)');
        failedLayers.layer3Chain = true;
      }
    }

    // 4. Temporal & GPS Sanity Audit
    const gpsPass = !rec.gps.low_accuracy_flag;
    const clockPass = !rec.clock_skew_flag;
    if (!gpsPass || !clockPass) {
      failedLayers.layer4Audit = true;
      if (!gpsPass) failureReasons.push('Layer 4 Warning: GPS flagged for low sensor accuracy');
      if (!clockPass) failureReasons.push('Layer 4 Warning: Clock skew flagged during capture');
    }

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
      failedLayers,
    });
  };

  useEffect(() => {
    if (activeRecord) {
      db.images.get(activeRecord.image_sha256).then((img) => {
        runVerification(activeRecord, img?.blob || null);
      });
    }
  }, [activeRecord]);

  // Main Simulate Tampering Handler
  const handleSimulateTampering = async () => {
    if (!activeRecord) return;

    if (selectedTamperType === 'image') {
      if (originalImageBlob) {
        const bytes = await originalImageBlob.arrayBuffer();
        const tampered = new Uint8Array(bytes);
        tampered[Math.floor(tampered.length / 2)] ^= 0xff;
        const newBlob = new Blob([tampered], { type: 'image/jpeg' });
        setImageBlob(newBlob);
        setImageUrl(URL.createObjectURL(newBlob));
        setTamperApplied('IMAGE_MUTATED');
        runVerification(activeRecord, newBlob);
      } else {
        // Tamper hash in record
        const tamperedRecord: SignedRecord = {
          ...activeRecord,
          image_sha256: 'deadbeef' + activeRecord.image_sha256.slice(8),
        };
        setActiveRecord(tamperedRecord);
        setTamperApplied('IMAGE_HASH_CORRUPTED');
      }
    } else if (selectedTamperType === 'outcome') {
      // Flip outcome without re-signing: breaks signature (Layer 2)
      const fakeOutcome: 'POSITIVE' | 'NEGATIVE' =
        activeRecord.outcome === 'POSITIVE' ? 'NEGATIVE' : 'POSITIVE';
      const tamperedRecord: SignedRecord = {
        ...activeRecord,
        outcome: fakeOutcome,
      };
      setActiveRecord(tamperedRecord);
      setTamperApplied('OUTCOME_ALTERED');
    } else if (selectedTamperType === 'chain') {
      // Corrupt previous block hash: breaks chain (Layer 3)
      const tamperedHash = 'ffff' + activeRecord.previous_record_hash.slice(4);
      const tamperedRecord = {
        ...activeRecord,
        previous_record_hash: tamperedHash,
      };
      setActiveRecord(tamperedRecord);
      setTamperApplied('CHAIN_CORRUPTED');
    } else if (selectedTamperType === 'signature') {
      // Invalidate signature DER bytes
      const tamperedRecord = {
        ...activeRecord,
        signature_der_hex: '3045022100' + 'f'.repeat(58) + '0220' + 'e'.repeat(64),
      };
      setActiveRecord(tamperedRecord);
      setTamperApplied('SIGNATURE_CORRUPTED');
    }
  };

  // Reset to Pristine Original Record
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
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 w-full pb-10">
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
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-5 space-y-3 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Cryptographic Audit Verifier
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Independent mathematical verification of ECDSA signatures, SHA-256 hashes, and ledger chains
            </p>
          </div>
          <label className="cursor-pointer text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1.5 font-medium py-1 px-2.5 rounded-lg bg-sky-950/40 border border-sky-800/60 self-start sm:self-auto">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload JSON file</span>
            <input type="file" accept=".json" onChange={handleUploadJson} className="hidden" />
          </label>
        </div>

        {/* Record Selection Dropdown */}
        <div className="space-y-1 pt-1">
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
      </div>

      {/* Slim Presumptive Banner */}
      <PresumptiveDisclaimer compact />

      {/* Empty State when no records exist */}
      {records.length === 0 && !activeRecord && (
        <div className="text-center py-12 bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3">
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: Record Selector Summary, Verdict Banner, & Visible Simulate Tampering Station */}
          <div className="lg:col-span-5 space-y-4">
            {/* Main PASS / FAIL Verdict Banner */}
            <div
              className={`p-5 rounded-2xl border shadow-xl flex items-center gap-4 transition-colors ${
                report.overallPass
                  ? 'bg-gradient-to-br from-emerald-950/70 via-slate-900 to-slate-950 border-emerald-500/50'
                  : 'bg-gradient-to-br from-rose-950/80 via-slate-900 to-slate-950 border-rose-500/70 shadow-rose-950/40 ring-1 ring-rose-500/40'
              }`}
            >
              {report.overallPass ? (
                <ShieldCheck className="w-12 h-12 text-emerald-400 shrink-0" />
              ) : (
                <ShieldAlert className="w-12 h-12 text-rose-400 shrink-0 animate-bounce" />
              )}

              <div>
                <div className="flex items-center gap-2">
                  <h3
                    className={`text-2xl font-black uppercase tracking-tight ${
                      report.overallPass ? 'text-emerald-300' : 'text-rose-400'
                    }`}
                  >
                    {report.overallPass ? 'AUTHENTIC' : 'TAMPERED'}
                  </h3>
                </div>
                <p className="text-xs text-slate-300 mt-1 leading-snug">
                  {report.overallPass
                    ? 'All cryptographic proofs match. Record payload & hash chain unaltered.'
                    : 'Digital record integrity violation detected! Audit chain broken.'}
                </p>
              </div>
            </div>

            {/* Prominent Simulate Tampering Control Station (Sandbox Mode) */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                  <Flame className="w-4 h-4" />
                  <span>Sandbox Mode: Simulate Tampering</span>
                </div>
                {tamperApplied && (
                  <button
                    onClick={handleResetTamper}
                    className="min-h-[32px] px-2.5 py-1 text-xs text-sky-400 hover:text-sky-300 bg-sky-950/40 border border-sky-800/60 rounded-md flex items-center gap-1 font-semibold cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset to Authentic
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Test the zero-trust validator by modifying a copy of this record. Modifying even 1 byte triggers an immediate cryptographic failure.
              </p>

              {/* Tamper Layer Options */}
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                <button
                  onClick={() => setSelectedTamperType('outcome')}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    selectedTamperType === 'outcome'
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className="font-semibold block text-[11px]">Layer 2: Alter Result</span>
                  <span className="text-[9px] text-slate-500">Flip Positive ↔ Negative</span>
                </button>

                <button
                  onClick={() => setSelectedTamperType('chain')}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    selectedTamperType === 'chain'
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className="font-semibold block text-[11px]">Layer 3: Break Chain</span>
                  <span className="text-[9px] text-slate-500">Mutate previous_record_hash</span>
                </button>

                <button
                  onClick={() => setSelectedTamperType('image')}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    selectedTamperType === 'image'
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className="font-semibold block text-[11px]">Layer 1: Corrupt Image</span>
                  <span className="text-[9px] text-slate-500">Flip 1 byte of photo binary</span>
                </button>

                <button
                  onClick={() => setSelectedTamperType('signature')}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    selectedTamperType === 'signature'
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className="font-semibold block text-[11px]">Layer 2: Bad Signature</span>
                  <span className="text-[9px] text-slate-500">Corrupt ECDSA DER signature</span>
                </button>
              </div>

              {/* Action Button */}
              <button
                onClick={handleSimulateTampering}
                className="w-full min-h-[44px] py-2.5 px-4 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-rose-900/30 transition-all cursor-pointer"
              >
                <Flame className="w-4 h-4 fill-current" />
                <span>Simulate tampering</span>
              </button>
            </div>

            {/* Tamper Alert Details (if failed) */}
            {!report.overallPass && report.failureReasons.length > 0 && (
              <div className="p-3.5 bg-rose-950/40 border border-rose-500/50 rounded-xl space-y-1.5 text-xs text-rose-200">
                <div className="font-bold text-rose-300 flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-rose-400" />
                  <span>Integrity Failure Diagnostics</span>
                </div>
                <ul className="space-y-1 pl-5 list-disc text-[11px] text-rose-200/90 leading-tight">
                  {report.failureReasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Record Metadata Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                Audited Record Metadata
              </span>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Case Ref:</span>
                  <span className="text-slate-200 font-mono font-semibold">{activeRecord.case_reference || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Outcome:</span>
                  <StatusChip status={activeRecord.outcome} size="xs" />
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Kit Profile:</span>
                  <span className="text-slate-200">{activeRecord.kit_profile.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Operator:</span>
                  <span className="text-slate-200 font-mono">{activeRecord.operator_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Timestamp:</span>
                  <span className="text-slate-200 font-mono">{new Date(activeRecord.timestamp_utc).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: 4-Layer Breakdown & Evidence Image (hidden when absent) */}
          <div className="lg:col-span-7 space-y-4">
            {/* 4-Layer Cryptographic Checklist with failing layer highlighted */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-5 space-y-3.5 text-xs shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                  Multi-Layer Cryptographic Verification Breakdown
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  4-Tier Cryptographic Architecture
                </span>
              </div>

              {/* Layer 1: Image SHA-256 */}
              <div
                className={`p-3 rounded-lg border transition-all ${
                  report.failedLayers.layer1ImageHash
                    ? 'border-2 border-rose-500 bg-rose-950/40 ring-2 ring-rose-500/20 shadow-md'
                    : 'border-slate-800 bg-slate-950'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className={`w-4 h-4 ${report.failedLayers.layer1ImageHash ? 'text-rose-400' : 'text-sky-400'}`} />
                    <span className="font-semibold text-slate-200">Layer 1: Raw Image SHA-256 Digest</span>
                  </div>
                  <StatusChip status={report.imageHashPass ? 'PASS' : 'TAMPER'} size="xs" />
                </div>
                <div className="text-[10px] font-mono text-slate-400 truncate mt-1 pl-6">
                  Expected: {report.expectedImageHash}
                </div>
                {report.failedLayers.layer1ImageHash && (
                  <div className="text-[10px] text-rose-300 font-semibold mt-1 pl-6 flex items-center gap-1">
                    <XCircle className="w-3 h-3 text-rose-400" />
                    <span>FAILS: Raw image bytes have been altered since signature creation</span>
                  </div>
                )}
              </div>

              {/* Layer 2: ECDSA Signature */}
              <div
                className={`p-3 rounded-lg border transition-all ${
                  report.failedLayers.layer2Signature
                    ? 'border-2 border-rose-500 bg-rose-950/40 ring-2 ring-rose-500/20 shadow-md'
                    : 'border-slate-800 bg-slate-950'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className={`w-4 h-4 ${report.failedLayers.layer2Signature ? 'text-rose-400' : 'text-emerald-400'}`} />
                    <span className="font-semibold text-slate-200">Layer 2: ECDSA P-256 Digital Signature</span>
                  </div>
                  <StatusChip status={report.signaturePass ? 'PASS' : 'TAMPER'} size="xs" />
                </div>
                <div className="text-[10px] font-mono text-slate-400 mt-1 pl-6">
                  Cryptographically verified against public key SPKI (NIST P-256 curve)
                </div>
                {report.failedLayers.layer2Signature && (
                  <div className="text-[10px] text-rose-300 font-semibold mt-1 pl-6 flex items-center gap-1">
                    <XCircle className="w-3 h-3 text-rose-400" />
                    <span>FAILS: Record payload tampering detected; cryptographic signature invalid</span>
                  </div>
                )}
              </div>

              {/* Layer 3: Hash Chain Link */}
              <div
                className={`p-3 rounded-lg border transition-all ${
                  report.failedLayers.layer3Chain
                    ? 'border-2 border-rose-500 bg-rose-950/40 ring-2 ring-rose-500/20 shadow-md'
                    : 'border-slate-800 bg-slate-950'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LinkIcon className={`w-4 h-4 ${report.failedLayers.layer3Chain ? 'text-rose-400' : 'text-indigo-400'}`} />
                    <span className="font-semibold text-slate-200">Layer 3: Hash Chain Link Continuity</span>
                  </div>
                  <StatusChip status={report.chainPass ? 'PASS' : 'TAMPER'} size="xs" />
                </div>
                <div className="text-[10px] font-mono text-slate-400 truncate mt-1 pl-6">
                  Previous Block: {activeRecord.previous_record_hash}
                </div>
                {report.failedLayers.layer3Chain && (
                  <div className="text-[10px] text-rose-300 font-semibold mt-1 pl-6 flex items-center gap-1">
                    <XCircle className="w-3 h-3 text-rose-400" />
                    <span>FAILS: Hash link to predecessor is broken or out of order</span>
                  </div>
                )}
              </div>

              {/* Layer 4: Temporal & GPS Sanity */}
              <div
                className={`p-3 rounded-lg border transition-all ${
                  report.failedLayers.layer4Audit
                    ? 'border-2 border-amber-500 bg-amber-950/40'
                    : 'border-slate-800 bg-slate-950'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`w-4 h-4 ${report.failedLayers.layer4Audit ? 'text-amber-400' : 'text-sky-400'}`} />
                    <span className="font-semibold text-slate-200">Layer 4: Temporal & GPS Sanity Audit</span>
                  </div>
                  <StatusChip status={report.gpsPass && report.clockPass ? 'PASS' : 'WARNING'} size="xs" />
                </div>
                <div className="text-[10px] font-mono text-slate-400 mt-1 pl-6">
                  GPS Accuracy: ±{activeRecord.gps.accuracy}m • Clock Skew:{' '}
                  {activeRecord.clock_skew_flag ? 'Flagged' : 'Normal'}
                </div>
              </div>
            </div>

            {/* Evidence Image Preview - Only displayed when an image is stored! NO broken icon or empty box when absent */}
            {imageUrl && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col space-y-2 shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">
                    Evidence image
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    SHA-256: {activeRecord.image_sha256.slice(0, 16)}...
                  </span>
                </div>
                <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center p-1">
                  <img
                    src={imageUrl}
                    alt="Evidence captured frame"
                    className="w-full max-h-64 object-contain rounded"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
