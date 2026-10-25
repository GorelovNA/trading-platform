export interface DashboardRow {
  readonly instrumentId: number;
  readonly symbol: string;
  readonly lastPrice: string;
  readonly spread: string;
  readonly volume: string;
  readonly vwap: string;
  readonly imbalance: string;
}
