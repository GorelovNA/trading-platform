import type { InstrumentMetrics } from '../../market/models/market.model';
import type { DashboardRow } from './dashboard-row.model';
import { instrumentSymbol } from '../../market/domain/instruments.helper';
import {
  formatCurrencyCents,
  formatExactPrice,
  formatImbalance,
  formatVolume,
  UNAVAILABLE,
} from '../../market/domain/price-format.helper';

export function dashboardRows(metrics: readonly InstrumentMetrics[]): readonly DashboardRow[] {
  return metrics.map((metric) => ({
    instrumentId: metric.instrumentId,
    symbol: instrumentSymbol(metric.instrumentId),
    lastPrice:
      metric.lastPriceCents === null
        ? UNAVAILABLE
        : formatCurrencyCents(BigInt(metric.lastPriceCents)),
    spread:
      metric.spreadCents === null ? UNAVAILABLE : formatCurrencyCents(BigInt(metric.spreadCents)),
    volume: formatVolume(metric.volume),
    vwap: formatExactPrice(metric.vwap),
    imbalance: formatImbalance(metric.imbalance),
  }));
}
