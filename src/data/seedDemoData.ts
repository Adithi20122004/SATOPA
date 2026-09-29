import { v4 as uuidv4 } from 'uuid';
import type { SignedRecord, KitProfile } from '../types';
import { DEFAULT_KIT_PROFILES } from './defaultKits';
import {
  generateDeviceKeyPair,
  exportPublicKeyHex,
  signRecord,
  computeRecordChainHash,
  sha256Hex,
  GENESIS_HASH,
} from '../crypto/recordCrypto';
import { db, getOrCreateDeviceKeyPair } from '../db/database';
import { generateDemoCapturedFrame } from './demoCardGenerator';

export async function seedDemoRecords(): Promise<number> {
  const existingCount = await db.records.count();
  const keyInfo = await getOrCreateDeviceKeyPair();

  const marquisKit = DEFAULT_KIT_PROFILES.find((k) => k.id.includes('marquis')) || DEFAULT_KIT_PROFILES[0];
  const scottKit = DEFAULT_KIT_PROFILES.find((k) => k.id.includes('scott')) || DEFAULT_KIT_PROFILES[1];
  const cannabinoidKit = DEFAULT_KIT_PROFILES.find((k) => k.id.includes('duquenois')) || DEFAULT_KIT_PROFILES[2];

  const now = Date.now();
  const sampleConfigs: Array<{
    caseRef: string;
    kit: KitProfile;
    outcome: 'POSITIVE' | 'NEGATIVE' | 'INCONCLUSIVE';
    conf: number;
    lab: [number, number, number];
    lat: number;
    lng: number;
    acc: number;
    hoursAgo: number;
    demoFrameType: 'positive_marquis' | 'negative_marquis' | 'blank_wall';
  }> = [
    {
      caseRef: 'NDPS-DELHI-2026/089',
      kit: marquisKit,
      outcome: 'POSITIVE',
      conf: 95,
      lab: [22.5, 18.2, -23.8],
      lat: 28.6139,
      lng: 77.209,
      acc: 6.2,
      hoursAgo: 14,
      demoFrameType: 'positive_marquis',
    },
    {
      caseRef: 'NDPS-MUMBAI-2026/142',
      kit: scottKit,
      outcome: 'POSITIVE',
      conf: 92,
      lab: [35.0, -12.4, -42.1],
      lat: 19.076,
      lng: 72.8777,
      acc: 8.5,
      hoursAgo: 11,
      demoFrameType: 'positive_marquis',
    },
    {
      caseRef: 'CHECKPOST-KA-2026/033',
      kit: marquisKit,
      outcome: 'NEGATIVE',
      conf: 98,
      lab: [86.2, -2.1, 18.4],
      lat: 12.9716,
      lng: 77.5946,
      acc: 5.0,
      hoursAgo: 8,
      demoFrameType: 'negative_marquis',
    },
    {
      caseRef: 'SEIZURE-PUNJAB-2026/512',
      kit: cannabinoidKit,
      outcome: 'POSITIVE',
      conf: 89,
      lab: [28.4, 24.1, -12.3],
      lat: 31.634,
      lng: 74.8723,
      acc: 9.1,
      hoursAgo: 5,
      demoFrameType: 'positive_marquis',
    },
    {
      caseRef: 'SUSPECT-VEHICLE-GJ/019',
      kit: marquisKit,
      outcome: 'INCONCLUSIVE',
      conf: 44,
      lab: [52.1, 12.5, 8.2],
      lat: 23.0225,
      lng: 72.5714,
      acc: 12.0,
      hoursAgo: 3,
      demoFrameType: 'blank_wall',
    },
    {
      caseRef: 'ROUTINE-ENTRY-WB-2026/007',
      kit: scottKit,
      outcome: 'NEGATIVE',
      conf: 96,
      lab: [84.1, -1.8, 16.2],
      lat: 22.5726,
      lng: 88.3639,
      acc: 7.4,
      hoursAgo: 1,
      demoFrameType: 'negative_marquis',
    },
  ];

  // We start linking from either the latest existing record in DB, or GENESIS_HASH
  let previousHash = GENESIS_HASH;
  const lastRecord = await db.records.orderBy('timestamp_utc').last();
  if (lastRecord) {
    previousHash = await computeRecordChainHash(lastRecord);
  }

  let insertedCount = 0;
  for (const cfg of sampleConfigs) {
    const demoFrame = generateDemoCapturedFrame(cfg.demoFrameType);
    const imageBytes = await demoFrame.blob.arrayBuffer();
    const image_sha256 = await sha256Hex(imageBytes);

    const recordTime = new Date(now - cfg.hoursAgo * 3600 * 1000).toISOString();

    const unsigned: SignedRecord = {
      record_id: uuidv4(),
      timestamp_utc: recordTime,
      gps: {
        latitude: cfg.lat,
        longitude: cfg.lng,
        accuracy: cfg.acc,
        low_accuracy_flag: false,
        status_text: `${cfg.lat.toFixed(4)}°N, ${cfg.lng.toFixed(4)}°E (±${cfg.acc}m)`,
      },
      operator_id: 'OFFICER-4821',
      device_id: 'MHA-DEVICE-ALPHA',
      app_version: '1.0.0-SIH26231',
      kit_profile: {
        id: cfg.kit.id,
        name: cfg.kit.name,
        lot_number: cfg.kit.lotNumber,
        expiry_date: cfg.kit.expiryDate,
      },
      case_reference: cfg.caseRef,
      outcome: cfg.outcome,
      confidence: cfg.conf,
      calibration_score: 0.038,
      image_sha256,
      previous_record_hash: previousHash,
      clock_skew_flag: false,
      quality_flags: {
        blur_score: 110,
        glare_percent: 0.2,
        tilt_deg: 2.1,
      },
      measured_lab: cfg.lab,
    };

    const signed = await signRecord(unsigned, keyInfo.privateKey, keyInfo.publicKeyHex);

    // Save to database
    await db.transaction('rw', db.records, db.images, async () => {
      await db.records.put(signed);
      await db.images.put({
        image_sha256,
        blob: demoFrame.blob,
        created_at: Date.now(),
      });
    });

    // Advance previousHash to this record's canonical hash for the chain
    previousHash = await computeRecordChainHash(signed);
    insertedCount++;
  }

  return insertedCount;
}
