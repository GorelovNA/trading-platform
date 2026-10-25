import { workerClock, workerTimers } from './scheduler.helper';
import { createWasmFactory } from './wasm-generator.helper';
import { WorkerController } from './worker-controller';

const controller = new WorkerController(
  workerClock,
  workerTimers,
  createWasmFactory(),
  (event) => {
    postMessage(event);
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
