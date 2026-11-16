// Item generators for grade 6 to 8 skills that a student does on paper by
// drawing or by reading a drawing: transformations on a grid, sketching a
// graph from a story, the area proof of the Pythagorean theorem, describing
// a data set, choosing a measure of center, and simulation with random
// digits. generateG68 calls generateG68Figures first.
import { create } from '@bufbuild/protobuf';

import { type Node, type CoordinatePlane_Segment, LinePlotSchema, LinesSchema } from '../proto/v1/nodes_pb.js';
import { type ItemKind, DataSetStats_Mode, Probability_Mode, Pythagorean_Mode, SketchGraph_Mode, Transformation_Mode } from '../proto/v1/worksheet_pb.js';
import { blank, math, node, row, stack, text } from './build.js';
import { type Ctx, pickFresh, unique } from './kinds.js';
import { choices, field, fracText, gp, nonzero, num, plane, pt, seg, spread, work } from './kinds_g68.js';

type P = [number, number];

export function generateG68Figures(kind: ItemKind, ctx: Ctx): Node[] | undefined {
  const k = kind.kind;
  switch (k.case) {
    case 'transformation':
      return transformation(k.value.mode || Transformation_Mode.DRAW, ctx);
    case 'sketchGraph':
      return sketchGraph(k.value.mode || SketchGraph_Mode.SKETCH, ctx);
    case 'pythagorean':
      return k.value.mode === Pythagorean_Mode.SQUARE_AREAS ? squareAreas(ctx) : undefined;
    case 'dataSetStats':
      return k.value.mode === DataSetStats_Mode.ATTRIBUTE ? attribute(ctx) : k.value.mode === DataSetStats_Mode.CHOOSE_CENTER ? chooseCenter(ctx) : undefined;
    case 'probability':
      return k.value.mode === Probability_Mode.SIMULATION ? simulation(ctx) : undefined;
  }
  return undefined;
}

// Moves, as functions of a point. Each has its direction as a student
// writes it.
interface Move {
  say: string;
  at: (p: P) => P;
}

const lr = (n: number) => `${Math.abs(n)} ${Math.abs(n) === 1 ? 'unit' : 'units'} ${n > 0 ? 'right' : 'left'}`;
const ud = (n: number) => `${Math.abs(n)} ${Math.abs(n) === 1 ? 'unit' : 'units'} ${n > 0 ? 'up' : 'down'}`;

function translate(dx: number, dy: number): Move {
  const say = dx === 0 ? ud(dy) : dy === 0 ? lr(dx) : `${lr(dx)} and ${ud(dy)}`;
  return { say: `Translate {f} ${say}.`, at: ([x, y]) => [x + dx, y + dy] };
}

const REFLECT_X: Move = { say: 'Reflect {f} across the x-axis.', at: ([x, y]) => [x, -y] };
const REFLECT_Y: Move = { say: 'Reflect {f} across the y-axis.', at: ([x, y]) => [-x, y] };
const ROTATE_CCW: Move = { say: 'Rotate {f} 90° counterclockwise about the origin.', at: ([x, y]) => [-y, x] };
const ROTATE_CW: Move = { say: 'Rotate {f} 90° clockwise about the origin.', at: ([x, y]) => [y, -x] };
const ROTATE_180: Move = { say: 'Rotate {f} 180° about the origin.', at: ([x, y]) => [-x, -y] };

function dilate(f: number, shown: string): Move {
  return { say: `Dilate {f} by a scale factor of ${shown} with the origin as the center.`, at: ([x, y]) => [f * x, f * y] };
}

const LIMIT = 6;
// Vertices stay a square in from the edge, so their labels fit on the grid.
const onGrid = (ps: P[]) => ps.every(([x, y]) => Math.abs(x) < LIMIT && Math.abs(y) < LIMIT);

