// Components for the shape widgets, which draw from engine/draw_shapes.ts.
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { type FractionCircle, type GridShape } from '../proto/v1/nodes_pb.js';
import * as draw from '../engine/draw_shapes.js';
import { SvgComponent } from './svg.component.js';

@Component({
  selector: 'ws-grid-shape',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class GridShapeComponent {
  readonly node = input.required<GridShape>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.gridShape(this.node()));
}

@Component({
  selector: 'ws-fraction-circle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  // A circle the child shades is itself the field.
  host: { '[attr.data-field]': 'field()' },
  template: `<ws-svg [d]="d()" />`,
})
export class FractionCircleComponent {
  readonly node = input.required<FractionCircle>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.fractionCircle(this.node()));
  protected readonly field = computed(() => draw.circleField(this.node()));
}
