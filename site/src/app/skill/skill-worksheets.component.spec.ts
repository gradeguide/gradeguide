import { TestBed } from '@angular/core/testing';

import { StepData, WorksheetRef } from '../data/curriculum';
import { SkillWorksheetsComponent } from './skill-worksheets.component';

const STEPS: StepData[] = [
  { id: 'c1', name: 'Generate equivalent fractions', text: 'Generate equivalent fractions using a rule' },
  { id: 'c2', name: 'Recognise equivalent fractions', text: 'Recognize equivalent fractions' },
  { id: 'c3', name: 'Explain with pictures', text: 'Explain with fraction models' },
];

function sheet(id: string, role: WorksheetRef['role'], steps: [string, string][]): WorksheetRef {
  return { id, title: id, pages: 1, href: `/w/${id}`, answersHref: `/w/${id}?a`, role, steps: steps.map(([stepId, where]) => ({ stepId, where })) };
}

function render(worksheets: WorksheetRef[]) {
  const f = TestBed.createComponent(SkillWorksheetsComponent);
  f.componentRef.setInput('steps', STEPS);
  f.componentRef.setInput('worksheets', worksheets);
  f.detectChanges();
  return f;
}

const text = (el: HTMLElement, sel: string) => [...el.querySelectorAll(sel)].map((e) => e.textContent!.trim());

describe('SkillWorksheetsComponent', () => {
  const sheets = [
    sheet('strips', 'teaches', [['c1', 'Part A, problems 1–4'], ['c3', 'Part B, problems 5–8']]),
    sheet('names', 'practises', [['c2', 'Problems 1–10']]),
  ];

  it('counts the worksheets for each step and flags steps with none', () => {
    const el: HTMLElement = render(sheets).nativeElement;
    expect(text(el, '.steps .count')).toEqual(['1 sheet', '1 sheet', '1 sheet']);
    const gaps = render([sheets[0]]).nativeElement.querySelectorAll('.steps .count.gap');
    expect(gaps.length).toBe(1);
  });

  it('narrows the worksheets to a picked step and says where on the sheet', () => {
    const f = render(sheets);
    const el: HTMLElement = f.nativeElement;
    (el.querySelectorAll('.steps button')[2] as HTMLButtonElement).click();
    f.detectChanges();
    expect(text(el, '.sheet .title')).toEqual(['strips']);
    expect(text(el, '.where')).toEqual(['Part B, problems 5–8']);
    expect(text(el, 'h3.wh')[0]).toContain('Worksheets for step 3');
  });

  it('shows badges for the steps each sheet covers', () => {
    const el: HTMLElement = render(sheets).nativeElement;
    expect(text(el, '.sheet .badges')).toEqual(['13', '2']);
  });

  it('lists steps without buttons when no worksheet says which steps it covers', () => {
    const el: HTMLElement = render([{ id: 'x', title: 'x', pages: 1, href: '/x', answersHref: '/x?a' }]).nativeElement;
    expect(el.querySelectorAll('.steps button').length).toBe(0);
    expect(text(el, '.steps .name').length).toBe(3);
  });
});
