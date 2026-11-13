import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface Crumb {
  label: string;
  href?: string;
}

// TopBarComponent is the bar at the top of every worksheet page: the site's
// name, a breadcrumb, and links back to the map and the about page.
@Component({
  selector: 'gg-top-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="brand" href="/">GradeGuide</a>
    <nav class="crumbs" aria-label="Breadcrumb">
      @for (c of crumbs(); track $index; let last = $last) {
        @if (c.href && !last) {
          <a [href]="c.href">{{ c.label }}</a>
        } @else {
          <span>{{ c.label }}</span>
        }
        @if (!last) {
          <span class="sep" aria-hidden="true">›</span>
        }
      }
    </nav>
    <ng-content />
    <nav class="links"><a href="/">Map</a><a href="/about.html">About</a></nav>
  `,
  styles: `
    :host { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--surface); }
    .brand { font-weight: 700; font-size: 18px; color: var(--text); text-decoration: none; }
    .crumbs { display: flex; gap: 6px; font-size: 14px; color: var(--muted); flex: 1; min-width: 0; flex-wrap: wrap; }
    .crumbs a { color: var(--muted); }
    .sep { opacity: .7; }
    .links { display: flex; gap: 16px; font-size: 14px; }
    @media print { :host { display: none; } }
  `,
})
export class TopBarComponent {
  readonly crumbs = input<Crumb[]>([]);
}
