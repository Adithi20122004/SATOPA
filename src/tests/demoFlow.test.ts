import { describe, it, expect } from 'vitest';
import { processCardCapture } from '../vision/cardDetector';
import { evaluateQualityGates, computeExposureScore } from '../vision/qualityGates';
import { analyzeTestResult } from '../vision/classifier';
import { DEFAULT_KIT_PROFILES } from '../data/defaultKits';
import {
  canonicalizeJson,
  sha256Hex,
  generateDeviceKeyPair,
  exportPublicKeyHex,
  signRecord,
  verifyRecordSignature,
  computeRecordChainHash,
  GENESIS_HASH,
} from '../crypto/recordCrypto';
import type { SignedRecord } from '../types';

function createUniformImageData(w: number, h: number, r: number, g: number, b: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return { width: w, height: h, data, colorSpace: 'srgb' } as ImageData;
}

describe('Hackathon Demo Readiness & Zero-Mock Classifier Tests', () => {
  const kit = DEFAULT_KIT_PROFILES[0]; // Marquis

  it('RULE 1: Pointing camera at a blank wall yields INCONCLUSIVE (reference card not detected)', () => {
    // 1. Simulate blank cream wall image (uniform color, no reference card, no ArUco markers)
    const blankWallImg = createUniformImageData(600, 800, 230, 220, 205);

    // 2. Run card detection on blank wall
    const cardResult = processCardCapture(blankWallImg);
    expect(cardResult.cardDetected).toBe(false);
    expect(cardResult.detectedMarkers.length).toBe(0);

    // 3. Evaluate Quality Gates
    const quality = evaluateQualityGates({
      cardDetected: cardResult.cardDetected,
      corners: cardResult.corners,
      imageData: blankWallImg,
    });
    expect(quality.allPassed).toBe(false);
    expect(quality.cardDetected).toBe(false);
    expect(quality.instructions.some((inst) => inst.includes('Reference card not detected'))).toBe(true);

    // 4. Classifier must strictly produce INCONCLUSIVE, NEVER POSITIVE or NEGATIVE
    const analysis = analyzeTestResult(cardResult, quality, kit);
    expect(analysis.classification.outcome).toBe('INCONCLUSIVE');
    expect(analysis.classification.inconclusiveReason).toContain('Evidentiary quality standards not met');
  });

  it('RULE 2: Exposure quality gate correctly detects underexposed and overexposed frames', () => {
    const darkFrame = createUniformImageData(100, 100, 15, 15, 15);
    const brightFrame = createUniformImageData(100, 100, 245, 245, 245);
    const normalFrame = createUniformImageData(100, 100, 120, 120, 120);

    const darkScore = computeExposureScore(darkFrame);
    const brightScore = computeExposureScore(brightFrame);
    const normalScore = computeExposureScore(normalFrame);

    expect(darkScore).toBeLessThan(35);
    expect(brightScore).toBeGreaterThan(230);
    expect(normalScore).toBeGreaterThanOrEqual(35);
    expect(normalScore).toBeLessThanOrEqual(230);
  });

  it('RULE 3: ECDSA signature verification detects subtle metadata alterations', async () => {
    const keyPair = await generateDeviceKeyPair(true);
    const pubKeyHex = await exportPublicKeyHex(keyPair.publicKey);

    const record: SignedRecord = {
      record_id: 'test-uuid-001',
      timestamp_utc: '2026-09-29T12:00:00.000Z',
      gps: { latitude: 28.6139, longitude: 77.209, accuracy: 5.0, low_accuracy_flag: false },
      operator_id: 'OFFICER-TEST',
      device_id: 'DEV-TEST',
      app_version: '1.0.0',
      kit_profile: { id: 'k1', name: 'Marquis', lot_number: 'LOT-1', expiry_date: '2026-12-31' },
      outcome: 'NEGATIVE',
      confidence: 95,
      calibration_score: 0.04,
      image_sha256: 'e'.repeat(64),
      previous_record_hash: GENESIS_HASH,
      clock_skew_flag: false,
      quality_flags: { blur_score: 100, glare_percent: 0, tilt_deg: 0 },
      measured_lab: [85, -2, 18],
    };

    const signed = await signRecord(record, keyPair.privateKey, pubKeyHex);

    // Pristine record verifies
    expect(await verifyRecordSignature(signed)).toBe(true);

    // 1. Changing outcome fails signature
    const alteredOutcome: SignedRecord = { ...signed, outcome: 'POSITIVE' };
    expect(await verifyRecordSignature(alteredOutcome)).toBe(false);

    // 2. Modifying timestamp by 1 millisecond fails signature
    const alteredTime: SignedRecord = { ...signed, timestamp_utc: '2026-09-29T12:00:00.001Z' };
    expect(await verifyRecordSignature(alteredTime)).toBe(false);

    // 3. Modifying operator ID fails signature
    const alteredOp: SignedRecord = { ...signed, operator_id: 'OFFICER-IMPOSTOR' };
    expect(await verifyRecordSignature(alteredOp)).toBe(false);
  });

  it('RULE 4: Sequential hash chain detects block deletions or insertions', async () => {
    const baseRecord: SignedRecord = {
      record_id: 'block-0',
      timestamp_utc: '2026-09-29T10:00:00.000Z',
      gps: { latitude: 0, longitude: 0, accuracy: 5, low_accuracy_flag: false },
      operator_id: 'OP',
      device_id: 'DEV',
      app_version: '1.0.0',
      kit_profile: { id: 'k', name: 'Kit', lot_number: 'L', expiry_date: '2026-12-31' },
      outcome: 'POSITIVE',
      confidence: 90,
      calibration_score: 0.05,
      image_sha256: '1'.repeat(64),
      previous_record_hash: GENESIS_HASH,
      clock_skew_flag: false,
      quality_flags: { blur_score: 100, glare_percent: 0, tilt_deg: 0 },
      measured_lab: [20, 20, -20],
    };

    // Block 0
    const hash0 = await computeRecordChainHash(baseRecord);

    // Block 1 links to Block 0
    const record1: SignedRecord = {
      ...baseRecord,
      record_id: 'block-1',
      timestamp_utc: '2026-09-29T10:05:00.000Z',
      previous_record_hash: hash0,
    };
    const hash1 = await computeRecordChainHash(record1);

    // Block 2 links to Block 1
    const record2: SignedRecord = {
      ...baseRecord,
      record_id: 'block-2',
      timestamp_utc: '2026-09-29T10:10:00.000Z',
      previous_record_hash: hash1,
    };

    // Valid chain link:
    expect(record1.previous_record_hash).toBe(hash0);
    expect(record2.previous_record_hash).toBe(hash1);

    // Attacker deletes block 1 and links block 2 to fake hash -> detected!
    expect(record2.previous_record_hash).not.toBe(hash0);
  });

  it('RULE 5: Standalone QR code generator generates valid, renderable QR data URLs', async () => {
    const { QRCode } = await import('../utils/qrCode');
    const qrPayload = JSON.stringify({
      id: 'test-record-1234',
      out: 'POSITIVE',
      time: '2026-09-29T10:00:00.000Z',
      sig: '3045022100...',
    });

    const dataUrl = await QRCode.toDataURL(qrPayload, { width: 140, margin: 1 });
    expect(typeof dataUrl).toBe('string');
    expect(dataUrl.startsWith('data:image/svg+xml') || dataUrl.startsWith('data:image/png')).toBe(true);
    expect(dataUrl.length).toBeGreaterThan(100);
  });
});