// triangle picks three grid points, no two in a line across or up, inside
// ±r, so the triangle is scalene and its turns are easy to see.
function triangle(ctx: Ctx, r: number, even = false): P[] {
  const { rng } = ctx;
  for (;;) {
    const t: P[] = [];
    while (t.length < 3) {
      const q: P = [rng.int(-r, r), rng.int(-r, r)];
      if (even) {
        q[0] -= q[0] % 2;
        q[1] -= q[1] % 2;
      }
      if (!t.some(([a, b]) => a === q[0] || b === q[1])) {
        t.push(q);
      }
    }
    const [[ax, ay], [bx, by], [cx, cy]] = t;
    const area2 = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay));
    const sides = [
      [ax - bx, ay - by],
      [bx - cx, by - cy],
      [cx - ax, cy - ay],
    ].map(([dx, dy]) => dx * dx + dy * dy);
    if (area2 >= 6 && new Set(sides).size === 3) {
      return t;
    }
  }
}

const NAMES = ['A', 'B', 'C', 'D'];

function outline(ps: P[], more: { dashed?: boolean } = {}): CoordinatePlane_Segment[] {
  return ps.map(([x, y], i) => seg(x, y, ps[(i + 1) % ps.length][0], ps[(i + 1) % ps.length][1], more));
}

function labelled(ps: P[], mark: string) {
  // Adding 0 turns −0 from a reflection into 0.
  return ps.map(([x, y], i) => gp(x + 0, y + 0, NAMES[i] + mark));
}

// grid is the plane for a figure. A student draws on squares of 17 points;
// a figure only to read gets 14.
function grid(init: Parameters<typeof plane>[0], cell = 14): Node {
  return plane({ xMin: -LIMIT, xMax: LIMIT, yMin: -LIMIT, yMax: LIMIT, cell, labelEvery: 2, ...init });
}

// overlaps reports whether two figures' boxes overlap or touch, which
// would make the image hard to tell from the figure.
function overlaps(a: P[], b: P[]): boolean {
  const box = (ps: P[]) => [Math.min(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), Math.max(...ps.map((p) => p[1]))];
  const [a0, a1, a2, a3] = box(a);
  const [b0, b1, b2, b3] = box(b);
  return a0 <= b1 && b0 <= a1 && a2 <= b3 && b2 <= a3;
}

// apart reports whether no vertex of b is a vertex of a. A dilation from
// the origin always overlaps its figure, so it is held only to this.
function apart(a: P[], b: P[]): boolean {
  return !b.some(([x, y]) => a.some(([u, v]) => u === x && v === y));
}

// rule is the blanks for a translation's rule, (x + a, y + b).
function rule(ctx: Ctx, dx: number, dy: number, label: string): Node {
  return math('(x +', blank(field(ctx, `${label} x`, num(dx))), ', y +', blank(field(ctx, `${label} y`, num(dy))), ')');
}

function coords(ctx: Ctx, label: string, [x, y]: P): Node {
  return math(`${label} (`, blank(field(ctx, `${label} x`, num(x))), ',', blank(field(ctx, `${label} y`, num(y))), ')');
}

