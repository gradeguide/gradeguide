import { create } from '@bufbuild/protobuf';

import { LibrarySchema, WorksheetSchema } from '../../../worksheet/proto/v1/worksheet_pb.js';
import { Catalog, type SiteData } from './catalog.js';

function catalog(): Catalog {
  const site: SiteData = {
    grades: ['3', '4'],
    strands: [{ id: 'fractions', name: 'Fractions' }],
    skills: [
      { id: 'a', code: '3.NF.A.1', grade: '3', strand: 'fractions', name: 'Unit fractions', worksheets: [{ id: 'ws-a', role: 'practises', pages: 1 }] },
      {
        id: 'b',
        code: '4.NF.A.1',
        grade: '4',
        strand: 'fractions',
        name: 'Equivalent fractions',
        month: 2,
        path: '/math/grade-4/b/',
        worksheets: [
          { id: 'ws-b', role: 'teaches', pages: 2, pdf: '/worksheets/ws-b.pdf' },
          { id: 'ws-b2', role: 'practises', pages: 1 },
          { id: 'ws-a', role: 'reviews', pages: 1 },
        ],
      },
      { id: 'c', code: '4.NF.B.3', grade: '4', strand: 'fractions', name: 'Adding fractions', month: 3, worksheets: [{ id: 'ws-c', role: 'practises', pages: 1 }] },
    ],
    links: [
      ['a', 'b'],
      ['b', 'c'],
    ],
  };
  const library = create(LibrarySchema, {
    worksheets: ['ws-a', 'ws-b', 'ws-b2', 'ws-c'].map((id) => create(WorksheetSchema, { id, title: id.toUpperCase(), homeTip: id === 'ws-b' ? 'Fold a strip.' : '' })),
  });
  return new Catalog(site, library);
}

describe('Catalog', () => {
  it('places a sheet in the grade of the skills it teaches, not the ones it reviews', () => {
    const c = catalog();
    expect(c.sheet('ws-a')!.grade).toBe('3');
    expect(c.sheet('ws-a')!.skills.map((s) => s.code)).toEqual(['3.NF.A.1']);
    expect(c.sheet('ws-b')!.pages).toBe(2);
    expect(c.sheet('ws-b')!.pdf).toBe('/worksheets/ws-b.pdf');
    expect(c.sheet('ws-b')!.homeTip).toBe('Fold a strip.');
  });

  it('finds sheets by grade and topic, or by a search across grades', () => {
    const c = catalog();
    expect(c.find('4', '', '').map((s) => s.id)).toEqual(['ws-b', 'ws-b2', 'ws-c']);
    expect(c.find('4', 'other', '').length).toBe(0);
    expect(c.find('4', '', 'unit').map((s) => s.id)).toEqual(['ws-a']);
  });

  it('groups related sheets without repeating one', () => {
    const c = catalog();
    const groups = c.related(c.sheet('ws-b')!).map((g) => `${g.kind}:${g.sheets.map((s) => s.id).join(',')}`);
    // ws-c's skill is both the next skill and taught the same month; it is
    // listed once, under the first group it belongs to.
    expect(groups).toEqual(['same:ws-b2', 'before:ws-a', 'after:ws-c']);
  });

  it('files the library by month, then skill', () => {
    const c = catalog();
    const lib = c.byMonth('4', '').map((m) => `${m.month}:${m.skills.map((k) => k.skill.code + '=' + k.sheets.map((s) => s.id).join('+')).join(' ')}`);
    expect(lib).toEqual(['2:4.NF.A.1=ws-b+ws-b2', '3:4.NF.B.3=ws-c']);
  });
});
