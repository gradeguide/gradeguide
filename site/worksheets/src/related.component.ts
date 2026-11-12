import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { type Related } from './catalog.js';

const GROUPS: Record<Related['kind'], { title: string; subtitle: string }> = {
  same: { title: 'Same skills', subtitle: 'Worksheets that practise the same skills' },
  before: { title: 'Prerequisite skills', subtitle: 'Worksheets for the skills this one builds on' },
  after: { title: 'Next skills', subtitle: 'Worksheets for the skills that come next' },
  nearby: { title: 'Taught at the same time', subtitle: 'Worksheets for other skills taught that month' },
};

// RelatedComponent lists groups of related worksheets as small cards.
@Component({
  selector: 'gg-related',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (g of groups(); track g.kind) {
      <section>
        <h3>{{ names[g.kind].title }}</h3>
        <p class="sub">{{ names[g.kind].subtitle }}</p>
        <ul [class.compact]="compact()">
          @for (s of g.sheets; track s.id) {
            <li>
              <a [href]="'?only=' + s.id">
                @if (s.thumbnail) {
                  <img [src]="s.thumbnail" alt="" width="240" height="311" loading="lazy" />
                } @else {
                  <span class="blank"></span>
                }
                <span class="title">{{ s.title }}</span>
                <span class="code">{{ s.primary?.code || (s.grade ? 'Grade ' + s.grade : '') }}</span>
              </a>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    section { margin-top: 18px; }
    h3 { font-size: 15px; margin: 0; }
    .sub { font-size: 13px; color: var(--muted); margin: 2px 0 8px; }
    ul { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    ul.compact { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    a { display: flex; flex-direction: column; gap: 4px; text-decoration: none; color: var(--text); }
    img, .blank { width: 100%; height: auto; aspect-ratio: 240 / 311; background: white; box-shadow: 0 1px 4px rgba(0,0,0,.15); display: block; }
    .title { font-size: 13px; font-weight: 600; line-height: 1.3; }
    .code { font-size: 12px; color: var(--muted); }
    @media (max-width: 720px) { ul { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media print { :host { display: none; } }
  `,
})
export class RelatedComponent {
  readonly groups = input.required<Related[]>();
  /** Two cards a row, for the narrow preview drawer. */
  readonly compact = input(false);
  protected readonly names = GROUPS;
}
