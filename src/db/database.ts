import Dexie, { type Table } from 'dexie';
import type { SignedRecord } from '../types';
import {
  generateDeviceKeyPair,
  exportPublicKeyHex,
  computeRecordChainHash,
  GENESIS_HASH,
} from '../crypto/recordCrypto';

export interface StoredImage {
  image_sha256: string;
  blob: Blob;
  created_at: number;
}

export interface StoredKey {
  id: string; // 'device_key'
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyHex: string;
}

export class FieldCompanionDatabase extends Dexie {
  records!: Table<SignedRecord, string>;
  images!: Table<StoredImage, string>;
  keys!: Table<StoredKey, string>;

  constructor() {
    super('SIH26231_FieldCompanionDB');
    this.version(1).stores({
      records: 'record_id, timestamp_utc, outcome, operator_id, [kit_profile.lot_number]',
      images: 'image_sha256, created_at',
      keys: 'id',
    });
  }
}

export const db = new FieldCompanionDatabase();

/**
 * Retrieves the device's persistent ECDSA P-256 keypair, or creates one on first run.
 */
export async function getOrCreateDeviceKeyPair(): Promise<{
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyHex: string;
}> {
  const existing = await db.keys.get('device_key');
  if (existing) {
    return {
      privateKey: existing.privateKey,
      publicKey: existing.publicKey,
      publicKeyHex: existing.publicKeyHex,
    };
  }

  // Generate new keypair (extractable=true for IndexedDB storage in structured clone)
  const keyPair = await generateDeviceKeyPair(true);
  const publicKeyHex = await exportPublicKeyHex(keyPair.publicKey);

  const stored: StoredKey = {
    id: 'device_key',
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    publicKeyHex,
  };

  await db.keys.put(stored);
  return stored;
}

/**
 * Returns the SHA-256 hash of the most recent record to link into the chain,
 * or GENESIS_HASH if no records exist yet.
 */
export async function getLatestRecordChainHash(): Promise<string> {
  const lastRecord = await db.records.orderBy('timestamp_utc').last();
  if (!lastRecord) {
    return GENESIS_HASH;
  }
  return await computeRecordChainHash(lastRecord);
}

/**
 * Checks for device clock skew against the most recent record.
 */
export async function checkClockSkew(currentIsoTimestamp: string): Promise<boolean> {
  const lastRecord = await db.records.orderBy('timestamp_utc').last();
  if (!lastRecord) return false;

  const prevTime = new Date(lastRecord.timestamp_utc).getTime();
  const curTime = new Date(currentIsoTimestamp).getTime();

  // Flag if device clock went backwards by more than 5 seconds
  return curTime < prevTime - 5000;
}

/**
 * Saves signed record and original image blob to local IndexedDB.
 */
export async function saveRecordToDatabase(
  record: SignedRecord,
  imageBlob: Blob
): Promise<void> {
  await db.transaction('rw', db.records, db.images, async () => {
    await db.records.add(record);
    await db.images.put({
      image_sha256: record.image_sha256,
      blob: imageBlob,
      created_at: Date.now(),
    });
  });
}

/**
 * Exports all records in CSV format
 */
export async function exportRecordsToCsv(): Promise<string> {
  const records = await db.records.orderBy('timestamp_utc').reverse().toArray();
  const headers = [
    'Record_ID',
    'Timestamp_UTC',
    'Outcome',
    'Confidence_%',
    'Kit_Name',
    'Kit_Lot',
    'Operator_ID',
    'Device_ID',
    'Case_Reference',
    'GPS_Latitude',
    'GPS_Longitude',
    'GPS_Accuracy_m',
    'Low_GPS_Flag',
    'Clock_Skew_Flag',
    'Image_SHA256',
    'Previous_Record_Hash',
    'Signature_Hex',
  ];

  const rows = records.map((r) => [
    r.record_id,
    r.timestamp_utc,
    r.outcome,
    r.confidence,
    `"${r.kit_profile.name}"`,
    r.kit_profile.lot_number,
    r.operator_id,
    r.device_id,
    `"${r.case_reference || ''}"`,
    r.gps.latitude,
    r.gps.longitude,
    r.gps.accuracy,
    r.gps.low_accuracy_flag ? 'YES' : 'NO',
    r.clock_skew_flag ? 'YES' : 'NO',
    r.image_sha256,
    r.previous_record_hash,
    r.signature_der_hex?.substring(0, 32) + '...',
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}
