export interface WasmEnvironment {
  readonly assetUrl: string;
  initialize(response: Response): Promise<unknown>;
  protocol(): number;
}
