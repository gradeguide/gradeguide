import { Curriculum, SiteData, plainStatement } from './curriculum';
import { formatHash, parseHash } from './view-state';

function skill(id: string, code: string, grade: string, month: number) {
  return { id, code, grade, strand: 'fractions-and-ratios', name: code, explanation: '', example: '', tryAtHome: '', draft: true, statement: '', month };
}

const DATA: SiteData = {
  version: 'test',
  grades: ['3', '4', '5'],
  strands: [{ id: 'fractions-and-ratios', name: 'Fractions and ratios', description: '' }],
  topics: [],
  units: [],
  skills: [skill('a', '3.NF.A.3', '3', 6), skill('b', '4.NF.A.1', '4', 2), skill('c', '4.NF.A.2', '4', 2), skill('d', '5.NF.A.1', '5', 6)],
  links: [
    ['a', 'b'],
    ['b', 'c'],
    ['b', 'd'],
    ['c', 'd'],
    ['a', 'missing'],
  ],
  credits: [],
};

describe('Curriculum', () => {
  const c = new Curriculum(DATA);

  it('lists what a skill needs first and leads to, in grade order', () => {
    expect(c.neededFirst('d').map((s) => s.code)).toEqual(['4.NF.A.1', '4.NF.A.2']);
    expect(c.leadsTo('b').map((s) => s.code)).toEqual(['4.NF.A.2', '5.NF.A.1']);
  });

  it('ignores links to skills it does not have', () => {
    expect(c.leadsTo('a').map((s) => s.id)).toEqual(['b']);
  });

  it('walks foundations back through earlier grades', () => {
    expect([...c.foundations('d')].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect([...c.foundations('d', 1)].sort()).toEqual(['b', 'c', 'd']);
  });

  it('lists a grade in code order', () => {
    expect(c.inGrade('4').map((s) => s.id)).toEqual(['b', 'c']);
  });
});

describe('Curriculum steps and worksheets', () => {
  const data: SiteData = {
    ...DATA,
    skills: [
      {
        ...skill('s', '4.NF.A.1', '4', 1),
        steps: ['Explain why $\\frac{a}{b}$ works', { id: 'c2', name: 'Short', text: 'Long' }],
        worksheets: [
          { id: 'r', title: 'r', pages: 1, href: '', answersHref: '', role: 'reviews' },
          { id: 'p', title: 'p', pages: 1, href: '', answersHref: '', role: 'practises' },
        ],
      },
    ],
  };
  const c = new Curriculum(data);

  it('gives text-only steps an id and plain text', () => {
    expect(c.steps('s')).toEqual([
      { id: 's#1', name: 'Explain why a/b works', text: 'Explain why a/b works' },
      { id: 'c2', name: 'Short', text: 'Long' },
    ]);
  });

  it('lists review worksheets last', () => {
    expect(c.worksheets('s').map((w) => w.id)).toEqual(['p', 'r']);
  });
});

describe('plainStatement', () => {
  it('turns TeX into plain text', () => {
    expect(plainStatement('Explain why $\\frac{a}{b}$ equals $\\frac{(n \\times a)}{(n \\times b)}$.')).toBe('Explain why a/b equals (n × a)/(n × b).');
  });
});

describe('address', () => {
  it('round-trips a state', () => {
    const s = { view: 'path' as const, grade: 'K', skill: 'K.CC.A.1', target: 'K.CC.A.2' };
    expect(parseHash(formatHash(s))).toEqual(s);
    expect(formatHash(s)).toBe('#path/K/K.CC.A.1/K.CC.A.2');
    expect(formatHash({ ...s, target: '' })).toBe('#path/K/K.CC.A.1');
  });

  it('falls back to the map for grade 4', () => {
    expect(parseHash('')).toEqual({ view: 'map', grade: '4', skill: '', target: '' });
    expect(parseHash('#nonsense').view).toBe('map');
  });
});
