// Components for the grade 5 widgets. Each draws its node with draw_g5.ts.
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { type CoordinateGrid, type DecimalChart, type FractionGrid, type Solid } from '../proto/v1/nodes_pb.js';
import * as draw from '../engine/draw_g5.js';
import { fieldId } from '../engine/field.js';
import { STANDARD_WRITING } from '../engine/layout.js';
import { SvgComponent } from './svg.component.js';
import { WritingContext } from './writing.js';

@Component({
  selector: 'ws-solid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class SolidComponent {
  readonly node = input.required<Solid>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.solid(this.node()));
}

@Component({
  selector: 'ws-coordinate-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
  // A grid the child plots on is itself the field.
  host: { '[attr.data-field]': 'field()' },
})
export class CoordinateGridComponent {
  readonly node = input.required<CoordinateGrid>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.coordinateGrid(this.node(), this.filled()));
  protected readonly field = computed(() => fieldId(this.node().plotField));
}

@Component({
  selector: 'ws-decimal-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class DecimalChartComponent {
  readonly node = input.required<DecimalChart>();
  readonly filled = input(false);
  private readonly ctx = inject(WritingContext, { optional: true });
  protected readonly d = computed(() => draw.decimalChart(this.node(), this.filled(), this.ctx?.writing() ?? STANDARD_WRITING));
}

@Component({
  selector: 'ws-fraction-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class FractionGridComponent {
  readonly node = input.required<FractionGrid>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.fractionGrid(this.node()));
}
