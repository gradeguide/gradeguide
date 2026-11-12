// compose turns a worksheet record into a ComposedSheet: it generates each
// placement's items, fits sections to pages, and then numbers the items and
// names their fields.
//
// Numbering comes last on purpose. A fragment has no numbers of its own, and
// the page fit may drop items from an elastic set, so labels and field ids
// are only known once the layout is final.
import { clone, create } from '@bufbuild/protobuf';

import { type Field, type Node, NodeSchema } from '../proto/v1/nodes_pb.js';
import {
  type ComposedSheet,
  type ComposedSheet_Item,
  type ComposedSheet_Section,
  type Fragment,
  type Library,
  type Worksheet,
  ComposedSheet_ExampleSchema,
  ComposedSheet_ItemSchema,
  ComposedSheet_KeyEntrySchema,
  ComposedSheet_PageSchema,
  ComposedSheet_SectionSchema,
  ComposedSheetSchema,
  Numbering_Style,
  Stage,
  WritingSize,
} from '../proto/v1/worksheet_pb.js';
import { Fields, fieldsOf } from './build.js';
import { checkAuthored, steps } from './check.js';
import { generate } from './kinds.js';
import {
  BODY_HEIGHT,
  CONTENT_WIDTH,
  ITEM_GAP,
  ITEM_LABEL_WIDTH,
  NODE_GAP,
  SECTION_HEADER,
  type Writing,
  textHeight,
  writingFor,
} from './layout.js';
import { nodesHeight, nodesMinWidth } from './measure.js';
import { Rng, hashSeed } from './rng.js';

// A planned section: its items generated, not yet numbered or paged.
interface Planned {
  section: ComposedSheet_Section;
  items: ComposedSheet_Item[];
  minCount: number;
  itemWidth: number;
}

// Options are how a sheet is printed, which the worksheet record does not
// say.
export interface Options {
  writingSize?: WritingSize;
}

export function compose(ws: Worksheet, lib: Library, opts: Options = {}): ComposedSheet {
  const writingSize = opts.writingSize || WritingSize.STANDARD;
  const w = writingFor(writingSize);
  const fragments = new Map(lib.fragments.map((f) => [f.id, f]));
  const problems: string[] = [];
  const advice: string[] = [];
  const used = new Set<string>();
  const fresh = (key: string) => {
    if (used.has(key)) {
      return false;
    }
    used.add(key);
    return true;
  };

  const planned: Planned[] = [];
  ws.placements.forEach((p, i) => {
    const frag = fragments.get(p.fragmentId);
    if (!frag) {
      problems.push(`Placement ${i + 1} names fragment "${p.fragmentId}", which is not in the library.`);
      return;
    }
    planned.push(plan(frag, p.count, p.seed || hashSeed(ws.seed, `${i}:${frag.id}`), p.instruction, p.stage, p.omitExample, fresh, problems, w));
  });
  checkArc(planned, advice);

  const pages = paginate(planned, ws.maxPages || 1, problems, advice, w);
  const sheet = create(ComposedSheetSchema, {
    worksheetId: ws.id,
    title: ws.title,
    headerLabels: headerLabelsOf(ws, fragments),
    minutes: ws.minutes,
    design: ws.design,
    pages,
    problems,
    advice,
    writingSize,
  });
  number(sheet, ws);
  return sheet;
}

// headerLabelsOf lists the placed fragments' header labels, in placement
// order, each once.
function headerLabelsOf(ws: Worksheet, fragments: Map<string, Fragment>): string[] {
  const seen = new Set<string>();
  return ws.placements.flatMap((p) => fragments.get(p.fragmentId)?.headerLabels ?? []).filter((l) => !seen.has(l) && !!seen.add(l));
}

