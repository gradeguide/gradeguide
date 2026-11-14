import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { type Node } from '../proto/v1/nodes_pb.js';
import { MathComponent } from './math.component.js';
import {
  AngleComponent,
  PlaceValueChartComponent,
  BaseTenBlocksComponent,
  LongDivisionComponent,
  ClockComponent,
  RulerComponent,
  LinePlotComponent,
  ProtractorComponent,
  LineFigureComponent,
  NumberChartComponent,
  AreaModelComponent,
  ChoicesComponent,
  ColumnArithmeticComponent,
  DotArrayComponent,
  FractionBarComponent,
  FractionWallComponent,
  LinesComponent,
  NumberLineComponent,
  PolygonComponent,
  TapeDiagramComponent,
  UnitGridComponent,
  BarGraphComponent,
  DataTableComponent,
  WorkSpaceComponent,
} from './widgets.component.js';
import { FractionCircleComponent, GridShapeComponent, MeasuringJugComponent } from './widgets_shapes.component.js';
import {
  CoinsComponent,
  LengthStripsComponent,
  NumberBondComponent,
  NumberGridComponent,
  PictureGroupsComponent,
  TallyChartComponent,
  TenFrameComponent,
} from './widgets_k2.component.js';

// NodeComponent draws any node by its kind. Rows and stacks draw their
// children with this component again.
@Component({
  selector: 'ws-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MathComponent,
    TenFrameComponent,
    NumberBondComponent,
    PictureGroupsComponent,
    NumberGridComponent,
    CoinsComponent,
    TallyChartComponent,
    LengthStripsComponent,
    NumberLineComponent,
    FractionBarComponent,
    FractionWallComponent,
    UnitGridComponent,
    AreaModelComponent,
    DotArrayComponent,
    TapeDiagramComponent,
    ColumnArithmeticComponent,
    AngleComponent,
    PolygonComponent,
    ChoicesComponent,
    LinesComponent,
    PlaceValueChartComponent,
    BaseTenBlocksComponent,
    LongDivisionComponent,
    ClockComponent,
    RulerComponent,
    LinePlotComponent,
    ProtractorComponent,
    LineFigureComponent,
    NumberChartComponent,
    BarGraphComponent,
    DataTableComponent,
    WorkSpaceComponent,
    GridShapeComponent,
    FractionCircleComponent,
    MeasuringJugComponent,
  ],
  host: { '[class]': 'kind()' },
  template: `
    @let k = node().kind;
    @switch (k.case) {
      @case ('text') {
        <span class="text">{{ k.value }}</span>
      }
      @case ('math') {
        <ws-math [math]="k.value" [filled]="filled()" />
      }
      @case ('row') {
        @for (c of k.value.children; track $index) {
          <ws-node [node]="c" [filled]="filled()" />
        }
      }
      @case ('stack') {
        @for (c of k.value.children; track $index) {
          <ws-node [node]="c" [filled]="filled()" />
        }
      }
      @case ('numberLine') {
        <ws-number-line [node]="k.value" [filled]="filled()" />
      }
      @case ('fractionBar') {
        <ws-fraction-bar [node]="k.value" [filled]="filled()" />
      }
      @case ('fractionWall') {
        <ws-fraction-wall [node]="k.value" [filled]="filled()" />
      }
      @case ('unitGrid') {
        <ws-unit-grid [node]="k.value" [filled]="filled()" />
      }
      @case ('areaModel') {
        <ws-area-model [node]="k.value" [filled]="filled()" />
      }
      @case ('dotArray') {
        <ws-dot-array [node]="k.value" [filled]="filled()" />
      }
      @case ('tapeDiagram') {
        <ws-tape-diagram [node]="k.value" [filled]="filled()" />
      }
      @case ('columnArithmetic') {
        <ws-column-arithmetic [node]="k.value" [filled]="filled()" />
      }
      @case ('angle') {
        <ws-angle [node]="k.value" [filled]="filled()" />
      }
      @case ('polygon') {
        <ws-polygon [node]="k.value" [filled]="filled()" />
      }
      @case ('placeValueChart') {
        <ws-place-value-chart [node]="k.value" [filled]="filled()" />
      }
      @case ('baseTenBlocks') {
        <ws-base-ten-blocks [node]="k.value" [filled]="filled()" />
      }
      @case ('longDivision') {
        <ws-long-division [node]="k.value" [filled]="filled()" />
      }
      @case ('clock') {
        <ws-clock [node]="k.value" [filled]="filled()" />
      }
      @case ('ruler') {
        <ws-ruler [node]="k.value" [filled]="filled()" />
      }
      @case ('linePlot') {
        <ws-line-plot [node]="k.value" [filled]="filled()" />
      }
      @case ('protractor') {
        <ws-protractor [node]="k.value" [filled]="filled()" />
      }
      @case ('lineFigure') {
        <ws-line-figure [node]="k.value" [filled]="filled()" />
      }
      @case ('numberChart') {
        <ws-number-chart [node]="k.value" [filled]="filled()" />
      }
      @case ('gridShape') {
        <ws-grid-shape [node]="k.value" [filled]="filled()" />
      }
      @case ('fractionCircle') {
        <ws-fraction-circle [node]="k.value" [filled]="filled()" />
      }
      @case ('measuringJug') {
        <ws-measuring-jug [node]="k.value" />
      }
      @case ('barGraph') {
        <ws-bar-graph [node]="k.value" [filled]="filled()" />
      }
      @case ('dataTable') {
        <ws-data-table [node]="k.value" [filled]="filled()" />
      }
      @case ('workSpace') {
        <ws-work-space [node]="k.value" [filled]="filled()" />
      }
      @case ('multiPartQuestion') {
        <div class="stem">
          @for (c of k.value.stem; track $index) {
            <ws-node [node]="c" [filled]="filled()" />
          }
        </div>
        @for (part of k.value.parts; track $index) {
          <div class="part">
            <span class="pl">{{ part.label }}</span>
            <div class="pn">
              @for (c of part.prompt; track $index) {
                <ws-node [node]="c" [filled]="filled()" />
              }
              @for (c of part.response; track $index) {
                <ws-node [node]="c" [filled]="filled()" />
              }
            </div>
          </div>
        }
      }
      @case ('tenFrame') {
        <ws-ten-frame [node]="k.value" [filled]="filled()" />
      }
      @case ('numberBond') {
        <ws-number-bond [node]="k.value" [filled]="filled()" />
      }
      @case ('pictureGroups') {
        <ws-picture-groups [node]="k.value" [filled]="filled()" />
      }
      @case ('numberGrid') {
        <ws-number-grid [node]="k.value" [filled]="filled()" />
      }
      @case ('coins') {
        <ws-coins [node]="k.value" [filled]="filled()" />
      }
      @case ('tallyChart') {
        <ws-tally-chart [node]="k.value" [filled]="filled()" />
      }
      @case ('lengthStrips') {
        <ws-length-strips [node]="k.value" [filled]="filled()" />
      }
      @case ('choices') {
        <ws-choices [node]="k.value" [filled]="filled()" />
      }
      @case ('lines') {
        <ws-lines [node]="k.value" [filled]="filled()" />
      }
    }
  `,
  styles: `
    :host { display: block; }
    :host(.text), :host(.choices) { line-height: 20px; }
    :host(.row) { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    :host(.stack) { display: flex; flex-direction: column; gap: 6px; }
    .text { font-size: 15px; line-height: 20px; }
    :host(.multiPartQuestion) { display: flex; flex-direction: column; gap: 6px; width: 100%; }
    .stem { display: flex; flex-direction: column; gap: 6px; }
    .part { display: flex; gap: 4px; margin-top: 6px; }
    .pl { flex: 0 0 28px; font-weight: 700; font-size: 14px; padding-top: 1px; }
    .pn { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
  `,
})
export class NodeComponent {
  readonly node = input.required<Node>();
  readonly filled = input(false);
  protected readonly kind = computed(() => this.node().kind.case ?? '');
}
