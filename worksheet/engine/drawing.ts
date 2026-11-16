// Drawing is a widget as SVG primitives. Widgets compute one from their
// node; SvgComponent draws it. Keeping the geometry in plain functions lets
// tests check it without a DOM.
export interface Drawing {
  width: number;
  height: number;
  // When set, the drawing is cropped to this box instead of 0 0 width height.
  viewBox?: [number, number, number, number];
  shapes: Shape[];
}

export type Shape =
  // color, when set, replaces the usual near-black, such as for an answer
  // drawn in the key.
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; w?: number; dash?: string; color?: string }
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: string; sw?: number; dash?: string }
  | { t: 'circle'; cx: number; cy: number; r: number; fill?: string; color?: string }
  | { t: 'path'; d: string; fill?: string; w?: number }
  | { t: 'text'; x: number; y: number; s: string; size?: number; anchor?: 'start' | 'middle' | 'end'; italic?: boolean; answer?: boolean }
  // A box to write in. field is its data-field id, or null in a worked
  // example; s is the answer shown, if any.
  | { t: 'box'; x: number; y: number; w: number; h: number; field: string | null; s: string; size?: number };
