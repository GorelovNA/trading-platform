import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ControlAction, ProducerStatus } from '../features/market/models/market.model';
import { ProducerService } from '../features/market/client/producer.service';

@Component({
  selector: 'app-producer-status',
  templateUrl: './producer-status.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProducerStatusComponent {
  protected readonly producer = inject(ProducerService);
  protected readonly status = ProducerStatus;
  protected readonly feedback = computed(() => {
    const state = this.producer.state();
    if (state.failure !== null) return this.producer.failureMessage();
    switch (state.pendingAction) {
      case ControlAction.Reset:
        return 'Starting a new run. Waiting for confirmation…';
      case ControlAction.Pause:
        return 'Pausing generation…';
      case ControlAction.Resume:
        return 'Resuming generation…';
      case null:
        switch (state.status) {
          case ProducerStatus.Running:
            return 'Running';
          case ProducerStatus.Paused:
            return 'Paused. Values and totals are preserved.';
          case ProducerStatus.Initializing:
            return 'Initializing market producer…';
          case ProducerStatus.Disposed:
            return 'Market producer stopped.';
          case ProducerStatus.Error:
            return 'Market producer unavailable.';
        }
    }
  });
  protected readonly rate = computed(() =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(
      this.producer.nominalUpdatesPerSecond(),
    ),
  );
}
