// The grade 6 to 8 widgets. One component draws them all from drawG68, so
// node.component.ts needs only a case per widget.
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { type Node } from '../proto/v1/nodes_pb.js';
import { drawG68 } from '../engine/draw_g68.js';
import { STANDARD_WRITING } from '../engine/layout.js';
import { SvgComponent } from './svg.component.js';
import { WritingContext } from './writing.js';

@Component({
  selector: 'ws-g68',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `
    @if (d(); as drawing) {
      <ws-svg [d]="drawing" />
    }
  `,
})
export class G68WidgetComponent {
  readonly node = input.required<Node>();
  readonly filled = input(false);
  private readonly writing = inject(WritingContext, { optional: true });
  protected readonly d = computed(() => drawG68(this.node(), this.filled(), this.writing?.writing() ?? STANDARD_WRITING));
}
