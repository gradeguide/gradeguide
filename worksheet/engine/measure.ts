// Sizes of nodes for the composer. Widgets are measured by drawing them with
// the same functions their components use, so an estimate cannot drift from
// the drawing.
import { type Node } from '../proto/v1/nodes_pb.js';
import * as draw from './draw.js';
import * as shapes from './draw_shapes.js';
import { blankWidth } from './field.js';
import { type Drawing } from './drawing.js';
import { NODE_GAP, STANDARD_WRITING, type Writing, textHeight } from './layout.js';

function drawing(n: Node, w: Writing): Drawing | undefined {
  const k = n.kind;
  switch (k.case) {
    case 'numberLine':
      return draw.numberLine(k.value, false);
    case 'fractionBar':
      return draw.fractionBar(k.value);
    case 'fractionWall':
      return draw.fractionWall(k.value);
    case 'unitGrid':
      return draw.unitGrid(k.value);
    case 'areaModel':
      return draw.areaModel(k.value, false, w);
    case 'dotArray':
      return draw.dotArray(k.value);
    case 'tapeDiagram':
      return draw.tapeDiagram(k.value, false);
    case 'columnArithmetic':
      return draw.columnArithmetic(k.value, false, w);
    case 'angle':
      return draw.angle(k.value, false);
    case 'polygon':
      return draw.polygon(k.value, false);
    case 'placeValueChart':
      return draw.placeValueChart(k.value, false);
    case 'baseTenBlocks':
      return draw.baseTenBlocks(k.value);
    case 'longDivision':
      return draw.longDivision(k.value, false, w);
    case 'clock':
      return draw.clock(k.value);
    case 'ruler':
      return draw.ruler(k.value);
    case 'linePlot':
      return draw.linePlot(k.value);
    case 'protractor':
      return draw.protractor(k.value);
    case 'lineFigure':
      return draw.lineFigure(k.value);
    case 'numberChart':
      return draw.numberChart(k.value, false);
    case 'barGraph':
      return draw.barGraph(k.value);
    case 'gridShape':
      return shapes.gridShape(k.value);
    case 'fractionCircle':
      return shapes.fractionCircle(k.value);
    case 'measuringJug':
      return shapes.measuringJug(k.value);
    case 'dataTable':
      return draw.dataTable(k.value, false, w);
  }
  return undefined;
}

function hasStackedFraction(n: Node): boolean {
  return n.kind.case === 'math' && n.kind.value.atoms.some((a) => a.kind.case === 'fraction' || a.kind.case === 'fractionBlank' || a.kind.case === 'halfBlank');
}

// minWidth is the narrowest a node may be drawn.
export function minWidth(n: Node, w: Writing = STANDARD_WRITING): number {
  const d = drawing(n, w);
  if (d) {
    return d.width;
  }
  const k = n.kind;
  switch (k.case) {
    case 'text':
      return 180;
    case 'math':
      return k.value.atoms.reduce((acc, a) => {
        switch (a.kind.case) {
          case 'text':
            return acc + 11 * a.kind.value.length + 8;
          case 'blank':
            return acc + blankWidth(a.kind.value, w) + 8;
          default:
            return acc + 40;
        }
      }, 0);
    case 'row':
      return k.value.children.reduce((s, c) => s + minWidth(c, w) + ROW_GAP, 0);
    case 'stack':
      return Math.max(0, ...k.value.children.map((c) => minWidth(c, w)));
    case 'choices':
      // A tick box, its gap, the option's text, and the gap to the next.
      return k.value.options.reduce((w, o) => w + 16 + 5 + o.length * 6.4 + 12, 0);
    case 'lines':
      return 220;
    case 'workSpace':
      return 220;
    case 'multiPartQuestion':
      // A word problem takes the full width of its column.
      return Math.max(
        420,
        ...k.value.stem.map((c) => minWidth(c, w)),
        ...k.value.parts.flatMap((p) => [...p.prompt, ...p.response].map((c) => minWidth(c, w) + PART_LABEL)),
      );
  }
  return 0;
}

// height is how tall a node is drawn at width.
const PART_LABEL = 32;
// The gap between the children of a row, across and down.
const ROW_GAP = 12;

export function height(n: Node, width: number, w: Writing = STANDARD_WRITING): number {
  const d = drawing(n, w);
  if (d) {
    // An inline SVG sits on a text line, which adds a few pixels below it.
    return d.height + 4;
  }
  const k = n.kind;
  switch (k.case) {
    case 'text':
      return textHeight(k.value, width);
    case 'math':
      return hasStackedFraction(n) ? 58 : Math.max(34, w.row + 6);
    case 'row': {
      // Children wrap onto a new line when the next one does not fit.
      let total = 0;
      let line = 0;
      let x = 0;
      for (const c of k.value.children) {
        const cw = minWidth(c, w);
        if (x > 0 && x + cw > width) {
          total += line + ROW_GAP;
          line = 0;
          x = 0;
        }
        x += cw + ROW_GAP;
        line = Math.max(line, height(c, width, w));
      }
      return total + line;
    }
    case 'stack':
      return k.value.children.reduce((s, c) => s + height(c, width, w) + NODE_GAP, 0);
    case 'choices':
      return 22;
    case 'lines':
      return k.value.count * w.row;
    case 'workSpace':
      return k.value.rows * w.row;
    case 'multiPartQuestion': {
      const inner = width - PART_LABEL;
      return (
        nodesHeight(k.value.stem, width, w) +
        k.value.parts.reduce((s, p) => s + 12 + nodesHeight([...p.prompt, ...p.response], inner, w), 0)
      );
    }
  }
  return 0;
}

export function nodesHeight(nodes: readonly Node[], width: number, w: Writing = STANDARD_WRITING): number {
  return nodes.reduce((s, n) => s + height(n, width, w), 0) + NODE_GAP * Math.max(0, nodes.length - 1);
}

export function nodesMinWidth(nodes: readonly Node[], w: Writing = STANDARD_WRITING): number {
  return Math.max(0, ...nodes.map((n) => minWidth(n, w)));
}
