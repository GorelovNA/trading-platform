import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Producer } from '../market/client/producer';
import { ProducerStatus } from '../../shared/producer-status';
import { MarketTable } from './market-table/market-table';
import { dashboardRows } from './models/dashboard-view-model';

@Component({
  selector: 'app-dashboard',
  imports: [MarketTable, ProducerStatus],
  templateUrl: './dashboard.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  private readonly producer = inject(Producer);
  protected readonly metrics = computed(() => this.producer.state().metrics);
  protected readonly rows = computed(() => dashboardRows(this.metrics()));
}
