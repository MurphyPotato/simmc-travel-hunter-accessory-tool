import { createWorker, Worker } from "tesseract.js";
import type { OcrProgress } from "./ocrV4";

interface PooledWorker {
  worker: Worker;
  onProgress?: (progress: OcrProgress) => void;
}

const idle: PooledWorker[] = [];
const waiting: Array<(worker: PooledWorker) => void> = [];
const all = new Set<PooledWorker>();
const maximumWorkers = 2;
let creating = 0;

export async function withV4OcrWorker<T>(
  paths: { workerPath: string; corePath: string; langPath: string },
  onProgress: ((progress: OcrProgress) => void) | undefined,
  task: (worker: Worker) => Promise<T>,
): Promise<T> {
  const pooled = await acquire(paths);
  pooled.onProgress = onProgress;
  try {
    return await task(pooled.worker);
  } finally {
    pooled.onProgress = undefined;
    release(pooled);
  }
}

export async function terminateV4OcrWorkers(): Promise<void> {
  const workers = [...all];
  all.clear();
  idle.length = 0;
  waiting.length = 0;
  await Promise.all(workers.map((pooled) => pooled.worker.terminate()));
}

async function acquire(paths: { workerPath: string; corePath: string; langPath: string }): Promise<PooledWorker> {
  const available = idle.pop();
  if (available) return available;
  if (all.size + creating < maximumWorkers) {
    creating += 1;
    const holder = {} as PooledWorker;
    try {
      holder.worker = await createWorker("chi_sim+eng", 1, {
        ...paths,
        cacheMethod: "none",
        logger: (message) => {
          holder.onProgress?.({
            status: message.status ?? "识别中",
            progress: typeof message.progress === "number" ? message.progress : 0,
          });
        },
      });
      all.add(holder);
      return holder;
    } finally {
      creating -= 1;
    }
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function release(worker: PooledWorker) {
  const waiter = waiting.shift();
  if (waiter) waiter(worker);
  else idle.push(worker);
}
