import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { Curriculum, MONTHS, SkillData, plainStatement } from '../data/curriculum';
import { feedbackUrl } from '../data/feedback';

/** The official Common Core math standards, as the source data credits them. */
export const STANDARDS_URL = 'https://corestandards.org/wp-content/uploads/2023/09/Math_Standards1.pdf';

/** Remembers whether the reader collapsed the sources box, so it stays closed on every skill. */
const SOURCES_KEY = 'gradeguide.sources';

function readSourcesOpen(): boolean {
  try {
    return globalThis.localStorage?.getItem(SOURCES_KEY) !== 'closed';
  } catch {
    return true;
  }
}

/** SkillPanel explains one skill to a parent and links to the skills around it. */
@Component({
  selector: 'gg-skill-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (skill(); as s) {
      <article [style.--c]="'var(--strand-' + s.strand + ')'">
        <header>
          <div class="kicker">
            <span class="dot"></span>{{ strandName() }}@if (topicName(); as t) { · {{ t }}}
          </div>
          <h2>{{ s.name }}</h2>
          <div class="where">{{ where() }}</div>
          <button type="button" class="close" aria-label="Close" (click)="close.emit()">×</button>
        </header>

        <p class="explain">{{ s.explanation }}</p>
        <dl>
          <dt>Example</dt>
          <dd>{{ s.example }}</dd>
          <dt>Try at home</dt>
          <dd>{{ s.tryAtHome }}</dd>
        </dl>
        @if (s.draft) {
          <p class="note">Draft written with AI help. A teacher hasn't checked it yet.</p>
        }

        <section class="links">
          <div>
            <h3 class="before">Needed first</h3>
            @for (b of before(); track b.id) {
              <button type="button" class="link" [style.--c]="'var(--strand-' + b.strand + ')'" (click)="pick.emit(b.id)">
                {{ b.name }} <span>{{ gradeLabel(b) }}</span>
              </button>
            } @empty {
              <p class="none">Nothing listed in the data.</p>
            }
          </div>
          <div>
            <h3 class="after">Leads to</h3>
            @for (a of after(); track a.id) {
              <button type="button" class="link" [style.--c]="'var(--strand-' + a.strand + ')'" (click)="pick.emit(a.id)">
                {{ a.name }} <span>{{ gradeLabel(a) }}</span>
              </button>
            } @empty {
              <p class="none">Nothing listed in the data.</p>
            }
          </div>
        </section>

        @if (s.parts?.length) {
          <h3>Parts</h3>
          <ul>
            @for (p of s.parts; track p.code) {
              <li>{{ p.name }} <span class="code">{{ p.code }}</span></li>
            }
          </ul>
        }

        @if (s.steps?.length) {
          <h3>Smaller steps inside this skill</h3>
          <ol>
            @for (st of s.steps; track $index) {
              <li>{{ plain(st) }}</li>
            }
          </ol>
        }

        <h3>Worksheets</h3>
        @if (s.worksheets?.length) {
          <ul class="worksheets">
            @for (w of s.worksheets; track w.id) {
              <li>
                <a [href]="w.href" target="_blank" rel="noopener">{{ w.title }}</a>
                <span class="meta">{{ w.pages }} {{ w.pages === 1 ? 'page' : 'pages' }}@if (w.minutes) {, about {{ w.minutes }} minutes}</span>
                <a class="answers" [href]="w.answersHref" target="_blank" rel="noopener">Answers</a>
              </li>
            }
          </ul>
        } @else {
          <p class="none">Printable worksheets for this skill are coming.</p>
        }

        <details>
          <summary>Official wording <span class="code">{{ s.code }}</span></summary>
          <p>{{ statement() }}</p>
          <a [href]="standardsUrl" target="_blank" rel="noopener">All the Common Core math standards (PDF, corestandards.org) ↗</a>
        </details>

        <details class="sources" [open]="sourcesOpen()" (toggle)="rememberSources($any($event.target).open)">
          <summary>Sources for this skill</summary>
          <ul>
            <li><b>The skill</b> is Common Core math standard {{ s.code }}.</li>
            <li><b>Needed first and leads to</b> come from the Common Core learning progressions by Student Achievement Partners.</li>
            @if (s.steps?.length) {
              <li><b>Smaller steps</b> come from Achievement Network.</li>
            }
            @if (s.month) {
              <li><b>When it's taught</b> follows Illustrative Mathematics 360, spread evenly from September to June. Your school may differ.</li>
            }
            <li><b>The explanation, example and home idea</b> are GradeGuide's own drafts.</li>
          </ul>
          <p class="via">Collected through the Learning Commons Knowledge Graph (CC BY 4.0).</p>
          <a href="about.html">About this map and its sources →</a>
        </details>

        <p class="feedback">
          Something wrong or unclear?
          <a [href]="feedback()" target="_blank" rel="noopener">Tell us about this skill</a>
        </p>
      </article>
    }
  `,
  styles: `
    :host { display: block; }
    article { position: relative; }
    header { padding-right: 32px; }
    .kicker { font-size: 13px; color: var(--muted); display: flex; align-items: center; gap: 6px; }
    .dot { width: 10px; height: 10px; border-radius: 2px; background: var(--c); }
    h2 { font-size: 20px; margin: 4px 0 2px; }
    .where { font-size: 13px; color: var(--muted); }
    .close { position: absolute; top: -4px; right: -4px; width: 32px; height: 32px; font-size: 22px; line-height: 1; border: none; background: none; color: var(--muted); cursor: pointer; border-radius: 6px; }
    .close:hover { background: var(--hover); }
    .explain { font-size: 15px; line-height: 1.55; margin: 12px 0 8px; }
    dl { margin: 0; font-size: 14px; line-height: 1.5; }
    dt { font-size: 13px; color: var(--muted); margin-top: 8px; }
    dd { margin: 0; }
    .note { font-size: 13px; color: var(--muted); font-style: italic; margin: 10px 0 0; }
    h3 { font-size: 13px; font-weight: 600; margin: 18px 0 6px; }
    h3.before { color: var(--before); }
    h3.after { color: var(--after); }
    .links { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0 16px; }
    .link { display: block; width: 100%; text-align: left; font: inherit; font-size: 13px; padding: 6px 8px; margin-bottom: 4px; cursor: pointer; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-left: 4px solid var(--c); border-radius: 6px; }
    .link:hover { border-color: var(--border-strong); border-left-color: var(--c); }
    .link span { color: var(--muted); font-size: 13px; }
    .none { font-size: 13px; color: var(--muted); margin: 0; }
    .worksheets { padding-left: 18px; margin: 0; }
    .worksheets li { margin: 2px 0; }
    .worksheets .meta { font-size: 13px; color: var(--muted); margin-left: 6px; }
    .worksheets .answers { font-size: 13px; margin-left: 8px; }
    ul, ol { margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.55; }
    .code { color: var(--muted); font-size: 13px; }
    /* The folding sections read as headings like the others, with a disclosure arrow. */
    details { margin-top: 18px; }
    summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text); }
    details p { font-size: 14px; line-height: 1.5; color: var(--muted); margin: 6px 0 0; }
    .sources ul { margin: 6px 0 0; padding-left: 20px; font-size: 14px; line-height: 1.5; }
    .sources li { margin-bottom: 4px; }
    .sources b { font-weight: 600; }
    details a { display: inline-block; margin-top: 4px; font-size: 13px; color: var(--accent); }
    .feedback { font-size: 13px; color: var(--muted); margin: 16px 0 0; }
    .feedback a { color: var(--accent); }
    .sources a { display: inline-block; margin-top: 4px; font-size: 14px; color: var(--accent); }
  `,
})
export class SkillPanelComponent {
  readonly curriculum = input.required<Curriculum>();
  readonly skillId = input('');

  readonly pick = output<string>();
  readonly close = output<void>();

  protected readonly standardsUrl = STANDARDS_URL;

  /** Open until the reader closes it once. */
  protected readonly sourcesOpen = signal(readSourcesOpen());

  protected rememberSources(open: boolean) {
    if (open === this.sourcesOpen()) return;
    this.sourcesOpen.set(open);
    try {
      globalThis.localStorage?.setItem(SOURCES_KEY, open ? 'open' : 'closed');
    } catch {
      // Private browsing can refuse storage; the box then reopens next visit.
    }
  }

  protected readonly skill = computed(() => this.curriculum().skill(this.skillId()));
  /** The skill feedback form, filled in with this skill. */
  protected readonly feedback = computed(() => {
    const s = this.skill();
    if (!s) return '';
    const origin = globalThis.location?.origin ?? '';
    return feedbackUrl('skill', { title: `Skill: ${s.name} (${s.code})`, skill: `${s.code} ${s.name}`, page: s.path ? origin + s.path : '' });
  });

  protected readonly before = computed(() => (this.skill() ? this.curriculum().neededFirst(this.skillId()) : []));
  protected readonly after = computed(() => (this.skill() ? this.curriculum().leadsTo(this.skillId()) : []));
  protected readonly strandName = computed(() => this.curriculum().strand(this.skill()?.strand ?? '')?.name ?? '');
  protected readonly topicName = computed(() => this.curriculum().topic(this.skill()?.topic)?.name ?? '');
  protected readonly statement = computed(() => plainStatement(this.skill()?.statement ?? ''));

  protected readonly where = computed(() => {
    const s = this.skill();
    if (!s) return '';
    const grade = s.grade === 'K' ? 'Kindergarten' : `Grade ${s.grade}`;
    const unit = this.curriculum().unit(s.unitId);
    const when = s.month ? `, from ${MONTHS[s.month - 1]}` : '';
    return unit ? `${grade}${when} · ${unit.ordinal}: ${unit.name}` : grade;
  });

  protected gradeLabel(s: SkillData): string {
    return s.grade === 'K' ? 'K' : `gr ${s.grade}`;
  }

  protected plain(text: string): string {
    return plainStatement(text);
  }
}