function transformation(mode: Transformation_Mode, ctx: Ctx): Node[] {
  const { rng } = ctx;
  const f = 'triangle ABC';
  switch (mode) {
    case Transformation_Mode.DRAW_SEQUENCE: {
      // Chosen outside the retries, so a retry does not use up a form.
      const first0 = spread(ctx, 'seqFirst', 4);
      const [tri, first, dx, dy] = pickFresh(ctx, 'seq', () => {
        for (;;) {
          const tri = triangle(ctx, 4);
          const first = first0;
          const [dx, dy] = rng.next() < 0.5 ? [nonzero(ctx, -4, 4), 0] : [0, nonzero(ctx, -4, 4)];
          const m1 = [REFLECT_X, REFLECT_Y, ROTATE_180, ROTATE_CCW][first];
          const mid = tri.map(m1.at);
          const end = mid.map(translate(dx, dy).at);
          if (onGrid(mid) && onGrid(end) && !overlaps(tri, end)) {
            return [tri, first, dx, dy] as const;
          }
        }
      });
      const m1 = [REFLECT_X, REFLECT_Y, ROTATE_180, ROTATE_CCW][first];
      const m2 = translate(dx, dy);
      const mid = tri.map(m1.at);
      const end = mid.map(m2.at);
      return [
        text(m1.say.replace('{f}', f) + ' ' + m2.say.replace('{f}', 'the image')),
        grid({
          points: labelled(tri, ''),
          segments: outline(tri),
          answerSegments: [...outline(mid, { dashed: true }), ...outline(end)],
          answerPoints: labelled(end, '″'),
          plotField: ctx.fields.field(`the final image of ${pt(...tri[0])}`, end.map((p, i) => `${NAMES[i]}″${pt(...p)}`).join(', ')),
        }, 17),
        coords(ctx, 'A″', end[0]),
      ];
    }
    case Transformation_Mode.PROPERTIES: {
      // A right trapezoid: AB along the bottom, AD up the left side, and DC
      // parallel to AB.
      // Chosen outside the retries, so a retry does not use up a form.
      const form0 = spread(ctx, 'propsForm', 4);
      const [quad, form] = pickFresh(ctx, 'props', () => {
        for (;;) {
          const w = rng.int(3, 4);
          const t = rng.int(1, w - 1);
          const h = rng.int(2, 3);
          const [x0, y0] = [rng.int(1 - LIMIT, LIMIT - 1 - w), rng.int(1 - LIMIT, LIMIT - 1 - h)];
          const quad: P[] = [
            [x0, y0],
            [x0 + w, y0],
            [x0 + t, y0 + h],
            [x0, y0 + h],
          ];
          const form = form0;
          const img = quad.map([ROTATE_CCW, ROTATE_180, REFLECT_Y, ROTATE_CW][form].at);
          if (onGrid(img) && !overlaps(quad, img)) {
            return [quad, form] as const;
          }
        }
      });
      const move = [ROTATE_CCW, ROTATE_180, REFLECT_Y, ROTATE_CW][form];
      const img = quad.map(move.at);
      const [w, h, t] = [quad[1][0] - quad[0][0], quad[3][1] - quad[0][1], quad[2][0] - quad[0][0]];
      const noun = ['rotation of 90° counterclockwise about the origin', 'rotation of 180° about the origin', 'reflection across the y-axis', 'rotation of 90° clockwise about the origin'][form];
      return [
        text(`Trapezoid A′B′C′D′ is the image of trapezoid ABCD after a ${noun}.`),
        grid({ points: [...labelled(quad, ''), ...labelled(img, '′')], segments: [...outline(quad), ...outline(img)] }),
        row(math('AB =', blank(field(ctx, 'AB', String(w)))), math('A′B′ =', blank(field(ctx, 'A′B′', String(w))))),
        row(math('AD =', blank(field(ctx, 'AD', String(h)))), math('A′D′ =', blank(field(ctx, 'A′D′', String(h))))),
        row(math('DC =', blank(field(ctx, 'DC', String(t)))), math('D′C′ =', blank(field(ctx, 'D′C′', String(t))))),
        math('∠A = 90°,', '∠A′ =', blank(field(ctx, 'angle A′', '90', ['90°'])), '°'),
        text('AB ∥ DC. Is A′B′ ∥ D′C′?'),
        choices(ctx, 'A′B′ parallel to D′C′', ['Yes', 'No'], 'Yes'),
      ];
    }
    case Transformation_Mode.NAME_MOVE: {
      // Chosen outside the retries, so a retry does not use up a form.
      const form0 = spread(ctx, 'nameForm', 5);
      const [tri, form, dx, dy] = pickFresh(ctx, 'name', () => {
        for (;;) {
          const tri = triangle(ctx, 4);
          const form = form0;
          const [dx, dy] = [nonzero(ctx, -5, 5), nonzero(ctx, -5, 5)];
          const m = [translate(dx, dy), REFLECT_X, REFLECT_Y, ROTATE_CCW, ROTATE_180][form];
          const img = tri.map(m.at);
          if (onGrid(img) && !overlaps(tri, img)) {
            return [tri, form, dx, dy] as const;
          }
        }
      });
      const m = [translate(dx, dy), REFLECT_X, REFLECT_Y, ROTATE_CCW, ROTATE_180][form];
      const img = tri.map(m.at);
      const kindName = ['Translation', 'Reflection', 'Reflection', 'Rotation', 'Rotation'][form];
      const figure = grid({ points: [...labelled(tri, ''), ...labelled(img, '′')], segments: [...outline(tri), ...outline(img)] });
      const which = [choices(ctx, `move to ${pt(...img[0])}`, ['Translation', 'Reflection', 'Rotation'], kindName)];
      const detail =
        form === 0
          ? [text('(x, y) moves to:'), rule(ctx, dx, dy, 'translation')]
          : form <= 2
            ? [row(math('Across:'), choices(ctx, 'reflection axis', ['x-axis', 'y-axis'], form === 1 ? 'x-axis' : 'y-axis'))]
            : [text('Counterclockwise about the origin by:'), math(blank(field(ctx, 'rotation angle', form === 3 ? '90' : '180', [form === 3 ? '90°' : '180°'])), '°')];
      return [figure, ...which, ...detail];
    }
    case Transformation_Mode.NAME_SEQUENCE: {
      // Chosen outside the retries, so a retry does not use up a form.
      const axis0 = spread(ctx, 'nameSeqAxis', 2);
      const [tri, axis, dx, dy] = pickFresh(ctx, 'nameSeq', () => {
        for (;;) {
          const tri = triangle(ctx, 4);
          const axis = axis0;
          const [dx, dy] = [nonzero(ctx, -4, 4), nonzero(ctx, -4, 4)];
          const end = tri.map([REFLECT_X, REFLECT_Y][axis].at).map(translate(dx, dy).at);
          if (onGrid(end) && !overlaps(tri, end)) {
            return [tri, axis, dx, dy] as const;
          }
        }
      });
      const end = tri.map([REFLECT_X, REFLECT_Y][axis].at).map(translate(dx, dy).at);
      return [
        grid({ points: [...labelled(tri, ''), ...labelled(end, '″')], segments: [...outline(tri), ...outline(end)] }),
        text('Reflect across the:'),
        choices(ctx, 'first reflection axis', ['x-axis', 'y-axis'], axis === 0 ? 'x-axis' : 'y-axis'),
        text('Then translate. (x, y) moves to:'),
        rule(ctx, dx, dy, 'then translate'),
      ];
    }
    case Transformation_Mode.CONGRUENT_OR_SIMILAR: {
      // Half the items are similar only: a dilation from the origin by 2 or
      // by 1/2. The others are a rotation or reflection then a translation.
      // Chosen outside the retries, so a retry does not use up a form.
      const form0 = spread(ctx, 'congForm', 4);
      const [tri, form, dx, dy] = pickFresh(ctx, 'cong', () => {
        for (;;) {
          const form = form0;
          const tri = triangle(ctx, form === 3 ? 6 : form === 2 ? 3 : 4, form === 3);
          const [dx, dy] = [nonzero(ctx, -3, 3), nonzero(ctx, -3, 3)];
          const img = congruentOrSimilar(form, dx, dy, tri);
          if (onGrid(img) && (form >= 2 ? apart(tri, img) : !overlaps(tri, img))) {
            return [tri, form, dx, dy] as const;
          }
        }
      });
      const img = congruentOrSimilar(form, dx, dy, tri);
      const similar = form >= 2;
      const scale = form === 2 ? '2' : form === 3 ? '1/2' : '1';
      const how = [
        `Rotate 180° about the origin, then translate ${lr(dx)} and ${ud(dy)}.`,
        `Reflect across the y-axis, then translate ${lr(dx)} and ${ud(dy)}.`,
        'Dilate by a scale factor of 2 with the origin as the center.',
        'Dilate by a scale factor of 1/2 with the origin as the center.',
      ][form];
      return [
        grid({ points: [...labelled(tri, ''), ...labelled(img, '′')], segments: [...outline(tri), ...outline(img)] }),
        choices(ctx, `congruent or similar: ${pt(...img[0])}`, ['Congruent', 'Similar, not congruent'], similar ? 'Similar, not congruent' : 'Congruent'),
        text('Scale factor from ABC to A′B′C′:'),
        math(blank(field(ctx, `scale factor to ${pt(...img[0])}`, scale, scale === '1/2' ? ['0.5'] : []))),
        text('Describe a sequence of moves that takes ABC to A′B′C′.'),
        node({ case: 'lines', value: create(LinesSchema, { count: 2, field: ctx.fields.field(`sequence to ${pt(...img[0])}`, how) }) }),
      ];
    }
    default: {
      // Chosen outside the retries, so a retry does not use up a form.
      const form0 = spread(ctx, 'drawForm', 7);
      const [tri, form, dx, dy] = pickFresh(ctx, 'draw', () => {
        for (;;) {
          const form = form0;
          const tri = triangle(ctx, form === 6 ? 3 : 4);
          const [dx, dy] = [nonzero(ctx, -4, 4), nonzero(ctx, -4, 4)];
          const img = tri.map(drawMove(form, dx, dy).at);
          if (onGrid(img) && (form === 6 ? apart(tri, img) : !overlaps(tri, img))) {
            return [tri, form, dx, dy] as const;
          }
        }
      });
      const m = drawMove(form, dx, dy);
      const img = tri.map(m.at);
      return [
        text(m.say.replace('{f}', f)),
        grid({
          points: labelled(tri, ''),
          segments: outline(tri),
          answerSegments: outline(img),
          answerPoints: labelled(img, '′'),
          plotField: ctx.fields.field(`the image of ${pt(...tri[0])}`, img.map((p, i) => `${NAMES[i]}′${pt(...p)}`).join(', ')),
        }, 17),
        coords(ctx, 'A′', img[0]),
      ];
    }
  }
}

