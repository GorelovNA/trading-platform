import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { DashboardRow } from '../models/dashboard-view-model';

@Component({
  selector: 'app-market-table',
  templateUrl: './market-table.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketTable {
  readonly rows = input.required<readonly DashboardRow[]>();
}
