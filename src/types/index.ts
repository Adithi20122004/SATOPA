export const APP_CONFIG = {
  name: 'SATOPA',
  tagline: 'Verifiable field-test records',
  version: '1.0.0',
  sihId: 'SIH26231',
} as const;

export const PRODUCT_NAME = APP_CONFIG.name;
export const PRODUCT_TAGLINE = APP_CONFIG.tagline;

export const PRESUMPTIVE_DISCLAIMER =
  'PRESUMPTIVE result and supporting record; it does not replace laboratory confirmatory testing.';

export interface CapturedFrame {
  dataUrl: string;
  blob: Blob;
  imageData: ImageData;
  width: number;
  height: number;
  timestamp: number;
}

export interface GPSCoords {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  isLowAccuracy: boolean;
}

export type AppTab = 'capture' | 'log' | 'verify' | 'evaluate' | 'card' | 'settings';

export interface QualityGateResult {
  cardDetected: boolean;
  blurPassed: boolean;
  blurScore: number;
  blurThreshold: number;
  glarePassed: boolean;
  glarePercent: number;
  exposurePassed: boolean;
  exposureScore: number;
  evenLightingPassed: boolean;
  lightingVariance: number;
  tiltPassed: boolean;
  tiltAngleDeg: number;
  allPassed: boolean;
  instructions: string[];
}

export interface KitProfile {
  id: string;
  name: string;
  reagentType: string;
  targetSubstance: string;
  lotNumber: string;
  expiryDate: string; // ISO format YYYY-MM-DD
  readingTimeWindowSeconds: {
    min: number;
    max: number;
  };
  classes: {
    name: 'POSITIVE' | 'NEGATIVE' | 'INCONCLUSIVE';
    description: string;
    expectedLab: [number, number, number]; // [L, a, b]
  }[];
  deltaEAcceptanceThreshold: number; // T
  deltaEMarginThreshold: number; // M
}

export interface CalibrationResult {
  matrix: number[][]; // 3x3 linear RGB correction matrix
  residualRmse: number;
  measuredPatchesLab: [number, number, number][];
  calibratedResultLab: [number, number, number];
  rawResultLab: [number, number, number];
}

export interface ClassificationResult {
  outcome: 'POSITIVE' | 'NEGATIVE' | 'INCONCLUSIVE';
  matchedClass: string;
  confidence: number;
  distances: { className: string; deltaE00: number }[];
  topDistance: number;
  runnerUpMargin: number;
  inconclusiveReason?: string;
  isExpiredKit: boolean;
  isOutsideTimeWindow: boolean;
}

export interface SignedRecord {
  record_id: string;
  timestamp_utc: string;
  gps: {
    latitude: number;
    longitude: number;
    accuracy: number;
    low_accuracy_flag: boolean;
    status_text?: string;
  };
  operator_id: string;
  device_id: string;
  app_version: string;
  kit_profile: {
    id: string;
    name: string;
    lot_number: string;
    expiry_date: string;
  };
  case_reference?: string;
  outcome: 'POSITIVE' | 'NEGATIVE' | 'INCONCLUSIVE';
  confidence: number;
  calibration_score: number;
  image_sha256: string;
  previous_record_hash: string;
  clock_skew_flag: boolean;
  quality_flags: {
    blur_score: number;
    glare_percent: number;
    tilt_deg: number;
  };
  measured_lab: [number, number, number];
  signature_der_hex?: string;
  public_key_spki_hex?: string;
}
