import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';

import { Curriculum, SiteData } from './data/curriculum';
import { View, ViewState } from './data/view-state';
import { ListViewComponent } from './list/list-view.component';
import { MapViewComponent } from './map/map-view.component';
import { PathViewComponent } from './path/path-view.component';
import { SkillPanelComponent } from './skill/skill-panel.component';

/** Remembers whether the reader collapsed the details panel. */
const PANEL_KEY = 'gradeguide.panel';

/** Wide enough for a side panel; narrower screens use a bottom sheet. */
const WIDE_QUERY = '(min-width: 861px)';

function readPanelCollapsed(): boolean {
  try {
    return globalThis.localStorage?.getItem(PANEL_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

function matchWide(): boolean {
  return globalThis.matchMedia?.(WIDE_QUERY).matches ?? true;
}

/** The address of the data file, next to the page. */
export const DATA_URL = 'math.json';

/** AppComponent is the page: a header, the chosen view, and the details of the chosen skill. */
@Component({
  selector: 'gg-app',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MapViewComponent, ListViewComponent, PathViewComponent, SkillPanelComponent],
  template: `
    <header class="top">
      <div class="brand">GradeGuide <span>K–8 math, month by month</span></div>
      <nav class="views" aria-label="Views">
        <a class="about" href="about.html">About</a>
        @for (v of views; track v.id) {
          <button type="button" [class.on]="state().view === v.id" [attr.aria-current]="state().view === v.id ? 'page' : null" (click)="setView(v.id)">
            {{ v.label }}
          </button>
        }
      </nav>
    </header>

    @if (error()) {
      <p class="error">Couldn't load the curriculum. {{ error() }}</p>
    } @else if (curriculum(); as c) {
      <div class="bar">
        @if (state().view !== 'path') {
          <div class="grades" role="group" aria-label="Grade">
            @for (g of c.grades; track g) {
              <button type="button" [class.on]="state().grade === g" (click)="setGrade(g)">{{ g }}</button>
            }
          </div>
        }
        @if (state().view === 'map') {
          <label class="ctl"><input type="checkbox" [checked]="showCodes()" (change)="showCodes.set($any($event.target).checked)" /> Codes</label>
          <span class="legend"><i class="before"></i>Needed first <i class="after"></i>Leads to</span>
        }
      </div>

      <main [class.open]="!!selectedId() && !collapsed()" [class.stripped]="!!selectedId() && collapsed()">
        <div class="view">
          @switch (state().view) {
            @case ('map') {
              <gg-map-view
                [curriculum]="c"
                [selected]="selectedId()"
                [grade]="state().grade"
                [showCodes]="showCodes()"
                (pick)="select($event)"
                (gradeInView)="viewState.update({ grade: $event })"
              />
            }
            @case ('list') {
              <gg-list-view [curriculum]="c" [grade]="state().grade" [selected]="selectedId()" (pick)="select($event)" />
            }
            @case ('path') {
              <gg-path-view [curriculum]="c" [target]="pathTarget()" [selected]="selectedId()" (pick)="select($event)" (chooseTarget)="choosePathTarget($event)" (back)="backToMap()" />
            }
          }
        </div>
        @if (selectedId() && collapsed()) {
          <button type="button" class="strip" [attr.aria-label]="'Show details for ' + selectedName()" title="Show details" (click)="setCollapsed(false)">
            <span class="chev" aria-hidden="true">‹</span>
            <span class="vname">{{ selectedName() }}</span>
          </button>
        } @else if (selectedId()) {
          <aside class="panel-wrap" aria-label="Skill details">
            <button type="button" class="collapse" aria-label="Hide details" title="Hide details" (click)="setCollapsed(true)">›</button>
            <div class="panel">
            <gg-skill-panel [curriculum]="c" [skillId]="selectedId()" (pick)="select($event, true)" (close)="select('')" />
            @if (state().view !== 'path' || pathTarget()?.id !== selectedId()) {
              <button type="button" class="pathlink" (click)="showPath()">{{ pathLabel() }}</button>
            }
            </div>
          </aside>
        }
      </main>

      <footer>
        <p>
          Placement by month follows the Illustrative Mathematics 360 pace spread evenly over a September–June year; your
          school's calendar may differ.
        </p>
        <p><a href="about.html">About this map and its sources</a> · Skill graph {{ c.data.version }}</p>
      </footer>
    } @else {
      <p class="loading">Loading the curriculum…</p>
    }
  `,
  styles: `
    :host { display: block; max-width: 100%; }
    .top { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--border); }
    .brand { font-weight: 700; font-size: 18px; }
    .brand span { font-weight: 400; font-size: 13px; color: var(--muted); margin-left: 8px; }
    .views, .grades { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
    .about { font-size: 14px; color: var(--muted); margin-right: 8px; }
    .views button, .grades button { font: inherit; font-size: 14px; padding: 6px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); cursor: pointer; }
    .grades button { min-width: 36px; padding: 6px 8px; }
    .views button.on, .grades button.on { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
    .bar { display: flex; align-items: center; gap: 12px 16px; flex-wrap: wrap; padding: 10px 16px; }
    .ctl { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); }
    .ctl select { font: inherit; font-size: 13px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--border-strong); background: var(--surface); color: var(--text); }
    .legend { font-size: 13px; color: var(--muted); display: flex; align-items: center; gap: 6px; }
    .legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-left: 6px; }
    .legend i.before { background: var(--before-bg); border: 1px solid var(--before); }
    .legend i.after { background: var(--after-bg); border: 1px solid var(--after); }
    main { display: grid; grid-template-columns: minmax(0, 1fr); }
    main.open { grid-template-columns: minmax(0, 1fr) 340px; }
    main.stripped { grid-template-columns: minmax(0, 1fr) 34px; }
    .view { min-width: 0; padding: 0 0 0 16px; }
    .strip {
      position: sticky; top: 0; height: min(100vh - 120px, 640px); display: flex; flex-direction: column; align-items: center; gap: 10px;
      padding: 12px 0; border: none; border-left: 1px solid var(--border); background: var(--surface); color: var(--muted); font: inherit; cursor: pointer;
    }
    .strip:hover { background: var(--hover); color: var(--text); }
    .chev { font-size: 20px; line-height: 1; }
    .vname { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-height: 100%; }
    /* A round handle on the panel's left border, clear of the panel's own heading. */
    .collapse { position: absolute; top: 14px; left: -13px; width: 26px; height: 26px; padding: 0 0 2px 2px; font-size: 18px; line-height: 1; border: 1px solid var(--border-strong); border-radius: 50%; background: var(--surface); color: var(--muted); cursor: pointer; z-index: 2; }
    .collapse:hover { color: var(--text); border-color: var(--text); }
    .panel-wrap { position: sticky; top: 0; align-self: start; z-index: 3; }
    .panel { border-left: 1px solid var(--border); padding: 16px 20px 24px; max-height: calc(100vh - 120px); overflow-y: auto; }
    .pathlink { margin-top: 18px; font: inherit; font-size: 14px; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-strong); background: var(--surface); color: var(--text); cursor: pointer; }
    footer { padding: 24px 16px; font-size: 14px; color: var(--muted); max-width: 900px; }
    footer a { color: inherit; }
    .loading, .error { padding: 24px 16px; }
    @media (max-width: 860px) {
      main.open { grid-template-columns: minmax(0, 1fr); }
      .view { padding: 0 0 0 8px; }
      .brand span { display: none; }
      .bar { flex-wrap: nowrap; overflow-x: auto; }
      .grades { flex-wrap: nowrap; }
      .legend, .ctl:has(input[type='checkbox']) { display: none; }
      .collapse { display: none; }
      .panel-wrap { position: static; }
      .panel {
        position: fixed; top: auto; left: 0; right: 0; bottom: 0; max-height: 55vh; z-index: 10;
        background: var(--page); border-left: none; border-top: 1px solid var(--border-strong);
        border-radius: 16px 16px 0 0; box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.15);
      }
    }
  `,
})
export class AppComponent {
  protected readonly viewState = inject(ViewState);
  protected readonly state = this.viewState.state;
  protected readonly views: { id: View; label: string }[] = [
    { id: 'map', label: 'Map' },
    { id: 'list', label: 'List' },
    { id: 'path', label: 'Prerequisites' },
  ];

  protected readonly data = signal<SiteData | undefined>(undefined);
  protected readonly error = signal('');
  protected readonly showCodes = signal(false);
  protected readonly curriculum = computed(() => {
    const d = this.data();
    return d ? new Curriculum(d) : undefined;
  });

  /** The selected skill's id, from the code in the address. */
  protected readonly selectedId = computed(() => {
    const code = this.state().skill;
    return (code && this.curriculum()?.skills.find((s) => s.code === code)?.id) || '';
  });

  /** The skill the prerequisites view starts from: the one in the address, or else the selected one. */
  protected readonly pathTarget = computed(() => {
    const c = this.curriculum();
    const code = this.state().target || this.state().skill;
    return code ? c?.skills.find((s) => s.code === code) : undefined;
  });

  /** The panel button that opens the prerequisites view on the selected skill. */
  protected readonly pathLabel = computed(() => {
    const name = this.curriculum()?.skill(this.selectedId())?.name ?? '';
    return this.state().view === 'path' ? `Show prerequisite skills for ${name}` : 'Show prerequisite skills';
  });

  private readonly map = viewChild(MapViewComponent);

  /** Whether the reader collapsed the details panel. Remembered, and only honoured on wide screens. */
  private readonly collapsePref = signal(readPanelCollapsed());
  private readonly wide = signal(matchWide());
  protected readonly collapsed = computed(() => this.collapsePref() && this.wide());
  protected readonly selectedName = computed(() => this.curriculum()?.skill(this.selectedId())?.name ?? '');

  protected setCollapsed(c: boolean) {
    this.collapsePref.set(c);
    try {
      globalThis.localStorage?.setItem(PANEL_KEY, c ? 'collapsed' : 'open');
    } catch {
      // Private browsing can refuse storage; the panel then opens next visit.
    }
  }

  constructor() {
    globalThis.matchMedia?.(WIDE_QUERY).addEventListener('change', (e) => this.wide.set(e.matches));
    fetch(DATA_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${r.statusText}`))))
      .then((d: SiteData) => this.data.set(d))
      .catch((e: Error) => this.error.set(e.message));
  }

  protected setView(v: View) {
    // Entering the prerequisites view starts from the selected skill.
    this.viewState.update(v === 'path' ? { view: v, target: this.state().skill } : { view: v, target: '' });
  }

  protected setGrade(g: string) {
    this.viewState.update({ grade: g });
    this.map()?.scrollToGrade(g);
  }

  /** Selects a skill by id; scroll moves the map to it, for links followed from the panel. */
  protected select(id: string, scroll = false) {
    const s = this.curriculum()?.skill(id);
    this.viewState.update({ skill: s?.code ?? '', ...(s && scroll ? { grade: s.grade } : {}) });
    if (s && scroll) setTimeout(() => this.map()?.scrollToSkill(id));
  }

  protected showPath() {
    this.viewState.update({ view: 'path', target: this.state().skill });
  }

  /** Returns to the map, centred on the skill being read. */
  protected backToMap() {
    const s = this.curriculum()?.skill(this.selectedId()) ?? this.pathTarget();
    this.viewState.update({ view: 'map', target: '', skill: s?.code ?? '', ...(s ? { grade: s.grade } : {}) });
    if (s) setTimeout(() => this.map()?.scrollToSkill(s.id));
  }

  protected choosePathTarget(id: string) {
    const code = this.curriculum()?.skill(id)?.code ?? '';
    this.viewState.update({ view: 'path', target: code, skill: code });
  }
}