function drawMove(form: number, dx: number, dy: number): Move {
  return [translate(dx, dy), REFLECT_X, REFLECT_Y, ROTATE_CCW, ROTATE_CW, ROTATE_180, dilate(2, '2')][form];
}

function congruentOrSimilar(form: number, dx: number, dy: number, tri: P[]): P[] {
  switch (form) {
    case 0:
      return tri.map(ROTATE_180.at).map(translate(dx, dy).at);
    case 1:
      return tri.map(REFLECT_Y.at).map(translate(dx, dy).at);
    case 2:
      return tri.map(dilate(2, '2').at);
    default:
      return tri.map(dilate(0.5, '1/2').at);
  }
}

// A story told in pieces. Each piece lasts some time and changes the
// quantity by an amount; the graph starts at start.
interface Story {
  say: string;
  y: string;
  start: number;
  pieces: [number, number][];
}

const STORIES: Story[] = [
  {
    say: 'Ana walks from home to the park at a steady pace. She plays at the park. Then she runs home.',
    y: 'Distance from home',
    start: 0,
    pieces: [
      [4, 6],
      [4, 0],
      [2, -6],
    ],
  },
  {
    say: 'A tub fills with water. The tap is turned off while Kai takes a bath. Then the plug is pulled and the tub drains slowly.',
    y: 'Water in the tub',
    start: 0,
    pieces: [
      [3, 6],
      [3, 0],
      [5, -6],
    ],
  },
  {
    say: 'An elevator rises from the ground floor. It stops to let people out. It rises again, faster. Then it goes all the way back down.',
    y: 'Height above the ground',
    start: 0,
    pieces: [
      [3, 3],
      [2, 0],
      [2, 4],
      [4, -7],
    ],
  },
  {
    say: 'A phone is fully charged in the morning. The battery runs down slowly all day. In the evening the phone charges quickly until it is full. Then it stays full.',
    y: 'Battery charge',
    start: 7,
    pieces: [
      [6, -5],
      [2, 5],
      [3, 0],
    ],
  },
  {
    say: 'An oven is turned on and heats up. It stays at the same temperature while a pizza bakes. Then it is turned off and cools slowly.',
    y: 'Oven temperature',
    start: 1,
    pieces: [
      [3, 6],
      [3, 0],
      [5, -6],
    ],
  },
  {
    say: 'A car starts with a full tank of gas and drives on the highway. It stops and quickly fills the tank. Then it drives again.',
    y: 'Gas in the tank',
    start: 7,
    pieces: [
      [5, -5],
      [1, 5],
      [5, -4],
    ],
  },
];

