import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { type Drawing } from '../engine/drawing.js';

export type { Drawing, Shape } from '../engine/drawing.js';

@Component({
  selector: 'ws-svg',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      [attr.width]="d().width"
      [attr.height]="d().height"
      [attr.viewBox]="(d().viewBox ?? [0, 0, d().width, d().height]).join(' ')"
    >
      @for (s of d().shapes; track $index) {
        @switch (s.t) {
          @case ('line') {
            <line [attr.x1]="s.x1" [attr.y1]="s.y1" [attr.x2]="s.x2" [attr.y2]="s.y2" [attr.stroke]="s.color ?? '#222'" [attr.stroke-width]="s.w ?? 1.5" [attr.stroke-dasharray]="s.dash ?? null" />
          }
          @case ('rect') {
            <rect [attr.x]="s.x" [attr.y]="s.y" [attr.width]="s.w" [attr.height]="s.h" [attr.fill]="s.fill ?? 'white'" stroke="#222" [attr.stroke-width]="s.sw ?? 1.5" [attr.stroke-dasharray]="s.dash ?? null" />
          }
          @case ('circle') {
            <circle [attr.cx]="s.cx" [attr.cy]="s.cy" [attr.r]="s.r" [attr.fill]="s.fill ?? s.color ?? '#222'" />
          }
          @case ('path') {
            <path [attr.d]="s.d" [attr.fill]="s.fill ?? 'none'" stroke="#222" [attr.stroke-width]="s.w ?? 1.5" />
          }
          @case ('text') {
            <text
              [attr.x]="s.x"
              [attr.y]="s.y"
              [attr.font-size]="s.size ?? 14"
              [attr.text-anchor]="s.anchor ?? 'middle'"
              [attr.font-style]="s.italic || s.answer ? 'italic' : null"
              [attr.fill]="s.answer ? '#1a4f8a' : '#222'"
            >{{ s.s }}</text>
          }
          @case ('box') {
            <g [attr.data-field]="s.field">
              <rect [attr.x]="s.x" [attr.y]="s.y" [attr.width]="s.w" [attr.height]="s.h" fill="white" stroke="#222" stroke-width="1.2" stroke-dasharray="3 2" />
              @if (s.s) {
                <text [attr.x]="s.x + s.w / 2" [attr.y]="s.y + s.h / 2 + 5" [attr.font-size]="s.size ?? 13" text-anchor="middle" font-style="italic" fill="#1a4f8a">{{ s.s }}</text>
              }
            </g>
          }
        }
      }
    </svg>
  `,
  styles: `
    :host { display: inline-block; line-height: 0; }
    svg { font-family: inherit; overflow: visible; }
  `,
})
export class SvgComponent {
  readonly d = input.required<Drawing>();
}