function plan(
  frag: Fragment,
  countOverride: number,
  seed: number,
  instruction: string,
  stage: Stage,
  omitExample: boolean,
  fresh: (key: string) => boolean,
  problems: string[],
  w: Writing,
): Planned {
  const section = create(ComposedSheet_SectionSchema, {
    instruction: instruction || frag.instruction,
    explainer: frag.explainer,
    figure: frag.figure,
    fragmentId: frag.id,
    stage: stage || frag.stage,
    design: frag.design,
  });
  if (fieldsOf(frag.figure).length > 0) {
    problems.push(`Fragment "${frag.id}" has a field in its figure; figures are for looking at only.`);
  }
  if (frag.example?.item && !omitExample) {
    const nodes = generate(frag.example.item, { rng: new Rng(frag.example.seed || seed ^ 0x5eed), fields: new Fields(''), fresh });
    section.example = create(ComposedSheet_ExampleSchema, { nodes, text: frag.example.text });
  }
  const items: ComposedSheet_Item[] = [];
  const source = frag.items?.source;
  const count = countOverride || frag.items?.count || 0;
  if (source?.case === 'kind') {
    const rng = new Rng(seed);
    for (let i = 0; i < count; i++) {
      // Ids are placeholders until number() renames them.
      const nodes = generate(source.value, { rng, fields: new Fields(`tmp${i}`), fresh });
      items.push(create(ComposedSheet_ItemSchema, { nodes }));
    }
  } else if (source?.case === 'authored') {
    const authored = source.value.items;
    if (count > authored.length) {
      problems.push(`Fragment "${frag.id}" is asked for ${count} items and has ${authored.length}.`);
    }
    authored.slice(0, count).forEach((a, i) => {
      // A copy, so numbering never writes into the library.
      const nodes = a.nodes.map((n) => clone(NodeSchema, n));
      problems.push(...checkAuthored(nodes, `Fragment "${frag.id}" item ${i + 1}`));
      fieldsOf(nodes).forEach((f, k) => (f.id = `tmp${i}-${k}`));
      sizeWorkSpaces(nodes);
      items.push(create(ComposedSheet_ItemSchema, { nodes }));
    });
  }
  const itemWidth = Math.max(0, ...items.map((it) => nodesMinWidth(it.nodes, w))) + ITEM_LABEL_WIDTH;
  const most = frag.maxColumns || 4;
  section.columns = Math.max(1, Math.min(most, Math.floor(CONTENT_WIDTH / Math.max(1, itemWidth)), items.length || 1));
  return { section, items, minCount: Math.min(frag.items?.minCount || count, count), itemWidth };
}

// sizeWorkSpaces gives each work space without a row count one row per step
// of the working it is for, plus one. In a multi-part question that is the
// working of its own part; elsewhere, of the whole item.
function sizeWorkSpaces(nodes: Node[]): void {
  const rowsFor = (scope: readonly Node[]) => 1 + fieldsOf(scope).reduce((s, f) => s + steps(f.answer?.work ?? ''), 0);
  const fill = (scope: readonly Node[], rows: number) => {
    for (const n of scope) {
      if (n.kind.case === 'workSpace' && n.kind.value.rows === 0) {
        n.kind.value.rows = rows + (n.kind.value.field ? 1 : 0);
      }
    }
  };
  for (const n of nodes) {
    if (n.kind.case === 'multiPartQuestion') {
      for (const p of n.kind.value.parts) {
        fill(p.response, rowsFor([...p.prompt, ...p.response]));
      }
    }
  }
  fill(nodes, rowsFor(nodes));
}

// headHeight is the height of a section above its items.
function headHeight(s: ComposedSheet_Section, w: Writing): number {
  let h = SECTION_HEADER;
  if (s.explainer) {
    h += textHeight(s.explainer, CONTENT_WIDTH) + NODE_GAP;
  }
  if (s.figure.length > 0) {
    h += nodesHeight(s.figure, CONTENT_WIDTH, w) + ITEM_GAP;
  }
  if (s.example) {
    const textH = s.example.text ? textHeight(s.example.text, CONTENT_WIDTH / 2) : 0;
    h += Math.max(nodesHeight(s.example.nodes, CONTENT_WIDTH / 2, w), textH) + 28 + ITEM_GAP;
  }
  return h;
}

function rowsHeight(items: readonly ComposedSheet_Item[], columns: number, w: Writing): number[] {
  const width = CONTENT_WIDTH / columns - ITEM_LABEL_WIDTH;
  const rows: number[] = [];
  for (let i = 0; i < items.length; i += columns) {
    const row = items.slice(i, i + columns);
    rows.push(Math.max(...row.map((it) => nodesHeight(it.nodes, width, w))) + ITEM_GAP);
  }
  return rows;
}