function sketchGraph(mode: SketchGraph_Mode, ctx: Ctx): Node[] {
  const s = STORIES[spread(ctx, 'story', STORIES.length)];
  const segs: CoordinatePlane_Segment[] = [];
  let [x, y] = [0, s.start];
  s.pieces.forEach(([dt, dy], i) => {
    segs.push(seg(x, y, x + dt, y + dy, mode === SketchGraph_Mode.DESCRIBE ? { label: NAMES[i], labelBefore: dy > 0 } : {}));
    [x, y] = [x + dt, y + dy];
  });
  const axes = { xMin: 0, xMax: 12, yMin: 0, yMax: 8, cell: 16, noNumbers: true, noGrid: true, xLabel: 'Time', yLabel: s.y };
  const word = ([, dy]: [number, number]) => (dy > 0 ? 'increasing' : dy < 0 ? 'decreasing' : 'constant');
  if (mode === SketchGraph_Mode.DESCRIBE) {
    const steep = s.pieces.map(([dt, dy]) => Math.abs(dy / dt));
    const top = steep.indexOf(Math.max(...steep));
    const letters = NAMES.slice(0, s.pieces.length);
    // The questions sit beside the graph.
    return [
      row(
        plane({ ...axes, segments: segs }),
        stack(
          ...s.pieces.map((p, i) => row(math(`${NAMES[i]}:`), choices(ctx, `piece ${NAMES[i]} of ${s.y}`, ['Increasing', 'Decreasing', 'Constant'], word(p)[0].toUpperCase() + word(p).slice(1)))),
          text(`${s.y} changes fastest in piece:`),
          choices(ctx, `steepest piece of ${s.y}`, letters, letters[top]),
        ),
      ),
    ];
  }
  return [
    text(s.say),
    plane({ ...axes, answerSegments: segs, plotField: ctx.fields.field(`sketch of ${s.y}`, s.pieces.map(word).join(', ')) }),
  ];
}

