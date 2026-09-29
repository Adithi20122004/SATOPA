import React, { useRef } from 'react';
import { Printer, Download, Info } from 'lucide-react';
import {
  CARD_WIDTH,
  CARD_HEIGHT,
  ARUCO_MARKERS,
  REFERENCE_PATCHES,
  RESULT_WINDOW_RECT,
} from '../vision/referenceCard';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '../types';

export const PrintableCardView: React.FC = () => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadSvg = () => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${PRODUCT_NAME}_Calibration_Card_A6.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPng = () => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = CARD_WIDTH * 2; // 1200 x 1700 high-res
      canvas.height = CARD_HEIGHT * 2;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = `${PRODUCT_NAME}_Calibration_Card_A6.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-xl mx-auto w-full">
      {/* Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Printer className="w-5 h-5 text-sky-400" />
              Field Calibration Reference Card
            </h2>
            <p className="text-xs text-slate-400">
              A6 Standard Format (105 × 148 mm) for Colorimetric Drug Test Verification
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handlePrint}
            className="flex-1 py-2 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow"
          >
            <Printer className="w-4 h-4" />
            Print Card (A6)
          </button>
          <button
            onClick={handleDownloadPng}
            className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            Download PNG
          </button>
          <button
            onClick={handleDownloadSvg}
            className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
            title="Download Vector SVG"
          >
            SVG
          </button>
        </div>
      </div>

      {/* Card Preview Window */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex flex-col items-center">
        <div className="w-full max-w-[380px] bg-white rounded-lg shadow-2xl overflow-hidden border border-slate-300 print:border-none print:shadow-none">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}
            className="w-full h-auto block bg-white"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Card Background & Frame */}
            <rect width={CARD_WIDTH} height={CARD_HEIGHT} fill="#FFFFFF" />
            <rect
              x="12"
              y="12"
              width={CARD_WIDTH - 24}
              height={CARD_HEIGHT - 24}
              fill="none"
              stroke="#CBD5E1"
              strokeWidth="2"
              strokeDasharray="4 2"
            />

            {/* Header */}
            <g id="header" textAnchor="middle">
              <text x={CARD_WIDTH / 2} y="45" fontSize="13" fontWeight="bold" fill="#0F172A" fontFamily="sans-serif">
                {PRODUCT_NAME} • {PRODUCT_TAGLINE.toUpperCase()}
              </text>
              <text x={CARD_WIDTH / 2} y="62" fontSize="10" fontWeight="600" fill="#475569" fontFamily="sans-serif">
                FIELD DRUG TEST CALIBRATION REFERENCE CARD (A6)
              </text>
              <line x1="140" y1="72" x2={CARD_WIDTH - 140} y2="72" stroke="#94A3B8" strokeWidth="1" />
            </g>

            {/* ArUco Corner Markers */}
            {ARUCO_MARKERS.map((m) => {
              const cellSize = m.rect.w / 6;
              return (
                <g key={m.id} id={`marker-${m.id}`}>
                  {/* White background under marker */}
                  <rect
                    x={m.rect.x - 4}
                    y={m.rect.y - 4}
                    width={m.rect.w + 8}
                    height={m.rect.h + 8}
                    fill="#FFFFFF"
                  />
                  {/* 6x6 ArUco grid */}
                  {m.grid.map((row, r) =>
                    row.map((cell, c) => (
                      <rect
                        key={`${r}-${c}`}
                        x={m.rect.x + c * cellSize}
                        y={m.rect.y + r * cellSize}
                        width={cellSize}
                        height={cellSize}
                        fill={cell === 1 ? '#FFFFFF' : '#000000'}
                      />
                    ))
                  )}
                  {/* Marker label */}
                  <text
                    x={m.rect.x + m.rect.w / 2}
                    y={m.corner.startsWith('T') ? m.rect.y + m.rect.h + 12 : m.rect.y - 4}
                    fontSize="9"
                    fontWeight="bold"
                    textAnchor="middle"
                    fill="#334155"
                    fontFamily="monospace"
                  >
                    ARUCO #{m.id} ({m.corner})
                  </text>
                </g>
              );
            })}

            {/* Reference Calibration Patches */}
            {REFERENCE_PATCHES.map((p) => (
              <g key={p.id} id={p.id}>
                {/* Thin outline */}
                <rect
                  x={p.rect.x - 1}
                  y={p.rect.y - 1}
                  width={p.rect.w + 2}
                  height={p.rect.h + 2}
                  fill="#000000"
                />
                {/* Color Swatch */}
                <rect
                  x={p.rect.x}
                  y={p.rect.y}
                  width={p.rect.w}
                  height={p.rect.h}
                  fill={p.hex}
                />
                {/* Label text */}
                <text
                  x={p.rect.x + p.rect.w / 2}
                  y={p.rect.y + p.rect.h + 10}
                  fontSize="7.5"
                  fontWeight="600"
                  textAnchor="middle"
                  fill="#1E293B"
                  fontFamily="sans-serif"
                >
                  {p.name.split(' ')[0]}
                </text>
              </g>
            ))}

            {/* Test Result Window (Cutout) */}
            <g id="result-window">
              {/* Window Box */}
              <rect
                x={RESULT_WINDOW_RECT.x}
                y={RESULT_WINDOW_RECT.y}
                width={RESULT_WINDOW_RECT.w}
                height={RESULT_WINDOW_RECT.h}
                fill="#F8FAFC"
                stroke="#D97706"
                strokeWidth="2.5"
                strokeDasharray="6 4"
                rx="8"
              />

              {/* Target Crosshairs */}
              <line
                x1={RESULT_WINDOW_RECT.x}
                y1={RESULT_WINDOW_RECT.y + RESULT_WINDOW_RECT.h / 2}
                x2={RESULT_WINDOW_RECT.x + RESULT_WINDOW_RECT.w}
                y2={RESULT_WINDOW_RECT.y + RESULT_WINDOW_RECT.h / 2}
                stroke="#F59E0B"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <line
                x1={RESULT_WINDOW_RECT.x + RESULT_WINDOW_RECT.w / 2}
                y1={RESULT_WINDOW_RECT.y}
                x2={RESULT_WINDOW_RECT.x + RESULT_WINDOW_RECT.w / 2}
                y2={RESULT_WINDOW_RECT.y + RESULT_WINDOW_RECT.h}
                stroke="#F59E0B"
                strokeWidth="1"
                strokeDasharray="3 3"
              />

              {/* Center Bullseye */}
              <circle
                cx={RESULT_WINDOW_RECT.x + RESULT_WINDOW_RECT.w / 2}
                cy={RESULT_WINDOW_RECT.y + RESULT_WINDOW_RECT.h / 2}
                r="18"
                fill="none"
                stroke="#D97706"
                strokeWidth="1.5"
              />

              {/* Window Instructions */}
              <g textAnchor="middle" fontFamily="sans-serif">
                <text
                  x={RESULT_WINDOW_RECT.x + RESULT_WINDOW_RECT.w / 2}
                  y={RESULT_WINDOW_RECT.y + 40}
                  fontSize="11"
                  fontWeight="bold"
                  fill="#B45309"
                >
                  TEST RESULT WINDOW
                </text>
                <text
                  x={RESULT_WINDOW_RECT.x + RESULT_WINDOW_RECT.w / 2}
                  y={RESULT_WINDOW_RECT.y + 58}
                  fontSize="8"
                  fontWeight="500"
                  fill="#78350F"
                >
                  Place kit tube / strip centered in this box
                </text>
                <text
                  x={RESULT_WINDOW_RECT.x + RESULT_WINDOW_RECT.w / 2}
                  y={RESULT_WINDOW_RECT.y + RESULT_WINDOW_RECT.h - 25}
                  fontSize="7.5"
                  fill="#92400E"
                >
                  Keep markers and color swatches unobstructed
                </text>
              </g>
            </g>

            {/* Millimeter Metric Scale on Left Edge */}
            <g id="metric-scale" stroke="#64748B" strokeWidth="1">
              <line x1="18" y1="120" x2="18" y2="700" />
              {Array.from({ length: 30 }).map((_, i) => (
                <line
                  key={i}
                  x1="18"
                  y1={120 + i * 20}
                  x2={i % 5 === 0 ? "28" : "23"}
                  y2={120 + i * 20}
                />
              ))}
            </g>

            {/* Footer Notice */}
            <g id="footer" textAnchor="middle" fontFamily="sans-serif">
              <text x={CARD_WIDTH / 2} y="815" fontSize="8" fontWeight="600" fill="#475569">
                PRESUMPTIVE FIELD TESTING SYSTEM • FIELD CALIBRATION REFERENCE
              </text>
              <text x={CARD_WIDTH / 2} y="828" fontSize="7" fill="#64748B">
                Do not laminate with high-gloss film to avoid specular reflection.
              </text>
            </g>
          </svg>
        </div>
      </div>

      {/* Guidance Note */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs text-slate-300">
        <div className="flex items-center gap-1.5 text-sky-400 font-semibold">
          <Info className="w-4 h-4" />
          Field Operator Usage Instructions
        </div>
        <ul className="space-y-1.5 list-disc list-inside text-slate-400 text-[11px] leading-relaxed">
          <li>Print on standard A6 cardstock (or A4 cut into 4 sheets) with standard matte finish.</li>
          <li>Ensure all 4 ArUco corner markers (#0, #1, #2, #3) are visible and clean.</li>
          <li>Place the reaction tube or test strip inside the marked amber window.</li>
          <li>Hold phone parallel to the card under diffuse, uniform lighting.</li>
        </ul>
      </div>
    </div>
  );
};
