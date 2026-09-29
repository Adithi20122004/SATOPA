import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  MapPin,
  Clock,
  ChevronDown,
  ChevronUp,
  FileJson
} from 'lucide-react';
import { db, exportRecordsToCsv } from '../db/database';
import type { SignedRecord } from '../types';
import { PresumptiveDisclaimer } from './PresumptiveDisclaimer';

interface AuditLogViewProps {
  onVerifyRecord: (record: SignedRecord) => void;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ onVerifyRecord }) => {
  const [records, setRecords] = useState<SignedRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterOutcome, setFilterOutcome] = useState<'ALL' | 'POSITIVE' | 'NEGATIVE' | 'INCONCLUSIVE'>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadRecords = async () => {
    setIsLoading(true);
    try {
      const all = await db.records.orderBy('timestamp_utc').reverse().toArray();
      setRecords(all);
    } catch (e) {
      console.error('Failed to load audit records:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

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
          <button
            onClick={handleExportCsv}
            disabled={records.length === 0}
            className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        </div>

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

      <PresumptiveDisclaimer compact />

      {/* Record List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-8 text-xs text-slate-500">Loading audit records...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-2">
            <FileText className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-400 font-medium">No audit records found</p>
            <p className="text-[11px] text-slate-600">
              Run a test from the Test tab to generate a cryptographically signed field record.
            </p>
          </div>
        ) : (
          filtered.map((record) => {
            const isExpanded = expandedId === record.record_id;
            const outcomeBadge = {
              POSITIVE: { bg: 'bg-rose-500/20 text-rose-300 border-rose-500/30', icon: XCircle },
              NEGATIVE: { bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: CheckCircle2 },
              INCONCLUSIVE: { bg: 'bg-amber-500/20 text-amber-300 border-amber-500/30', icon: AlertTriangle },
            }[record.outcome];
            const OutcomeIcon = outcomeBadge.icon;

            return (
              <div
                key={record.record_id}
                className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden transition-all shadow-sm"
              >
                {/* Main Card Header */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : record.record_id)}
                  className="p-3.5 cursor-pointer hover:bg-slate-800/40 transition-colors flex items-start justify-between gap-3"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${outcomeBadge.bg}`}>
                        <OutcomeIcon className="w-3 h-3" />
                        {record.outcome}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {record.confidence}% Conf.
                      </span>
                      {record.signature_der_hex && (
                        <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                          <ShieldCheck className="w-3 h-3" />
                          Signed
                        </span>
                      )}
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
                        ±{record.gps.accuracy}m
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

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => onVerifyRecord(record)}
                        className="flex-1 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Verify in Analyzer
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
    </div>
  );
};