// The legs of the triangles in the area proof, small enough that the large
// square fits on a 7 by 7 grid.
const LEGS: P[] = [
  [1, 2],
  [2, 3],
  [1, 3],
  [3, 4],
  [2, 4],
  [1, 4],
  [2, 5],
];

function squareAreas(ctx: Ctx): Node[] {
  const [a, b] = LEGS[spread(ctx, 'legs', LEGS.length)];
  const n = a + b;
  const segments = [
    seg(0, 0, a, 0, { label: String(a) }),
    seg(a, 0, n, 0, { label: String(b) }),
    seg(n, 0, n, n),
    seg(n, n, 0, n),
    seg(0, n, 0, b, { label: String(a), labelBefore: true }),
    seg(0, b, 0, 0, { label: String(b), labelBefore: true }),
    seg(a, 0, n, a),
    seg(n, a, b, n),
    seg(b, n, 0, b),
    seg(0, b, a, 0),
  ];
  const tri = (a * b) / 2;
  return [
    text(`The large square has sides of ${a} + ${b} units. The tilted square inside it has sides c units long.`),
    // The large square is drawn about 170 points wide whatever its size.
    plane({ xMin: 0, xMax: n, yMin: 0, yMax: n, cell: Math.floor(168 / n), noAxes: true, segments }),
    work(2),
    math('Large square:', blank(field(ctx, `large square ${a} ${b}`, String(n * n))), 'sq units'),
    math('One triangle:', blank(field(ctx, `one triangle ${a} ${b}`, num(tri), tri % 1 ? [`${a * b}/2`, `${Math.floor(tri)} 1/2`] : [])), 'sq units'),
    math('Tilted square:', blank(field(ctx, `tilted square ${a} ${b}`, String(a * a + b * b))), 'sq units'),
    math(`${a}² + ${b}² =`, blank(field(ctx, `sum of squares ${a} ${b}`, String(a * a + b * b)))),
  ];
}

