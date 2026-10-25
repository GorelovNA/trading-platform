import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Producer } from '../features/market/client/producer';

@Component({
  selector: 'app-producer-status',
  templateUrl: './producer-status.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProducerStatus {
  protected readonly producer = inject(Producer);
  protected readonly feedback = computed(() => {
    const state = this.producer.state();
    if (state.failure !== null) return this.producer.failureMessage();
    switch (state.pendingAction) {
      case 'reset':
        return 'Starting a new run. Waiting for confirmation…';
      case 'pause':
        return 'Pausing generation…';
      case 'resume':
        return 'Resuming generation…';
      case null:
        switch (state.status) {
          case 'running':
            return 'Running';
          case 'paused':
            return 'Paused. Values and totals are preserved.';
          case 'initializing':
            return 'Initializing market producer…';
          case 'disposed':
            return 'Market producer stopped.';
          case 'error':
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
