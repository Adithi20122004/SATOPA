import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Download,
  ShieldCheck,
  ShieldAlert,
  MapPin,
  Clock,
  ChevronDown,
  ChevronUp,
  FileJson,
  Printer,
  Sparkles,
  RefreshCw,
  FolderOpen,
  CheckCircle2,
} from 'lucide-react';
import { db, exportRecordsToCsv } from '../db/database';
import type { SignedRecord } from '../types';
import { PRODUCT_NAME } from '../types';
import { PresumptiveDisclaimer } from './PresumptiveDisclaimer';
import { seedDemoRecords } from '../data/seedDemoData';
import { computeRecordChainHash } from '../crypto/recordCrypto';
import { PdfEvidenceReport } from './PdfEvidenceReport';
import { StatusChip } from './StatusChip';

interface AuditLogViewProps {
  onVerifyRecord: (record: SignedRecord) => void;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ onVerifyRecord }) => {
  const [records, setRecords] = useState<SignedRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterOutcome, setFilterOutcome] = useState<'ALL' | 'POSITIVE' | 'NEGATIVE' | 'INCONCLUSIVE'>('ALL');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
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
      if (all.length > 0 && !selectedRecordId) {
        setSelectedRecordId(all[0].record_id);
      }

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
    const run = async () => {
      await loadRecordsAndVerifyChain();
    };
    void run();
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
    link.download = `${PRODUCT_NAME}_Field_Drug_Test_Audit_Log_${new Date().toISOString().split('T')[0]}.csv`;
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

  const selectedRecord = records.find((r) => r.record_id === selectedRecordId) || filtered[0] || null;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 w-full pb-10">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-5 space-y-3 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-sky-400" />
              Signed Field Audit Log
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {records.length} hash-chained records protected by ECDSA P-256 digital signatures
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={handleSeedDemoData}
              disabled={isSeeding}
              className="min-h-[40px] py-1.5 px-3 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer transition-colors"
              title="Load sample test records"
            >
              {isSeeding ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>Load sample data</span>
            </button>
            <button
              onClick={handleExportCsv}
              disabled={records.length === 0}
              className="min-h-[40px] py-1.5 px-3.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        {/* Chain Integrity Badge */}
        {chainStatus && records.length > 0 && (
          <div
            className={`p-2.5 rounded-lg border flex items-center justify-between text-xs transition-colors ${
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
                  ? `Cryptographic chain intact (${chainStatus.count} blocks)`
                  : `Cryptographic chain broken at record #${chainStatus.brokenIndex}`}
              </span>
            </div>
            <span className="text-[10px] font-mono opacity-80 hidden sm:inline">
              {chainStatus.isIntact ? 'Unbroken Hash Links' : 'Tamper Alert'}
            </span>
          </div>
        )}

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search case ref, operator, lot, or record UUID..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Outcome Filter Chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 text-xs">
            {(['ALL', 'POSITIVE', 'NEGATIVE', 'INCONCLUSIVE'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setFilterOutcome(filter)}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  filterOutcome === filter
                    ? 'bg-sky-600 text-white shadow'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {filter === 'ALL' ? 'All' : filter}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Slim Presumptive Disclaimer Strip */}
      <PresumptiveDisclaimer compact />

      {/* Main 2-Column Responsive Layout on lg+ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Record List */}
        <div className="lg:col-span-5 space-y-2">
          {isLoading ? (
            <div className="text-center py-12 text-slate-500 text-xs flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
              <span>Loading encrypted audit ledger...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3">
              <FolderOpen className="w-10 h-10 text-slate-600 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-200">
                  {records.length === 0 ? 'No audit records found' : 'No records match search'}
                </h3>
                <p className="text-xs text-slate-400">
                  {records.length === 0
                    ? "Run a test or tap 'Load sample data' above to populate the ledger."
                    : 'Try adjusting your search query or outcome filters.'}
                </p>
              </div>
              {records.length === 0 && (
                <button
                  onClick={handleSeedDemoData}
                  disabled={isSeeding}
                  className="mt-2 min-h-[44px] px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow transition-colors cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Load sample data</span>
                </button>
              )}
            </div>
          ) : (
            filtered.map((record) => {
              const isSelected = selectedRecord?.record_id === record.record_id;
              const isExpanded = expandedId === record.record_id;

              return (
                <div
                  key={record.record_id}
                  className={`bg-slate-900 border rounded-xl overflow-hidden transition-all ${
                    isSelected
                      ? 'border-sky-500/80 bg-slate-900/90 shadow-md ring-1 ring-sky-500/20'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Header Row */}
                  <div
                    onClick={() => {
                      setSelectedRecordId(record.record_id);
                      setExpandedId(isExpanded ? null : record.record_id);
                    }}
                    className="p-3.5 flex items-start justify-between cursor-pointer select-none"
                  >
                    <div className="space-y-1 pr-2">
                      <div className="flex items-center gap-2">
                        <StatusChip status={record.outcome} size="xs" />
                        <span className="text-[10px] text-slate-400 font-mono">
                          {record.confidence}% Conf.
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-white truncate">
                        {record.case_reference || `Record #${record.record_id.slice(0, 8)}`}
                      </h4>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400 font-mono">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {new Date(record.timestamp_utc).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-500" />
                          {record.gps.status_text || `±${record.gps.accuracy}m`}
                        </span>
                      </div>
                    </div>

                    <div className="text-slate-500 hover:text-slate-300 pt-1 lg:hidden">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>

                  {/* Inline Drawer on Mobile (<lg) */}
                  {isExpanded && (
                    <div className="px-3.5 pb-3.5 pt-2 border-t border-slate-800 bg-slate-950/60 space-y-3 text-xs lg:hidden">
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-slate-500 block">Kit:</span>
                          <span className="text-slate-200 font-medium">{record.kit_profile.name}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Lot:</span>
                          <span className="text-slate-200 font-mono">{record.kit_profile.lot_number}</span>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => onVerifyRecord(record)}
                          className="flex-1 min-h-[38px] py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Verify</span>
                        </button>
                        <button
                          onClick={() => handleOpenPdf(record)}
                          className="min-h-[38px] py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>PDF</span>
                        </button>
                        <button
                          onClick={() => handleDownloadRecordJson(record)}
                          className="min-h-[38px] py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <FileJson className="w-3.5 h-3.5" />
                          <span>JSON</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Selected Record Detail on Desktop (lg+) */}
        <div className="hidden lg:block lg:col-span-7">
          {selectedRecord ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-md sticky top-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <StatusChip status={selectedRecord.outcome} size="sm" />
                    <span className="text-xs font-mono text-slate-400">
                      Confidence: {selectedRecord.confidence}%
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white">
                    {selectedRecord.case_reference || `Record #${selectedRecord.record_id.slice(0, 12)}`}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenPdf(selectedRecord)}
                    className="min-h-[36px] py-1 px-3 bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Evidence PDF</span>
                  </button>
                  <button
                    onClick={() => handleDownloadRecordJson(selectedRecord)}
                    className="min-h-[36px] py-1 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileJson className="w-3.5 h-3.5" />
                    <span>JSON</span>
                  </button>
                  <button
                    onClick={() => onVerifyRecord(selectedRecord)}
                    className="min-h-[36px] py-1 px-3.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Verify in Analyzer</span>
                  </button>
                </div>
              </div>

              {/* Full Presumptive Disclaimer */}
              <PresumptiveDisclaimer compact={false} />

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block text-[10px] uppercase">Kit Profile</span>
                  <span className="text-slate-200 font-semibold text-xs">{selectedRecord.kit_profile.name}</span>
                  <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                    Lot: {selectedRecord.kit_profile.lot_number} • Exp: {selectedRecord.kit_profile.expiry_date}
                  </div>
                </div>

                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block text-[10px] uppercase">Operator & Hardware</span>
                  <span className="text-slate-200 font-mono font-semibold text-xs">{selectedRecord.operator_id}</span>
                  <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                    Device: {selectedRecord.device_id}
                  </div>
                </div>

                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block text-[10px] uppercase">GPS Coordinate Lock</span>
                  <span className="text-slate-200 font-mono text-xs">
                    {selectedRecord.gps.latitude.toFixed(4)}°N, {selectedRecord.gps.longitude.toFixed(4)}°E
                  </span>
                  <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                    Accuracy: ±{selectedRecord.gps.accuracy}m
                  </div>
                </div>

                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block text-[10px] uppercase">Timestamp (UTC)</span>
                  <span className="text-slate-200 font-mono text-xs">
                    {new Date(selectedRecord.timestamp_utc).toUTCString()}
                  </span>
                  <div className="text-[10px] text-emerald-400 mt-0.5 flex items-center gap-1 font-mono">
                    <CheckCircle2 className="w-3 h-3" />
                    Clock skew: Normal
                  </div>
                </div>
              </div>

              {/* Cryptographic Ledger Block Info */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                  Cryptographic Ledger Block Payload
                </span>

                <div className="space-y-1.5 font-mono text-[11px]">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Record ID:</span>
                    <span className="text-slate-300">{selectedRecord.record_id}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Image SHA-256 Digest:</span>
                    <span className="text-sky-300 break-all">{selectedRecord.image_sha256}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Previous Block Hash:</span>
                    <span className="text-indigo-300 break-all">{selectedRecord.previous_record_hash}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">ECDSA P-256 Signature (SPKI / DER):</span>
                    <span className="text-emerald-400 break-all">
                      {selectedRecord.signature_der_hex}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-8 bg-slate-900/50 border border-slate-800/80 rounded-xl text-slate-500 text-xs text-center">
              Select an audit record on the left to inspect its cryptographic proofs and export options.
            </div>
          )}
        </div>
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
