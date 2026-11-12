// One component per widget. Each takes its node message as a signal input
// and computes a Drawing from it; none has state or side effects.
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import {
  type Angle,
  type AreaModel,
  type BarGraph,
  type DataTable,
  type WorkSpace,
  WorkSpace_Style,
  type BaseTenBlocks,
  type Clock,
  type LineFigure,
  type LinePlot,
  type LongDivision,
  type NumberChart,
  type PlaceValueChart,
  type Protractor,
  type Ruler,
  type Choices,
  type ColumnArithmetic,
  type DotArray,
  type FractionBar,
  type FractionWall,
  type Lines,
  type NumberLine,
  type Polygon,
  type TapeDiagram,
  type UnitGrid,
} from '../proto/v1/nodes_pb.js';
import * as draw from '../engine/draw.js';
import { fieldId, shown } from '../engine/field.js';
import { SvgComponent } from './svg.component.js';
import { WritingContext } from './writing.js';
import { STANDARD_WRITING } from '../engine/layout.js';

// writing reads the sheet's writing size, or the standard size outside a
// sheet.
function writing() {
  const ctx = inject(WritingContext, { optional: true });
  return () => ctx?.writing() ?? STANDARD_WRITING;
}

@Component({
  selector: 'ws-number-line',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class NumberLineComponent {
  readonly node = input.required<NumberLine>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.numberLine(this.node(), this.filled()));
}

@Component({
  selector: 'ws-fraction-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
  // A bar the child shades is itself the field.
  host: { '[attr.data-field]': 'field()' },
})
export class FractionBarComponent {
  readonly node = input.required<FractionBar>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.fractionBar(this.node()));
  protected readonly field = computed(() => fieldId(this.node().shadeField));
}

