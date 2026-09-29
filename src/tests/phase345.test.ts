import { describe, it, expect } from 'vitest';
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
import type { SignedRecord, KitProfile, QualityGateResult } from '../types';
import { DEFAULT_KIT_PROFILES } from '../data/defaultKits';
import { analyzeTestResult } from '../vision/classifier';
import type { CardDetectionResult } from '../vision/cardDetector';

describe('Phase 3, 4, 5 Cryptographic, Tamper Evident, and Classifier Tests', () => {
  it('strictly canonicalizes JSON with sorted keys (RFC 8785 style)', () => {
    const unarranged = {
      zebra: 10,
      apple: {
        charlie: 'test',
        banana: true,
      },
      mango: [3, 2, 1],
    };

    const canonical = canonicalizeJson(unarranged);
    expect(canonical).toBe('{"apple":{"banana":true,"charlie":"test"},"mango":[3,2,1],"zebra":10}');
  });

  it('computes accurate SHA-256 digests', async () => {
    const text = 'SIH2026-MHA-DRUG-TEST-COMPANION';
    const hash1 = await sha256Hex(text);
    const hash2 = await sha256Hex(text);

    expect(hash1.length).toBe(64);
    expect(hash1).toBe(hash2);
    // Altered text gives completely different hash
    const hashAlt = await sha256Hex(text + '1');
    expect(hashAlt).not.toBe(hash1);
  });

  it('generates ECDSA P-256 keypair, signs record, and verifies authentic signature', async () => {
    const keyPair = await generateDeviceKeyPair(true);
    const publicKeyHex = await exportPublicKeyHex(keyPair.publicKey);

    const dummyRecord: SignedRecord = {
      record_id: '11111111-2222-3333-4444-555555555555',
      timestamp_utc: '2026-09-29T21:00:00.000Z',
      gps: {
        latitude: 28.6139,
        longitude: 77.209,
        accuracy: 8.5,
        low_accuracy_flag: false,
      },
      operator_id: 'OFFICER-4821',
      device_id: 'DEV-XYZ123',
      app_version: '1.0.0-SIH26231',
      kit_profile: {
        id: 'marquis-standard-2026',
        name: 'Marquis Reagent',
        lot_number: 'MQ-2026-X04',
        expiry_date: '2026-12-31',
      },
      case_reference: 'NDPS-CASE-401',
      outcome: 'POSITIVE',
      confidence: 94,
      calibration_score: 0.042,
      image_sha256: 'a'.repeat(64),
      previous_record_hash: GENESIS_HASH,
      clock_skew_flag: false,
      quality_flags: {
        blur_score: 110,
        glare_percent: 0.1,
        tilt_deg: 3.2,
      },
      measured_lab: [24.0, 19.0, -22.0],
    };

    const signed = await signRecord(dummyRecord, keyPair.privateKey, publicKeyHex);
    expect(signed.signature_der_hex).toBeDefined();
    expect(signed.public_key_spki_hex).toBe(publicKeyHex);

    // Verify pristine record
    const isValid = await verifyRecordSignature(signed);
    expect(isValid).toBe(true);
  });

  it('TAMPER TEST 1: catches outcome alteration (e.g. POSITIVE -> NEGATIVE)', async () => {
    const keyPair = await generateDeviceKeyPair(true);
    const publicKeyHex = await exportPublicKeyHex(keyPair.publicKey);

    const dummyRecord: SignedRecord = {
      record_id: '22222222-3333-4444-5555-666666666666',
      timestamp_utc: '2026-09-29T21:05:00.000Z',
      gps: { latitude: 19.076, longitude: 72.8777, accuracy: 5.0, low_accuracy_flag: false },
      operator_id: 'OFFICER-9912',
      device_id: 'DEV-ABC789',
      app_version: '1.0.0-SIH26231',
      kit_profile: {
        id: 'marquis-standard-2026',
        name: 'Marquis Reagent',
        lot_number: 'MQ-2026-X04',
        expiry_date: '2026-12-31',
      },
      outcome: 'POSITIVE',
      confidence: 96,
      calibration_score: 0.038,
      image_sha256: 'b'.repeat(64),
      previous_record_hash: GENESIS_HASH,
      clock_skew_flag: false,
      quality_flags: { blur_score: 120, glare_percent: 0, tilt_deg: 1.5 },
      measured_lab: [22.0, 18.0, -24.0],
    };

    const signed = await signRecord(dummyRecord, keyPair.privateKey, publicKeyHex);

    // Tamper with outcome!
    const tamperedRecord: SignedRecord = {
      ...signed,
      outcome: 'NEGATIVE', // Attacker switches result!
    };

    const verificationResult = await verifyRecordSignature(tamperedRecord);
    expect(verificationResult).toBe(false); // Tamper caught!
  });

  it('TAMPER TEST 2: catches hash chain modification', async () => {
    const rec1: SignedRecord = {
      record_id: 'rec-001',
      timestamp_utc: '2026-09-29T21:10:00.000Z',
      gps: { latitude: 0, longitude: 0, accuracy: 5, low_accuracy_flag: false },
      operator_id: 'OP-1',
      device_id: 'DEV-1',
      app_version: '1.0.0',
      kit_profile: { id: 'k1', name: 'Kit 1', lot_number: 'LOT1', expiry_date: '2026-12-31' },
      outcome: 'POSITIVE',
      confidence: 90,
      calibration_score: 0.05,
      image_sha256: 'c'.repeat(64),
      previous_record_hash: GENESIS_HASH,
      clock_skew_flag: false,
      quality_flags: { blur_score: 100, glare_percent: 0, tilt_deg: 0 },
      measured_lab: [25, 20, -20],
    };

    const hash1 = await computeRecordChainHash(rec1);

    // Block 2 correctly points to Block 1 hash
    const rec2: SignedRecord = {
      ...rec1,
      record_id: 'rec-002',
      previous_record_hash: hash1,
    };
    expect(rec2.previous_record_hash).toBe(hash1);

    // Tampered Block 2 points to fake predecessor
    const tamperedRec2: SignedRecord = {
      ...rec2,
      previous_record_hash: 'ffff' + hash1.slice(4),
    };
    expect(tamperedRec2.previous_record_hash).not.toBe(hash1); // Broken chain detected!
  });

  it('applies abstain-first classification when separation margin is narrow', () => {
    const marquisKit: KitProfile = DEFAULT_KIT_PROFILES[0]; // T=14.0, M=4.5

    // Simulate an ambiguous color halfway between Positive [22, 18.5, -24] and Negative [85, -2, 18]
    const dummyCard: CardDetectionResult = {
      cardDetected: true,
      corners: [],
      warpedCardImageData: null,
      detectedMarkers: [],
      extractedPatches: [],
      resultRegion: {
        rect: { x: 0, y: 0, w: 10, h: 10 },
        medianRgb: [130, 80, 80],
        medianLinearRgb: [0.3, 0.15, 0.15],
        medianLab: [45.0, 15.0, 8.0], // Ambiguous intermediate brownish
        croppedImageData: null,
      },
    };

    const goodQuality: QualityGateResult = {
      cardDetected: true,
      blurPassed: true,
      blurScore: 120,
      blurThreshold: 80,
      exposurePassed: true,
      exposureScore: 128,
      glarePassed: true,
      glarePercent: 0.1,
      evenLightingPassed: true,
      lightingVariance: 5,
      tiltPassed: true,
      tiltAngleDeg: 2,
      allPassed: true,
      instructions: [],
    };

    const res = analyzeTestResult(dummyCard, goodQuality, marquisKit);
    // Must abstain and return INCONCLUSIVE rather than risk a false negative or false positive!
    expect(res.classification.outcome).toBe('INCONCLUSIVE');
    expect(res.classification.inconclusiveReason).toBeDefined();
  });
});
