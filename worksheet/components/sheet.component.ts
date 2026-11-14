import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import {
  type ComposedSheet,
  type LearningDesign,
  Principle,
  Stage,
} from '../proto/v1/worksheet_pb.js';
import * as L from '../engine/layout.js';
import { NodeComponent } from './node.component.js';
import { WritingContext } from './writing.js';

// bold splits text on **double asterisks** into plain and bold runs.
function bold(s: string): { b: boolean; s: string }[] {
  return s.split('**').map((part, i) => ({ b: i % 2 === 1, s: part }));
}

// SheetComponent draws a composed sheet as printed pages. With filled, every
// field shows its answer, for the answer key.
@Component({
  selector: 'ws-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NodeComponent],
  providers: [WritingContext],
  template: `
    @for (page of sheet().pages; track $index; let p = $index) {
      <div class="page" [attr.data-estimate]="page.estimatedHeight" [style.width.px]="L.PAGE_WIDTH" [style.height.px]="L.PAGE_HEIGHT" [style.padding.px]="L.MARGIN">
        <header [style.height.px]="L.HEADER_HEIGHT">
          <div>
            <div class="kicker">{{ kicker() }}</div>
            <h1>{{ sheet().title }}</h1>
          </div>
          <div class="name">Name <span class="rule"></span><br />Date <span class="rule"></span></div>
        </header>
        <div class="body" [style.height.px]="L.BODY_HEIGHT">
          @for (s of page.sections; track $index) {
            <section [attr.data-estimate]="s.estimatedHeight">
              <h2>
                <span class="tag">{{ s.label }}</span>
                <span>@for (r of boldRuns(s.instruction); track $index) {@if (r.b) {<b>{{ r.s }}</b>} @else {{{ r.s }}}}</span>
                @if (s.continued) {
                  <small>(continued)</small>
                }
              </h2>
              @if (s.explainer) {
                <p class="explainer">{{ s.explainer }}</p>
              }
              @if (s.figure.length > 0) {
                <div class="figure">
                  @for (n of s.figure; track $index) {
                    <ws-node [node]="n" />
                  }
                </div>
              }
              @if (s.example; as ex) {
                <div class="example">
                  <div class="look">Example</div>
                  <div class="ex-body">
                    <div class="ex-nodes">
                      @for (n of ex.nodes; track $index) {
                        <ws-node [node]="n" />
                      }
                    </div>
                    <div class="ex-text">
                      @for (r of boldRuns(ex.text); track $index) {@if (r.b) {<b>{{ r.s }}</b>} @else {{{ r.s }}}}
                    </div>
                  </div>
                </div>
              }
              <div class="items" [style.grid-template-columns]="'repeat(' + s.columns + ', 1fr)'">
                @for (it of s.items; track it.label) {
                  <div class="item">
                    <span class="qn">{{ it.label }}</span>
                    <div class="item-nodes">
                      @for (n of it.nodes; track $index) {
                        <ws-node [node]="n" [filled]="filled()" />
                      }
                    </div>
                  </div>
                }
              </div>
            </section>
          }
        </div>
        <footer [style.height.px]="L.FOOTER_HEIGHT">
          <span></span>
          <span>Page {{ p + 1 }} of {{ sheet().pages.length }}</span>
        </footer>
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .page { box-sizing: border-box; background: white; color: #222; position: relative; overflow: hidden; display: flex; flex-direction: column; margin: 0 auto 24px; box-shadow: 0 1px 6px rgba(0,0,0,.18); font-family: Andika, 'Helvetica Neue', Arial, sans-serif; }
    header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #222; box-sizing: border-box; }
    h1 { font-size: 26px; margin: 4px 0 0; }
    .kicker { font-size: 12px; letter-spacing: .04em; color: #555; }
    .name { font-size: 14px; line-height: 30px; text-align: right; flex: none; margin-left: 16px; }
    .rule { display: inline-block; width: 150px; border-bottom: 1.2px solid #222; }
    .body { overflow: hidden; padding-top: 6px; box-sizing: border-box; }
    section { margin-bottom: 4px; }
    h2 { font-size: 16px; line-height: 22px; font-weight: 600; margin: 6px 0 6px; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    h2 small { font-weight: 400; color: #666; }
    .tag { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; border-radius: 4px; background: #222; color: white; font-size: 13px; margin-right: 4px; padding: 0 4px; }
    .explainer { margin: 0 0 6px; font-size: 14px; line-height: 20px; color: #333; }
    .figure { margin-bottom: 14px; }
    .example { border: 1.5px dashed #888; border-radius: 6px; padding: 8px 10px; margin-bottom: 14px; position: relative; }
    .look { position: absolute; top: -9px; left: 10px; background: white; padding: 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #555; }
    .ex-body { display: flex; gap: 18px; align-items: center; }
    .ex-nodes { display: flex; flex-direction: column; gap: 6px; flex: 0 0 auto; }
    .ex-text { font-size: 14px; line-height: 1.45; }
    .items { display: grid; column-gap: 12px; }
    .item { display: flex; gap: 6px; padding-bottom: 14px; min-width: 0; }
    .qn { flex: 0 0 24px; font-weight: 700; font-size: 14px; padding-top: 2px; }
    .item-nodes { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1; }
    footer { display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; color: #444; border-top: 1px solid #bbb; box-sizing: border-box; margin-top: auto; }
  `,
})
export class SheetComponent {
  readonly sheet = input.required<ComposedSheet>();
  readonly filled = input(false);

