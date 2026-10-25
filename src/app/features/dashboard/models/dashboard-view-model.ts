import type { InstrumentMetrics } from '../../market/domain/market-models';
import { instrumentSymbol } from '../../market/domain/instruments';
import {
  formatCurrencyCents,
  formatExactPrice,
  formatImbalance,
  formatVolume,
  UNAVAILABLE,
} from '../../market/domain/price-format';

export interface DashboardRow {
  readonly instrumentId: number;
  readonly symbol: string;
  readonly lastPrice: string;
  readonly spread: string;
  readonly volume: string;
  readonly vwap: string;
  readonly imbalance: string;
}

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
