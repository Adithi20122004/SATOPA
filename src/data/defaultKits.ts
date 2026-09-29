import type { KitProfile } from '../types';

export const DEFAULT_KIT_PROFILES: KitProfile[] = [
  {
    id: 'marquis-standard-2026',
    name: 'Marquis Reagent (Field Standard)',
    reagentType: 'Marquis (Formaldehyde/Sulfuric Acid)',
    targetSubstance: 'Alkaloids / Opiates / Amphetamines',
    lotNumber: 'MQ-2026-X04',
    expiryDate: '2026-12-31',
    readingTimeWindowSeconds: {
      min: 15,
      max: 60,
    },
    deltaEAcceptanceThreshold: 14.0, // T (acceptable match threshold)
    deltaEMarginThreshold: 4.5,     // M (minimum separation to runner-up)
    classes: [
      {
        name: 'POSITIVE',
        description: 'Target compound detected (Purple / Violet-Black reaction)',
        expectedLab: [22.0, 18.5, -24.0], // Deep violet/black
      },
      {
        name: 'NEGATIVE',
        description: 'No target reaction (Unreacted clear/pale straw liquid)',
        expectedLab: [85.0, -2.0, 18.0], // Pale yellow/straw
      },
      {
        name: 'INCONCLUSIVE',
        description: 'Ambiguous intermediate shade or non-target cross-reaction',
        expectedLab: [48.0, 14.0, 12.0], // Muddy reddish/brown
      },
    ],
  },
  {
    id: 'scott-cocaine-2026',
    name: 'Scott Reagent (Cobalt Thiocyanate)',
    reagentType: 'Modified Scott Reagent',
    targetSubstance: 'Cocaine HCl & Base',
    lotNumber: 'SC-2026-B11',
    expiryDate: '2026-11-15',
    readingTimeWindowSeconds: {
      min: 10,
      max: 45,
    },
    deltaEAcceptanceThreshold: 13.5,
    deltaEMarginThreshold: 5.0,
    classes: [
      {
        name: 'POSITIVE',
        description: 'Cocaine detected (Brilliant Cobalt Blue in solvent layer)',
        expectedLab: [42.0, -12.0, -42.0], // Vivid cobalt blue
      },
      {
        name: 'NEGATIVE',
        description: 'No cocaine reaction (Pinkish / Clear unseparated layer)',
        expectedLab: [78.0, 15.0, 2.0], // Pale pink
      },
      {
        name: 'INCONCLUSIVE',
        description: 'Turbid or indeterminate shade',
        expectedLab: [55.0, -4.0, -10.0], // Muted greyish-cyan
      },
    ],
  },
  {
    id: 'duquenois-levine-2026',
    name: 'Duquenois-Levine Reagent',
    reagentType: 'Duquenois-Levine (Vanillin/Acetaldehyde/HCl)',
    targetSubstance: 'Cannabinoids (THC)',
    lotNumber: 'DL-2026-C09',
    expiryDate: '2026-10-30',
    readingTimeWindowSeconds: {
      min: 30,
      max: 90,
    },
    deltaEAcceptanceThreshold: 14.0,
    deltaEMarginThreshold: 4.0,
    classes: [
      {
        name: 'POSITIVE',
        description: 'Cannabinoids detected (Deep Violet extracted into lower chloroform phase)',
        expectedLab: [28.0, 28.0, -20.0], // Deep violet
      },
      {
        name: 'NEGATIVE',
        description: 'Negative (Colorless or upper-phase amber only)',
        expectedLab: [82.0, 2.0, 24.0], // Amber
      },
      {
        name: 'INCONCLUSIVE',
        description: 'Non-specific discoloration without distinct phase separation',
        expectedLab: [45.0, 5.0, 5.0], // Dull brownish grey
      },
    ],
  },
];