  constructor() {
    inject(WritingContext, { self: true }).source = () => this.sheet().writingSize;
  }
  protected readonly L = L;
  protected readonly kicker = computed(() => {
    const s = this.sheet();
    return [s.headerLabels.join(', '), this.filled() ? 'Answers' : ''].filter(Boolean).join(' · ');
  });
  protected boldRuns = bold;
}

// AnswerKeyComponent lists every answer by item label.
@Component({
  selector: 'ws-answer-key',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3>Answer key: {{ sheet().title }}</h3>
    <div class="cols">
      @for (g of groups(); track g.label) {
        <div class="row">
          <span class="lab">{{ g.label }}</span>
          {{ g.key }}
          @if (g.also.length) {
            <span class="also">also {{ g.also.join(', ') }}</span>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; font-family: Andika, 'Helvetica Neue', Arial, sans-serif; font-size: 13px; }
    h3 { font-size: 15px; margin: 0 0 6px; }
    .cols { columns: 3; column-gap: 24px; }
    .row { break-inside: avoid; padding: 1px 0; }
    .lab { display: inline-block; min-width: 34px; font-weight: 700; }
    .cols { columns: 2; }
    .also { color: #777; margin-left: 6px; }
  `,
})
export class AnswerKeyComponent {
  readonly sheet = input.required<ComposedSheet>();
  // One line per item: the item solved, and other readings that are right.
  protected readonly groups = computed(() => {
    const sheet = this.sheet();
    return sheet.pages
      .flatMap((p) => p.sections)
      .flatMap((s) => s.items)
      .map((it) => ({
        label: it.label,
        key: it.key,
        also: sheet.key.filter((e) => e.itemLabel === it.label).flatMap((e) => e.field?.answer?.also ?? []),
      }));
  });
}

const stageNames: Record<number, string> = {
  [Stage.REVIEW]: 'Review',
  [Stage.INTRODUCE]: 'Introduce',
  [Stage.GUIDED]: 'Guided practice',
  [Stage.PRACTICE]: 'Practice',
  [Stage.MISTAKE]: 'Find the mistake',
  [Stage.STRETCH]: 'Stretch',
};

function principleName(p: Principle): string {
  return (Principle[p] ?? '').toLowerCase().replace(/_/g, ' ');
}

// DesignNotesComponent shows the sheet's arc and the reason for each section,
// for a grown-up or a reviewer.
@Component({
  selector: 'ws-design-notes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3>Why this sheet is built this way</h3>
    @if (sheet().design; as d) {
      <p><b>{{ d.purpose }}</b> {{ d.rationale }}</p>
      <p class="tags">{{ principles(d) }}</p>
    }
    <ol class="arc">
      @for (s of sections(); track $index) {
        <li>
          <b>{{ s.label }} · {{ stage(s.stage) }}</b> — {{ s.instruction }}
          @if (s.design; as d) {
            <div class="why">{{ d.purpose }} {{ d.rationale }}</div>
            @if (d.misconceptions.length) {
              <div class="mis">Targets: {{ d.misconceptions.join('; ') }}</div>
            }
            <div class="tags">{{ principles(d) }}</div>
          }
        </li>
      }
    </ol>
    @if (sheet().problems.length) {
      <div class="notes problems">
        <b>Problems</b>
        <ul>
          @for (n of sheet().problems; track $index) {
            <li>{{ n }}</li>
          }
        </ul>
      </div>
    }
    @if (sheet().advice.length) {
      <div class="notes">
        <b>For the reviewer</b>
        <ul>
          @for (n of sheet().advice; track $index) {
            <li>{{ n }}</li>
          }
        </ul>
      </div>
    }
  `,
  styles: `
    :host { display: block; font-family: Andika, 'Helvetica Neue', Arial, sans-serif; font-size: 13px; line-height: 1.45; }
    h3 { font-size: 15px; margin: 0 0 6px; }
    p { margin: 0 0 6px; }
    .arc { padding-left: 18px; margin: 6px 0; }
    .arc li { margin-bottom: 6px; }
    .why { color: #333; }
    .mis { color: #8a3a1a; }
    .tags { color: #666; font-size: 12px; }
    .notes { background: #fff6e0; border: 1px solid #e5c97a; padding: 6px 10px; border-radius: 4px; }
    .notes.problems { background: #fde8e8; border-color: #e09a9a; }
    .notes { margin-top: 6px; }
    .notes ul { margin: 4px 0 0; padding-left: 18px; }
  `,
})
export class DesignNotesComponent {
  readonly sheet = input.required<ComposedSheet>();
  protected readonly sections = computed(() => this.sheet().pages.flatMap((p) => p.sections).filter((s) => !s.continued));
  protected stage(s: Stage): string {
    return stageNames[s] ?? '';
  }
  protected principles(d: LearningDesign): string {
    return d.principles.map(principleName).join(' · ');
  }
}