// Studies for describing a data set: what was measured, the unit, the tool,
// and the values.
const STUDIES: { say: string; attribute: [string, string, string]; unit: string; also: string[]; tool: string; lo: number; hi: number }[] = [
  {
    say: 'A class measured the height of each sunflower in the school garden, to the nearest centimeter.',
    attribute: ['Height of each sunflower', 'Number of sunflowers', 'Color of each sunflower'],
    unit: 'centimeters',
    also: ['centimeter', 'cm'],
    tool: 'Meter stick',
    lo: 120,
    hi: 190,
  },
  {
    say: 'Students weighed their backpacks on the morning of a school day, to the nearest pound.',
    attribute: ['Weight of each backpack', 'Number of books in each backpack', 'Color of each backpack'],
    unit: 'pounds',
    also: ['pound', 'lb'],
    tool: 'Scale',
    lo: 6,
    hi: 19,
  },
  {
    say: 'A class found how long each student could hold a plank, to the nearest second.',
    attribute: ['Time each student held a plank', 'Number of students', 'Age of each student'],
    unit: 'seconds',
    also: ['second', 's', 'sec'],
    tool: 'Stopwatch',
    lo: 20,
    hi: 95,
  },
  {
    say: 'Students threw paper airplanes and measured how far each one flew, to the nearest foot.',
    attribute: ['Distance each airplane flew', 'Number of airplanes', 'Time each airplane was in the air'],
    unit: 'feet',
    also: ['foot', 'ft'],
    tool: 'Measuring tape',
    lo: 8,
    hi: 35,
  },
  {
    say: 'A class recorded the water temperature of a pond each morning, to the nearest degree Fahrenheit.',
    attribute: ['Temperature of the pond water', 'Number of mornings', 'Depth of the pond'],
    unit: 'degrees Fahrenheit',
    also: ['degrees', '°F', 'degrees F', 'F'],
    tool: 'Thermometer',
    lo: 48,
    hi: 66,
  },
];

const TOOLS = ['Meter stick', 'Scale', 'Stopwatch', 'Measuring tape', 'Thermometer'];

function attribute(ctx: Ctx): Node[] {
  const { rng } = ctx;
  const i = spread(ctx, 'study', STUDIES.length);
  const s = STUDIES[i];
  const n = rng.int(8, 12);
  const xs = Array.from({ length: n }, () => rng.int(s.lo, s.hi));
  // The right answer goes in a different place each time.
  const shift = rng.int(0, 2);
  const options = [0, 1, 2].map((j) => s.attribute[(j + shift) % 3]);
  const tools = [s.tool, ...TOOLS.filter((t) => t !== s.tool && ctx.rng.next() < 0.5)].slice(0, 3);
  while (tools.length < 3) {
    tools.push(TOOLS.find((t) => !tools.includes(t))!);
  }
  const toolShift = rng.int(0, 2);
  return [
    text(s.say),
    text(`Data: ${xs.join(', ')}`),
    math('What was measured?'),
    choices(ctx, `attribute: ${s.say}`, options, s.attribute[0]),
    row(
      math('Unit:', blank(field(ctx, `unit: ${s.say}`, s.unit, s.also))),
      math('Number of values:', blank(field(ctx, `number of values: ${s.say}`, String(n)))),
    ),
    row(math('Tool used:'), choices(ctx, `tool: ${s.say}`, [0, 1, 2].map((j) => tools[(j + toolShift) % 3]), s.tool)),
  ];
}

// Dot plots for choosing a center: some piled up with one far value, some
// balanced.
const CENTER_PLOTS = ['Pets owned by each student', 'Books each student read this month', 'Hours of practice each week', 'Goals each player scored'];

function chooseCenter(ctx: Ctx): Node[] {
  const { rng } = ctx;
  const caption = CENTER_PLOTS[spread(ctx, 'centerPlot', CENTER_PLOTS.length)];
  const skewed = spread(ctx, 'centerSkew', 2) === 0;
  const counts = pickFresh(ctx, 'center' + skewed, () => {
    for (;;) {
      const counts = Array(11).fill(0);
      if (skewed) {
        const n = rng.int(8, 11);
        for (let i = 0; i < n; i++) {
          counts[rng.int(0, 4)]++;
        }
        counts[rng.int(9, 10)]++;
      } else {
        const c = rng.int(3, 7);
        const side = [rng.int(1, 2), rng.int(1, 3), rng.int(0, 1)];
        counts[c] = rng.int(2, 4);
        side.forEach((k, j) => {
          counts[c - j - 1] = k;
          counts[c + j + 1] = k;
        });
      }
      const values = counts.flatMap((k, v) => Array(k).fill(v));
      const sum = values.reduce((p, q) => p + q, 0);
      // A mean with at most one decimal place.
      if ((sum * 10) % values.length === 0) {
        return counts;
      }
    }
  });
  const values = counts.flatMap((k, v) => Array(k).fill(v) as number[]);
  const mean = values.reduce((p, q) => p + q, 0) / values.length;
  const m = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[m] : (values[m - 1] + values[m]) / 2;
  const far = values[values.length - 1];
  const why = skewed
    ? `Median. The value ${far} is far from the rest and pulls the mean up, so the median is closer to most values.`
    : 'Mean. The data are balanced around the middle, so the mean and median are equal and the mean uses every value.';
  return [
    node({ case: 'linePlot', value: create(LinePlotSchema, { start: 0, end: 10, partsPerUnit: 1, counts, caption }) }),
    work(2),
    row(math('Mean:', blank(field(ctx, `mean: ${counts.join(',')}`, num(mean)))), math('Median:', blank(field(ctx, `median: ${counts.join(',')}`, num(median))))),
    row(math('Better measure of center:'), choices(ctx, `better center: ${counts.join(',')}`, ['Mean', 'Median'], skewed ? 'Median' : 'Mean')),
    text('Explain your choice.'),
    node({ case: 'lines', value: create(LinesSchema, { count: 2, field: ctx.fields.field(`why: ${counts.join(',')}`, why) }) }),
  ];
}

