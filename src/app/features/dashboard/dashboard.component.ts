import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ProducerService } from '../market/client/producer.service';
import { ProducerStatusComponent } from '../../shared/producer-status.component';
import { MarketTableComponent } from './market-table/market-table.component';
import { dashboardRows } from './models/dashboard-view-model.helper';

@Component({
  selector: 'app-dashboard',
  imports: [MarketTableComponent, ProducerStatusComponent],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly producer = inject(ProducerService);
  protected readonly metrics = computed(() => this.producer.state().metrics);
  protected readonly rows = computed(() => dashboardRows(this.metrics()));
}
