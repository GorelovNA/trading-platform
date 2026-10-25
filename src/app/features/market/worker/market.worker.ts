import { workerClock, workerTimers } from './scheduler';
import { createWasmFactory } from './wasm-generator';
import { WorkerController } from './worker-controller';

const controller = new WorkerController(
  workerClock,
  workerTimers,
  createWasmFactory(),
  (event, transfer) => {
    postMessage(event, transfer);
  },
  () => {
    close();
  },
);
addEventListener('message', (event: MessageEvent<unknown>) => {
  controller.receive(event.data);
});
addEventListener('messageerror', () => {
  controller.receive(null);
});
void controller.start();
