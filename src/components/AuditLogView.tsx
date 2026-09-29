import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  MapPin,
  Clock,
  ChevronDown,
  ChevronUp,
  FileJson,
  Printer,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { db, exportRecordsToCsv } from '../db/database';
import type { SignedRecord } from '../types';
import { PresumptiveDisclaimer } from './PresumptiveDisclaimer';
import { seedDemoRecords } from '../data/seedDemoData';
import { computeRecordChainHash } from '../crypto/recordCrypto';
import { PdfEvidenceReport } from './PdfEvidenceReport';

interface AuditLogViewProps {
  onVerifyRecord: (record: SignedRecord) => void;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ onVerifyRecord }) => {
  const [records, setRecords] = useState<SignedRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterOutcome, setFilterOutcome] = useState<'ALL' | 'POSITIVE' | 'NEGATIVE' | 'INCONCLUSIVE'>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [chainStatus, setChainStatus] = useState<{ isIntact: boolean; count: number; brokenIndex?: number } | null>(
    null
  );
  const [pdfRecord, setPdfRecord] = useState<{ record: SignedRecord; imageUrl?: string } | null>(null);

  const loadRecordsAndVerifyChain = async () => {
    setIsLoading(true);
    try {
      const all = await db.records.orderBy('timestamp_utc').reverse().toArray();
      setRecords(all);

      // Verify chain integrity in chronological order (oldest to newest)
      const chronological = [...all].reverse();
      let brokenIdx: number | undefined = undefined;

      for (let i = 0; i < chronological.length; i++) {
        const cur = chronological[i];
        if (i === 0) {
          continue;
        }
        const expectedPrevHash = await computeRecordChainHash(chronological[i - 1]);
        if (cur.previous_record_hash !== expectedPrevHash) {
          brokenIdx = i + 1; // 1-indexed record number
          break;
        }
      }

      setChainStatus({
        isIntact: brokenIdx === undefined,
        count: all.length,
        brokenIndex: brokenIdx,
      });
    } catch (e) {
      console.error('Failed to load audit records:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecordsAndVerifyChain();
  }, []);

  const handleSeedDemoData = async () => {
    if (isSeeding) return;
    setIsSeeding(true);
    try {
      await seedDemoRecords();
      await loadRecordsAndVerifyChain();
    } catch (err) {
      console.error('Failed to seed demo records:', err);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleExportCsv = async () => {
    const csv = await exportRecordsToCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `MHA_Field_Drug_Test_Audit_Log_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadRecordJson = (record: SignedRecord) => {
    const jsonStr = JSON.stringify(record, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Record_${record.record_id.slice(0, 8)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleOpenPdf = async (record: SignedRecord) => {
    let imgUrl: string | undefined = undefined;
    try {
      const img = await db.images.get(record.image_sha256);
      if (img?.blob) {
        imgUrl = URL.createObjectURL(img.blob);
      }
    } catch (e) {
      console.warn('Could not load cached image blob for PDF:', e);
    }
    setPdfRecord({ record, imageUrl: imgUrl });
  };

  // Filter records
  const filtered = records.filter((r) => {
    if (filterOutcome !== 'ALL' && r.outcome !== filterOutcome) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCase = r.case_reference?.toLowerCase().includes(q);
      const matchOp = r.operator_id.toLowerCase().includes(q);
      const matchId = r.record_id.toLowerCase().includes(q);
      const matchLot = r.kit_profile.lot_number.toLowerCase().includes(q);
      const matchKit = r.kit_profile.name.toLowerCase().includes(q);
      if (!matchCase && !matchOp && !matchId && !matchLot && !matchKit) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-lg mx-auto w-full pb-8">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-sky-400" />
              Signed Field Audit Log
            </h2>
            <p className="text-xs text-slate-400">
              {records.length} Hash-Chained Records • ECDSA P-256 Protected
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSeedDemoData}
              disabled={isSeeding}
              className="py-1.5 px-2.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm disabled:opacity-50"
              title="Insert 6 authentic sample records for demonstration"
            >
              {isSeeding ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-emerald-400" />}
              <span>Demo Data</span>
            </button>
            <button
              onClick={handleExportCsv}
              disabled={records.length === 0}
              className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
          </div>
        </div>

        {/* Chain Integrity Badge */}
        {chainStatus && records.length > 0 && (
          <div
            className={`p-2.5 rounded-lg border flex items-center justify-between text-xs ${
              chainStatus.isIntact
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/50 border-rose-500/60 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {chainStatus.isIntact ? (
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span className="font-semibold">
                {chainStatus.isIntact
                  ? `Chain intact (${chainStatus.count} records)`
                  : `Chain broken at record #${chainStatus.brokenIndex}`}
              </span>
            </div>
            <span className="text-[10px] font-mono opacity-80">
              {chainStatus.isIntact ? 'Unbroken Hash Links' : 'Tamper Alert'}
            </span>
          </div>
        )}

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search case ref, operator, lot, or UUID..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
          />
        </div>

        {/* Outcome Filter Chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
          {(['ALL', 'POSITIVE', 'NEGATIVE', 'INCONCLUSIVE'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setFilterOutcome(filter)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors shrink-0 ${
                filterOutcome === filter
                  ? 'bg-sky-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Mandatory Statutory Disclaimer */}
      <PresumptiveDisclaimer compact />

      {/* Records List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="text-center py-12 text-slate-500 text-xs">Loading encrypted ledger...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3">
            <FileText className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-400">
              {records.length === 0 ? 'No test records in local database.' : 'No records match search criteria.'}
            </p>
            {records.length === 0 && (
              <button
                onClick={handleSeedDemoData}
                disabled={isSeeding}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Load 6 Demo Test Records
              </button>
            )}
          </div>
        ) : (
          filtered.map((record) => {
            const isExpanded = expandedId === record.record_id;
            const badgeClass = {
              POSITIVE: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
              NEGATIVE: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
              INCONCLUSIVE: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
            }[record.outcome];

            return (
              <div
                key={record.record_id}
                className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-all"
              >
                {/* Header Row (Click to Expand) */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : record.record_id)}
                  className="p-3.5 flex items-start justify-between cursor-pointer select-none"
                >
                  <div className="space-y-1 pr-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeClass}`}>
                        {record.outcome}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {record.confidence}% Conf.
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-white truncate">
                      {record.case_reference || `Record #${record.record_id.slice(0, 8)}`}
                    </h4>
                    <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {new Date(record.timestamp_utc).toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-500" />
                        {record.gps.status_text || `±${record.gps.accuracy}m`}
                      </span>
                    </div>
                  </div>

                  <div className="text-slate-500 hover:text-slate-300 pt-1">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>

                {/* Expanded Details Drawer */}
                {isExpanded && (
                  <div className="px-3.5 pb-3.5 pt-2 border-t border-slate-800 bg-slate-950/60 space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-500 block">Kit Reagent:</span>
                        <span className="text-slate-200 font-medium">{record.kit_profile.name}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Kit Lot:</span>
                        <span className="text-slate-200 font-mono">{record.kit_profile.lot_number}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Officer ID:</span>
                        <span className="text-slate-200 font-mono">{record.operator_id}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Device ID:</span>
                        <span className="text-slate-200 font-mono">{record.device_id}</span>
                      </div>
                    </div>

                    {/* Hash Chain Details */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 space-y-1.5 text-[10px] font-mono">
                      <div>
                        <span className="text-slate-500 block">Image SHA-256 Digest:</span>
                        <span className="text-sky-300 break-all">{record.image_sha256}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Previous Record Hash (Chain):</span>
                        <span className="text-indigo-300 break-all">{record.previous_record_hash}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">ECDSA P-256 Signature (Hex):</span>
                        <span className="text-emerald-400 break-all">
                          {record.signature_der_hex?.slice(0, 48)}...
                        </span>
                      </div>
                    </div>

                    {/* Actions: Verify in Analyzer, Download JSON, Print PDF */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => onVerifyRecord(record)}
                        className="flex-1 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Verify in Analyzer
                      </button>
                      <button
                        onClick={() => handleOpenPdf(record)}
                        className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1"
                        title="Export Court Evidence PDF"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        PDF
                      </button>
                      <button
                        onClick={() => handleDownloadRecordJson(record)}
                        className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1"
                        title="Download JSON Record"
                      >
                        <FileJson className="w-3.5 h-3.5" />
                        JSON
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* PDF Modal */}
      {pdfRecord && (
        <PdfEvidenceReport
          record={pdfRecord.record}
          imageUrl={pdfRecord.imageUrl}
          onClose={() => setPdfRecord(null)}
        />
      )}
    </div>
  );
};
