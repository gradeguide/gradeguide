import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { type Library, WritingSize } from '../proto/v1/worksheet_pb.js';
import { AnswerKeyComponent, DesignNotesComponent, SheetComponent } from '../components/sheet.component.js';
import { compose } from '../engine/compose.js';

// GalleryComponent shows every worksheet in the library: its pages, the
// pages filled in, its answer key, and why it is built as it is.
@Component({
  selector: 'ws-gallery',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SheetComponent, AnswerKeyComponent, DesignNotesComponent],
  template: `
    <nav>
      @for (c of composed(); track c.id) {
        <a [href]="'?only=' + c.id + (large() ? '&writing=large' : '')">{{ c.sheet.title }}</a>
      }
    </nav>
    @for (c of shown(); track c.id) {
      <article [id]="c.id" [attr.data-worksheet]="c.id">
        <div class="cols">
          <div>
            <div class="caption">Worksheet</div>
            <ws-sheet [sheet]="c.sheet" />
          </div>
          @if (answers()) {
            <div>
              <div class="caption">Filled in from the answer key</div>
              <ws-sheet [sheet]="c.sheet" [filled]="true" />
            </div>
          }
        </div>
        <div class="meta">
          <ws-design-notes [sheet]="c.sheet" />
          <ws-answer-key [sheet]="c.sheet" />
        </div>
      </article>
    }
  `,
  styles: `
    :host { display: block; font-family: 'Helvetica Neue', Arial, sans-serif; }
    nav { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 12px 16px; background: #f3f3f3; font-size: 13px; }
    article { padding: 16px; border-bottom: 1px solid #ccc; }
    .cols { display: flex; gap: 24px; flex-wrap: wrap; }
    .caption { font-size: 12px; color: #666; margin-bottom: 6px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; max-width: 1680px; margin-top: 8px; }
  `,
})
export class GalleryComponent {
  readonly library = input.required<Library>();
  // Show only this worksheet id. Empty: all.
  readonly only = input('');
  readonly answers = input(true);
  // Compose for children who write large.
  readonly large = input(false);

  protected readonly composed = computed(() => {
    const writingSize = this.large() ? WritingSize.LARGE : WritingSize.STANDARD;
    return this.library().worksheets.map((w) => ({ id: w.id, sheet: compose(w, this.library(), { writingSize }) }));
  });
  protected readonly shown = computed(() => this.composed().filter((c) => !this.only() || c.id === this.only()));
}