// Simulations: a chance in tenths, how many digits make one trial, the
// event to count, and a test of a trial's successes.
const SIMULATIONS: { say: string; tenths: number; size: number; success: string; event: string; test: (hits: number) => boolean }[] = [
  {
    say: 'A basketball player makes 30% of her free throws. Simulate games in which she takes 3 free throws.',
    tenths: 3,
    size: 3,
    success: 'a made shot',
    event: 'she makes at least 2',
    test: (h) => h >= 2,
  },
  {
    say: 'A prize is in 40% of cereal boxes. Simulate buying 3 boxes.',
    tenths: 4,
    size: 3,
    success: 'a box with a prize',
    event: 'at least 1 box has a prize',
    test: (h) => h >= 1,
  },
  {
    say: 'The chance of rain is 20% on each day. Simulate 4 days.',
    tenths: 2,
    size: 4,
    success: 'a day with rain',
    event: 'it does not rain on any day',
    test: (h) => h === 0,
  },
  {
    say: 'A guess on a true-false question is right 50% of the time. Simulate guessing on 4 questions.',
    tenths: 5,
    size: 4,
    success: 'a right answer',
    event: 'at least 3 guesses are right',
    test: (h) => h >= 3,
  },
  {
    say: 'At a school, 60% of students walk to school. Simulate picking 3 students.',
    tenths: 6,
    size: 3,
    success: 'a student who walks',
    event: 'all 3 students walk',
    test: (h) => h === 3,
  },
];

const TRIALS = 20;

function simulation(ctx: Ctx): Node[] {
  const { rng } = ctx;
  const s = SIMULATIONS[spread(ctx, 'simulation', SIMULATIONS.length)];
  const groups = pickFresh(ctx, 'digits' + s.say, () => {
    for (;;) {
      const gs = Array.from({ length: TRIALS }, () => Array.from({ length: s.size }, () => rng.int(0, 9)));
      const hits = gs.filter((g) => s.test(g.filter((d) => d < s.tenths).length)).length;
      if (hits > 0 && hits < TRIALS) {
        return gs;
      }
    }
  });
  const hits = groups.filter((g) => s.test(g.filter((d) => d < s.tenths).length)).length;
  const p = hits / TRIALS;
  const last = s.tenths - 1;
  const half = TRIALS / 2;
  const line = (gs: number[][]) => gs.map((g) => g.join('')).join('   ');
  return [
    text(s.say),
    text(`Each group of ${s.size} digits is one trial. Starting at 0, choose the digits that stand for ${s.success}.`),
    math('Digits: 0 to', blank(field(ctx, `digits for ${s.success}`, String(last)))),
    text(line(groups.slice(0, half))),
    text(line(groups.slice(half))),
    math(`Trials in which ${s.event}:`, blank(field(ctx, `trials: ${s.say}`, String(hits))), `out of ${TRIALS}`),
    math('Estimated probability:', blank(field(ctx, `estimate: ${s.say}`, `${hits}/${TRIALS}`, unique([fracText(hits, TRIALS), num(p), `${num(p * 100)}%`]).filter((x) => x !== `${hits}/${TRIALS}`)))),
  ];
}