// paginate fills pages in order. A section that does not fit first drops
// items down to its minimum, then carries its remaining rows to the next
// page. The worked example and figure never split from the first row.
function paginate(planned: Planned[], maxPages: number, problems: string[], advice: string[], w: Writing): ComposedSheet['pages'] {
  const pages = [create(ComposedSheet_PageSchema, {})];
  let left = BODY_HEIGHT;
  const page = () => pages[pages.length - 1];
  const newPage = () => {
    pages.push(create(ComposedSheet_PageSchema, {}));
    left = BODY_HEIGHT;
  };

  for (const p of planned) {
    const head = headHeight(p.section, w);
    let rows = rowsHeight(p.items, p.section.columns, w);
    let total = head + rows.reduce((a, b) => a + b, 0);
    // Drop items, a row at a time, while that is allowed and still needed.
    let items = p.items;
    while (total > left && items.length - p.section.columns >= p.minCount && items.length > p.section.columns) {
      const keep = items.length - (items.length % p.section.columns || p.section.columns);
      if (keep < p.minCount) {
        break;
      }
      items = items.slice(0, keep);
      rows = rowsHeight(items, p.section.columns, w);
      total = head + rows.reduce((a, b) => a + b, 0);
    }
    if (items.length < p.items.length) {
      advice.push(`Section "${p.section.instruction}" was cut from ${p.items.length} to ${items.length} items to fit.`);
    }
    // Start a new page if not even the head and first row fit here.
    if (head + (rows[0] ?? 0) > left && page().sections.length > 0) {
      newPage();
    }
    let section = p.section;
    section.items = [];
    let used = head;
    let r = 0;
    for (let i = 0; i < items.length; i += section.columns, r++) {
      if (used + rows[r] > left && section.items.length > 0) {
        section.estimatedHeight = Math.round(used);
        page().sections.push(section);
        page().estimatedHeight += used;
        newPage();
        section = create(ComposedSheet_SectionSchema, { ...p.section, items: [], continued: true, example: undefined, figure: [], explainer: '' });
        used = SECTION_HEADER;
      }
      section.items.push(...items.slice(i, i + section.columns));
      used += rows[r];
    }
    section.estimatedHeight = Math.round(used);
    page().sections.push(section);
    page().estimatedHeight += used;
    left -= used;
  }
  for (const p of pages) {
    p.estimatedHeight = Math.round(p.estimatedHeight);
  }
  if (pages.length > maxPages) {
    problems.push(`The worksheet needs ${pages.length} pages; it may have ${maxPages}.`);
  }
  pages.forEach((p, i) => {
    if (p.estimatedHeight > BODY_HEIGHT) {
      problems.push(`Page ${i + 1} is estimated at ${p.estimatedHeight}px; the page body holds ${BODY_HEIGHT}px.`);
    }
  });
  return pages;
}

// number labels sections and items in page order, renames each field from
// its placeholder to an id made from its item's label, and builds the key.
function number(sheet: ComposedSheet, ws: Worksheet): void {
  const style = ws.numbering?.style ?? Numbering_Style.UNSPECIFIED;
  const first = ws.numbering?.first || 1;
  let sectionN = 0;
  let itemN = first - 1;
  let prev: string | undefined;
  for (const page of sheet.pages) {
    for (const s of page.sections) {
      // A continued section keeps its label and its item count.
      if (!s.continued) {
        sectionN++;
        s.label = style === Numbering_Style.UNSPECIFIED ? String.fromCharCode(64 + sectionN) : String(first + sectionN - 1);
        prev = s.label;
      } else {
        s.label = prev ?? '';
      }
      const inSection = s.continued ? countBefore(sheet, s) : 0;
      s.items.forEach((it, j) => {
        let label: string;
        switch (style) {
          case Numbering_Style.SECTION_LETTERS:
            label = `${s.label}${letters(inSection + j)}`;
            break;
          case Numbering_Style.SECTION_DOTTED:
            label = `${s.label}.${inSection + j + 1}`;
            break;
          default:
            label = String(++itemN);
        }
        it.label = label;
        const name = (l: string, fields: Field[], keyLabel: string) => {
          const base = 'q' + l.toLowerCase().replace(/[^a-z0-9]/g, '_');
          fields.forEach((f: Field, k: number) => {
            f.id = k === 0 ? base : `${base}-${k + 1}`;
            sheet.key.push(create(ComposedSheet_KeyEntrySchema, { itemLabel: keyLabel, field: f }));
          });
        };
        const own: Field[] = [];
        for (const n of it.nodes) {
          if (n.kind.case !== 'multiPartQuestion') {
            own.push(...fieldsOf([n]));
            continue;
          }
          // Parts are labelled 3a, 3b, and their fields named after them.
          own.push(...fieldsOf(n.kind.value.stem));
          n.kind.value.parts.forEach((p, j) => {
            p.label = `${label}${letters(j)}`;
            name(p.label, fieldsOf([...p.prompt, ...p.response]), p.label);
          });
        }
        name(label, own, label);
        it.key = solved(it.nodes);
      });
    }
  }
}

