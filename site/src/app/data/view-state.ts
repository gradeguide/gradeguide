import { Injectable, signal } from '@angular/core';

export type View = 'map' | 'list' | 'path';

const VIEWS: View[] = ['map', 'list', 'path'];

/** What the page shows, kept in the address so a view can be linked and bookmarked. */
export interface State {
  view: View;
  grade: string;
  /** The selected skill's code, such as "4.NF.A.1", or empty. */
  skill: string;
  /** The code of the skill the foundations view starts from, or empty. */
  target: string;
}

export const DEFAULT_STATE: State = { view: 'map', grade: '4', skill: '', target: '' };

/** Reads a state from an address fragment such as "#map/4/4.NF.A.1". */
export function parseHash(hash: string): State {
  const [view, grade, skill, target] = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  return {
    view: VIEWS.includes(view as View) ? (view as View) : DEFAULT_STATE.view,
    grade: grade || DEFAULT_STATE.grade,
    skill: skill ?? '',
    target: target ?? '',
  };
}

export function formatHash(s: State): string {
  const parts = [s.view, s.grade, s.skill, s.target].map(encodeURIComponent);
  while (parts.length > 2 && !parts[parts.length - 1]) parts.pop();
  return '#' + parts.join('/');
}

/** ViewState holds the page state in a signal and mirrors it to the address. */
@Injectable({ providedIn: 'root' })
export class ViewState {
  readonly state = signal<State>(parseHash(globalThis.location?.hash ?? ''));

  constructor() {
    const sync = () => this.state.set(parseHash(location.hash));
    globalThis.addEventListener?.('hashchange', sync);
    globalThis.addEventListener?.('popstate', sync);
  }

  update(change: Partial<State>) {
    const prev = this.state();
    const next = { ...prev, ...change };
    this.state.set(next);
    const hash = formatHash(next);
    if (!globalThis.location || location.hash === hash) return;
    // A new view or skill gets its own history entry, so Back returns to it.
    if (next.view !== prev.view || next.skill !== prev.skill || next.target !== prev.target) history.pushState(null, '', hash);
    else history.replaceState(null, '', hash);
  }
}