@Component({
  selector: 'ws-fraction-wall',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class FractionWallComponent {
  readonly node = input.required<FractionWall>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.fractionWall(this.node()));
}

@Component({
  selector: 'ws-unit-grid',
  host: { '[attr.data-field]': 'field()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class UnitGridComponent {
  readonly node = input.required<UnitGrid>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.unitGrid(this.node()));
  protected readonly field = computed(() => fieldId(this.node().shadeField));
}

@Component({
  selector: 'ws-area-model',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class AreaModelComponent {
  readonly node = input.required<AreaModel>();
  readonly filled = input(false);
  private readonly w = writing();
  protected readonly d = computed(() => draw.areaModel(this.node(), this.filled(), this.w()));
}

@Component({
  selector: 'ws-dot-array',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class DotArrayComponent {
  readonly node = input.required<DotArray>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.dotArray(this.node()));
}

@Component({
  selector: 'ws-tape-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class TapeDiagramComponent {
  readonly node = input.required<TapeDiagram>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.tapeDiagram(this.node(), this.filled()));
}

@Component({
  selector: 'ws-column-arithmetic',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class ColumnArithmeticComponent {
  readonly node = input.required<ColumnArithmetic>();
  readonly filled = input(false);
  private readonly w = writing();
  protected readonly d = computed(() => draw.columnArithmetic(this.node(), this.filled(), this.w()));
}

@Component({
  selector: 'ws-angle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class AngleComponent {
  readonly node = input.required<Angle>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.angle(this.node(), this.filled()));
}

@Component({
  selector: 'ws-polygon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class PolygonComponent {
  readonly node = input.required<Polygon>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.polygon(this.node(), this.filled()));
}

@Component({
  selector: 'ws-choices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-field]': 'field()' },
  template: `
    @for (o of node().options; track o) {
      <span class="opt"><span class="tick">{{ o === answer() ? '✓' : '' }}</span>{{ o }}</span>
    }
  `,
  styles: `
    :host { display: inline-flex; gap: 14px; font-size: 15px; }
    .opt { display: inline-flex; align-items: center; gap: 5px; }
    .tick { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border: 1.5px solid #222; color: #1a4f8a; font-size: 13px; }
  `,
})
export class ChoicesComponent {
  readonly node = input.required<Choices>();
  readonly filled = input(false);
  protected readonly field = computed(() => fieldId(this.node().field));
  protected readonly answer = computed(() => shown(this.node().field, this.filled()));
}

@Component({
  selector: 'ws-lines',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-field]': 'field()' },
  template: `
    @if (answer()) {
      <div class="answer">{{ answer() }}</div>
    } @else {
      @for (i of rows(); track i) {
        <div class="line" [style.height.px]="w().row"></div>
      }
    }
  `,
  styles: `
    :host { display: block; width: 100%; }
    .line { border-bottom: 1.2px solid #444; }
    .answer { color: #1a4f8a; font-style: italic; font-size: 14px; line-height: 1.4; }
  `,
})
export class LinesComponent {
  readonly node = input.required<Lines>();
  readonly filled = input(false);
  protected readonly w = writing();
  protected readonly field = computed(() => fieldId(this.node().field));
  protected readonly answer = computed(() => shown(this.node().field, this.filled()));
  protected readonly rows = computed(() => Array.from({ length: this.node().count }, (_, i) => i));
}

@Component({
  selector: 'ws-place-value-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class PlaceValueChartComponent {
  readonly node = input.required<PlaceValueChart>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.placeValueChart(this.node(), this.filled()));
}

@Component({
  selector: 'ws-base-ten-blocks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class BaseTenBlocksComponent {
  readonly node = input.required<BaseTenBlocks>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.baseTenBlocks(this.node()));
}

@Component({
  selector: 'ws-long-division',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class LongDivisionComponent {
  readonly node = input.required<LongDivision>();
  readonly filled = input(false);
  private readonly w = writing();
  protected readonly d = computed(() => draw.longDivision(this.node(), this.filled(), this.w()));
}

@Component({
  selector: 'ws-clock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class ClockComponent {
  readonly node = input.required<Clock>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.clock(this.node()));
}

@Component({
  selector: 'ws-ruler',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class RulerComponent {
  readonly node = input.required<Ruler>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.ruler(this.node()));
}

@Component({
  selector: 'ws-line-plot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class LinePlotComponent {
  readonly node = input.required<LinePlot>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.linePlot(this.node()));
}

@Component({
  selector: 'ws-protractor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class ProtractorComponent {
  readonly node = input.required<Protractor>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.protractor(this.node()));
}

@Component({
  selector: 'ws-line-figure',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class LineFigureComponent {
  readonly node = input.required<LineFigure>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.lineFigure(this.node()));
}

@Component({
  selector: 'ws-number-chart',
  host: { '[attr.data-field]': 'field()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class NumberChartComponent {
  readonly node = input.required<NumberChart>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.numberChart(this.node(), this.filled()));
  protected readonly field = computed(() => fieldId(this.node().shadeField));
}

@Component({
  selector: 'ws-bar-graph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class BarGraphComponent {
  readonly node = input.required<BarGraph>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.barGraph(this.node()));
}

@Component({
  selector: 'ws-data-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class DataTableComponent {
  readonly node = input.required<DataTable>();
  readonly filled = input(false);
  private readonly w = writing();
  protected readonly d = computed(() => draw.dataTable(this.node(), this.filled(), this.w()));
}

// WorkSpaceComponent is room to work: rows of the sheet's handwriting size,
// blank by default, or lined or squared. It has no field; nothing in it is read.
@Component({
  selector: 'ws-work-space',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'style()', '[style.height.px]': 'height()', '[style.--row.px]': 'w().row', '[attr.data-field]': 'field()' },
  template: `@if (answer()) {<span class="answer">{{ answer() }}</span>}`,
  styles: `
    :host { display: block; width: 100%; box-sizing: border-box; }
    :host(.lined), :host(.grid) { border: 1px solid #bbb; border-radius: 3px; }
    :host(.lined) { background: repeating-linear-gradient(to bottom, transparent 0, transparent calc(var(--row) - 1px), #c4c4c4 calc(var(--row) - 1px), #c4c4c4 var(--row)); }
    .answer { color: #1a4f8a; font-style: italic; font-size: 16px; }
    :host(.grid) { background-image: linear-gradient(#ddd 1px, transparent 1px), linear-gradient(90deg, #ddd 1px, transparent 1px); background-size: calc(var(--row) / 2) calc(var(--row) / 2); }
  `,
})
export class WorkSpaceComponent {
  readonly node = input.required<WorkSpace>();
  readonly filled = input(false);
  protected readonly w = writing();
  protected readonly height = computed(() => this.node().rows * this.w().row);
  protected readonly field = computed(() => fieldId(this.node().field));
  protected readonly answer = computed(() => {
    const f = this.node().field;
    return f?.answer?.work && shown(f, this.filled()) ? `${f.answer.work} = ${f.answer.text}` : shown(f, this.filled());
  });
  protected readonly style = computed(() => {
    switch (this.node().style) {
      case WorkSpace_Style.GRID:
        return 'grid';
      case WorkSpace_Style.LINED:
        return 'lined';
    }
    return 'blank';
  });
}
