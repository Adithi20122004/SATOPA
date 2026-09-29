import { describe, it, expect } from 'vitest';
import { PRESUMPTIVE_DISCLAIMER } from '../types';
import { DEFAULT_KIT_PROFILES } from '../data/defaultKits';

describe('Phase 1 Foundation & Regulatory Compliance Tests', () => {
  it('strictly enforces the presumptive testing disclaimer', () => {
    expect(PRESUMPTIVE_DISCLAIMER).toBe(
      'PRESUMPTIVE result and supporting record; it does not replace laboratory confirmatory testing.'
    );
  });

  it('configures valid kit-agnostic profiles with calibrated Lab targets', () => {
    expect(DEFAULT_KIT_PROFILES.length).toBeGreaterThanOrEqual(3);

    for (const kit of DEFAULT_KIT_PROFILES) {
      expect(kit.id).toBeDefined();
      expect(kit.name).toBeTruthy();
      expect(kit.lotNumber).toBeTruthy();
      expect(kit.expiryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(kit.deltaEAcceptanceThreshold).toBeGreaterThan(0);
      expect(kit.deltaEMarginThreshold).toBeGreaterThan(0);
      expect(kit.readingTimeWindowSeconds.min).toBeLessThanOrEqual(kit.readingTimeWindowSeconds.max);

      // Verify classes (POSITIVE, NEGATIVE, INCONCLUSIVE)
      const classNames = kit.classes.map((c) => c.name);
      expect(classNames).toContain('POSITIVE');
      expect(classNames).toContain('NEGATIVE');
      expect(classNames).toContain('INCONCLUSIVE');

      // Verify Lab color coordinates are valid
      for (const cls of kit.classes) {
        const [L, a, b] = cls.expectedLab;
        expect(L).toBeGreaterThanOrEqual(0);
        expect(L).toBeLessThanOrEqual(100);
        expect(a).toBeGreaterThanOrEqual(-128);
        expect(a).toBeLessThanOrEqual(127);
        expect(b).toBeGreaterThanOrEqual(-128);
        expect(b).toBeLessThanOrEqual(127);
      }
    }
  });
});
