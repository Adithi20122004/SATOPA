import type { RGB, LinearRGB, Lab } from './colorMath';
import { rgbToLinearRgb, srgbToLab } from './colorMath';

export const CARD_WIDTH = 600;
export const CARD_HEIGHT = 850;

export interface CardPatch {
  id: string;
  name: string;
  category: 'neutral' | 'chromatic';
  hex: string;
  srgb: RGB;
  linearRgb: LinearRGB;
  lab: Lab;
  rect: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface MarkerDef {
  id: number;
  name: string;
  corner: 'TL' | 'TR' | 'BR' | 'BL';
  rect: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  grid: number[][]; // 6x6 binary matrix (including outer black border)
}

// OpenCV DICT_4X4_50 marker 6x6 bit grids
export const ARUCO_MARKERS: MarkerDef[] = [
  {
    id: 0,
    name: 'Top-Left Marker (ID 0)',
    corner: 'TL',
    rect: { x: 30, y: 30, w: 90, h: 90 },
    grid: [
      [0, 0, 0, 0, 0, 0],
      [0, 1, 0, 1, 1, 0],
      [0, 0, 1, 0, 1, 0],
      [0, 0, 0, 1, 1, 0],
      [0, 0, 0, 1, 0, 0],
      [0, 0, 0, 0, 0, 0],
    ],
  },
  {
    id: 1,
    name: 'Top-Right Marker (ID 1)',
    corner: 'TR',
    rect: { x: 480, y: 30, w: 90, h: 90 },
    grid: [
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
      [0, 1, 1, 1, 1, 0],
      [0, 1, 0, 0, 1, 0],
      [0, 1, 0, 1, 0, 0],
      [0, 0, 0, 0, 0, 0],
    ],
  },
  {
    id: 2,
    name: 'Bottom-Right Marker (ID 2)',
    corner: 'BR',
    rect: { x: 480, y: 730, w: 90, h: 90 },
    grid: [
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 1, 0],
      [0, 0, 0, 1, 1, 0],
      [0, 0, 0, 1, 0, 0],
      [0, 1, 1, 0, 1, 0],
      [0, 0, 0, 0, 0, 0],
    ],
  },
  {
    id: 3,
    name: 'Bottom-Left Marker (ID 3)',
    corner: 'BL',
    rect: { x: 30, y: 730, w: 90, h: 90 },
    grid: [
      [0, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 1, 0],
      [0, 1, 0, 0, 1, 0],
      [0, 0, 1, 0, 0, 0],
      [0, 0, 1, 1, 0, 0],
      [0, 0, 0, 0, 0, 0],
    ],
  },
];

const RAW_PATCHES: Array<{
  id: string;
  name: string;
  category: 'neutral' | 'chromatic';
  hex: string;
  srgb: RGB;
  rect: { x: number; y: number; w: number; h: number };
}> = [
  // Left Column - Neutral & Dark Reference
  {
    id: 'patch_white',
    name: 'White Reference (95%)',
    category: 'neutral',
    hex: '#F8F9FA',
    srgb: [248, 249, 250],
    rect: { x: 40, y: 220, w: 70, h: 60 },
  },
  {
    id: 'patch_grey',
    name: 'Neutral Grey (50%)',
    category: 'neutral',
    hex: '#7F7F7F',
    srgb: [127, 127, 127],
    rect: { x: 40, y: 340, w: 70, h: 60 },
  },
  {
    id: 'patch_black',
    name: 'Black Reference (5%)',
    category: 'neutral',
    hex: '#1A1A1A',
    srgb: [26, 26, 26],
    rect: { x: 40, y: 460, w: 70, h: 60 },
  },

  // Right Column - Primaries
  {
    id: 'patch_red',
    name: 'Standard Red',
    category: 'chromatic',
    hex: '#D32F2F',
    srgb: [211, 47, 47],
    rect: { x: 490, y: 220, w: 70, h: 60 },
  },
  {
    id: 'patch_green',
    name: 'Standard Green',
    category: 'chromatic',
    hex: '#388E3C',
    srgb: [56, 142, 60],
    rect: { x: 490, y: 340, w: 70, h: 60 },
  },
  {
    id: 'patch_blue',
    name: 'Standard Blue',
    category: 'chromatic',
    hex: '#1976D2',
    srgb: [25, 118, 210],
    rect: { x: 490, y: 460, w: 70, h: 60 },
  },

  // Bottom Row - Secondaries
  {
    id: 'patch_cyan',
    name: 'Standard Cyan',
    category: 'chromatic',
    hex: '#0097A7',
    srgb: [0, 151, 167],
    rect: { x: 155, y: 745, w: 70, h: 55 },
  },
  {
    id: 'patch_magenta',
    name: 'Standard Magenta',
    category: 'chromatic',
    hex: '#C2185B',
    srgb: [194, 24, 91],
    rect: { x: 265, y: 745, w: 70, h: 55 },
  },
  {
    id: 'patch_yellow',
    name: 'Standard Yellow',
    category: 'chromatic',
    hex: '#FBC02D',
    srgb: [251, 192, 45],
    rect: { x: 375, y: 745, w: 70, h: 55 },
  },
];

export const REFERENCE_PATCHES: CardPatch[] = RAW_PATCHES.map((p) => ({
  ...p,
  linearRgb: rgbToLinearRgb(p.srgb),
  lab: srgbToLab(p.srgb),
}));

export const RESULT_WINDOW_RECT = {
  x: 150,
  y: 190,
  w: 300,
  h: 510,
};
