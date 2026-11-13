// Components for the kindergarten to grade 2 widgets. Each takes its node
// message as a signal input and draws the Drawing from draw_k2.
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { type Coins, type NumberBond, type NumberGrid, type PictureGroups, type TenFrame } from '../proto/v1/nodes_pb.js';
import * as draw from '../engine/draw_k2.js';
import { SvgComponent } from './svg.component.js';

@Component({
  selector: 'ws-ten-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class TenFrameComponent {
  readonly node = input.required<TenFrame>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.tenFrame(this.node()));
}

@Component({
  selector: 'ws-number-bond',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class NumberBondComponent {
  readonly node = input.required<NumberBond>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.numberBond(this.node(), this.filled()));
}

@Component({
  selector: 'ws-picture-groups',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class PictureGroupsComponent {
  readonly node = input.required<PictureGroups>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.pictureGroups(this.node()));
}

@Component({
  selector: 'ws-number-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class NumberGridComponent {
  readonly node = input.required<NumberGrid>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.numberGrid(this.node(), this.filled()));
}

@Component({
  selector: 'ws-coins',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgComponent],
  template: `<ws-svg [d]="d()" />`,
})
export class CoinsComponent {
  readonly node = input.required<Coins>();
  readonly filled = input(false);
  protected readonly d = computed(() => draw.coins(this.node()));
}
