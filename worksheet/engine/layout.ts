// Page geometry and size estimates, in CSS pixels at 96 per inch. The
// components draw to these sizes, so the composer can fit sections to pages
// without a browser. The gallery measures the drawn pages to check them.

// A US Letter page is 816 by 1056.
import { WritingSize } from '../proto/v1/worksheet_pb.js';

export const PAGE_WIDTH = 816;
export const PAGE_HEIGHT = 1056;
export const MARGIN = 54;
export const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
// The header (title, name, date) and footer take this much of each page.
export const HEADER_HEIGHT = 86;
export const FOOTER_HEIGHT = 34;
export const BODY_HEIGHT = PAGE_HEIGHT - 2 * MARGIN - HEADER_HEIGHT - FOOTER_HEIGHT;

export const SECTION_HEADER = 34;
export const ITEM_GAP = 14;
export const NODE_GAP = 6;
export const ITEM_LABEL_WIDTH = 30;
const LINE = 20;
const CHAR = 7.4;

// Widget sizes shared with the components that draw them.
export const NUMBER_LINE_HEIGHT = 64;
export const NUMBER_LINE_BLANKS_HEIGHT = 84;
export const BAR_HEIGHT = 34;
export const WALL_ROW = 26;
export const GRID_CELL = 22;
export const HUNDREDTHS_CELL = 13;
// An area model's sides are drawn in proportion to its parts, within these
// totals.
export const AREA_WIDTH = 200;
export const AREA_HEIGHT = 120;
export const DOT_GAP = 18;
export const TAPE_ROW = 34;
export const TAPE_UNIT = 34;
export const TAPE_NAME = 52;
export const DIGIT = 24;
export const ANGLE_SIZE = 116;
export const POLYGON_MAX_WIDTH = 190;
export const POLYGON_MAX_HEIGHT = 110;

export function textHeight(s: string, width: number): number {
  const perLine = Math.max(10, Math.floor(width / CHAR));
  return Math.max(1, Math.ceil(s.length / perLine)) * LINE;
}


// Writing is the size of the spaces a child writes in. Standard matches
// wide-ruled paper, about a third of an inch per row; large is half an inch.
export interface Writing {
  // The height of one row of handwriting.
  row: number;
  // The side of a box for one digit.
  digit: number;
}

export const STANDARD_WRITING: Writing = { row: 32, digit: DIGIT };
export const LARGE_WRITING: Writing = { row: 48, digit: 34 };

export function writingFor(size: WritingSize): Writing {
  return size === WritingSize.LARGE ? LARGE_WRITING : STANDARD_WRITING;
}
