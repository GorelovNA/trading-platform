import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { DashboardRow } from '../models/dashboard-row.model';

@Component({
  selector: 'app-market-table',
  templateUrl: './market-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketTableComponent {
  readonly rows = input.required<readonly DashboardRow[]>();
}
