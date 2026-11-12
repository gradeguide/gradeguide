import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { type Math as MathNode } from '../proto/v1/nodes_pb.js';
import { STANDARD_WRITING } from '../engine/layout.js';
import { blankWidth, fieldId, shown } from '../engine/field.js';
import { WritingContext } from './writing.js';

// MathComponent sets a line of maths: numbers, stacked fractions, and boxes.
@Component({
  selector: 'ws-math',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (a of math().atoms; track $index) {
      @switch (a.kind.case) {
        @case ('text') {
          <span class="t">{{ a.kind.value }}</span>
        }
        @case ('fraction') {
          <span class="frac"><span>{{ a.kind.value.num }}</span><span class="bar"></span><span>{{ a.kind.value.den }}</span></span>
        }
        @case ('blank') {
          <span class="box" [attr.data-field]="id(a.kind.value)" [style.width.px]="width(a.kind.value)" [style.height.px]="writing().row">{{ show(a.kind.value) }}</span>
        }
        @case ('compare') {
          <span class="circle" [attr.data-field]="id(a.kind.value)">{{ show(a.kind.value) }}</span>
        }
        @case ('fractionBlank') {
          <span class="frac boxed" [attr.data-field]="id(a.kind.value)">
            <span class="box small">{{ part(a.kind.value, 0) }}</span><span class="bar"></span><span class="box small">{{ part(a.kind.value, 1) }}</span>
          </span>
        }
        @case ('halfBlank') {
          <span class="frac boxed" [attr.data-field]="id(a.kind.value.field)">
            @if (a.kind.value.blankNumerator) {
              <span class="box small">{{ show(a.kind.value.field) }}</span><span class="bar"></span><span>{{ a.kind.value.given }}</span>
            } @else {
              <span>{{ a.kind.value.given }}</span><span class="bar"></span><span class="box small">{{ show(a.kind.value.field) }}</span>
            }
          </span>
        }
      }
    }
  `,
  styles: `
    :host { display: inline-flex; align-items: center; gap: 8px; font-size: 20px; min-height: 34px; }
    .frac { display: inline-flex; flex-direction: column; align-items: center; line-height: 1.05; }
    .bar { display: block; width: 100%; min-width: 18px; border-top: 2px solid #222; margin: 2px 0; }
    .frac.boxed { gap: 0; }
    .frac.boxed .bar { width: calc(100% + 10px); margin: 5px 0; }
    .box { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; border: 1.5px solid #222; border-radius: 3px; color: #1a4f8a; font-style: italic; }
    .box.small { min-width: 30px; height: 24px; font-size: 16px; border-width: 1.2px; }
    .circle { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: 1.5px solid #222; border-radius: 50%; color: #1a4f8a; font-style: italic; }
  `,
})
export class MathComponent {
  readonly math = input.required<MathNode>();
  readonly filled = input(false);

  protected id = fieldId;
  private readonly ctx = inject(WritingContext, { optional: true });
  protected writing = () => this.ctx?.writing() ?? STANDARD_WRITING;

  protected width(f: Parameters<typeof blankWidth>[0]): number {
    return blankWidth(f, this.writing());
  }

  protected show(f: Parameters<typeof shown>[0]): string {
    return shown(f, this.filled());
  }

  // part is the numerator (0) or denominator (1) of a fraction answer.
  protected part(f: Parameters<typeof shown>[0], i: number): string {
    return this.show(f).split('/')[i] ?? '';
  }
}