// solved writes an item with its answers filled in, one clause per node
// that has any: maths as a solved line, other nodes as their answers.
function solved(nodes: readonly Node[]): string {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.kind.case === 'multiPartQuestion') {
      for (const p of n.kind.value.parts) {
        const answers = fieldsOf([...p.prompt, ...p.response]).map((f) => (f.answer?.work ? `${f.answer.work} = ${f.answer.text}` : (f.answer?.text ?? '')));
        out.push(`${p.label}: ${answers.join(', ')}`);
      }
      continue;
    }
    if (n.kind.case === 'math') {
      const atoms = n.kind.value.atoms;
      if (!fieldsOf([n]).length) {
        continue;
      }
      out.push(
        atoms
          .map((a) => {
            const k = a.kind;
            switch (k.case) {
              case 'text':
                return k.value;
              case 'fraction':
                return `${k.value.num}/${k.value.den}`;
              case 'blank':
              case 'fractionBlank':
              case 'compare':
                return k.value.answer?.text ?? '';
              case 'halfBlank': {
                const ans = k.value.field?.answer?.text ?? '';
                return k.value.blankNumerator ? `${ans}/${k.value.given}` : `${k.value.given}/${ans}`;
              }
            }
            return '';
          })
          .join(' '),
      );
    } else {
      const answers = fieldsOf([n]).map((f) => f.answer?.text ?? '');
      if (answers.length) {
        out.push(answers.join(', '));
      }
    }
  }
  return out.join('; ');
}

// letters names item n from 0 as a, b, ... z, aa, ab, ... so a section with
// more than 26 items still gets distinct labels.
function letters(n: number): string {
  let out = '';
  for (n++; n > 0; n = Math.floor((n - 1) / 26)) {
    out = String.fromCharCode(97 + ((n - 1) % 26)) + out;
  }
  return out;
}

// countBefore counts the items of a continued section's earlier parts.
function countBefore(sheet: ComposedSheet, target: ComposedSheet_Section): number {
  let n = 0;
  let last: ComposedSheet_Section | undefined;
  for (const page of sheet.pages) {
    for (const s of page.sections) {
      if (s === target) {
        return last && last.fragmentId === s.fragmentId ? n : 0;
      }
      n = s.continued ? n + s.items.length : s.items.length;
      last = s;
    }
  }
  return 0;
}

// checkArc notes a worksheet whose stages run out of order: a review after
// new material, or practice before anything introduces it.
function checkArc(planned: Planned[], advice: string[]): void {
  let seenNew = false;
  let introduced = false;
  for (const p of planned) {
    const s = p.section.stage;
    if (s === Stage.REVIEW && seenNew) {
      advice.push(`"${p.section.instruction}" reviews a prerequisite after new material; reviews usually come first.`);
    }
    if (s === Stage.INTRODUCE) {
      introduced = true;
    }
    if ((s === Stage.GUIDED || s === Stage.PRACTICE) && !introduced && !p.section.example) {
      // Practice with no introduction is fine for a review sheet; only note it
      // when nothing on the sheet shows a worked example.
      if (!planned.some((q) => q.section.example)) {
        advice.push(`"${p.section.instruction}" is practice, and nothing on the sheet introduces it with a worked example.`);
      }
    }
    if (s !== Stage.REVIEW && s !== Stage.UNSPECIFIED) {
      seenNew = true;
    }
  }
}

// keyNodes lists every node of a composed sheet, for checks.
export function allNodes(sheet: ComposedSheet): Node[] {
  const out: Node[] = [];
  for (const p of sheet.pages) {
    for (const s of p.sections) {
      out.push(...s.figure, ...(s.example?.nodes ?? []));
      for (const it of s.items) {
        out.push(...it.nodes);
      }
    }
  }
  return out;
}
