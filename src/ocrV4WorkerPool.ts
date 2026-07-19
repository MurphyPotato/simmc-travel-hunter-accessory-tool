import { createWorker, Worker } from "tesseract.js";
import type { OcrProgress } from "./ocrV4";

interface PooledWorker {
  worker: Worker;
  onProgress?: (progress: OcrProgress) => void;
  idleTimeoutMs?: number;
}

interface WorkerPaths {
  workerPath: string;
  corePath: string;
  langPath: string;
  gzip?: boolean;
}

interface WaitingRequest {
  paths: WorkerPaths;
  resolve: (worker: PooledWorker) => void;
  reject: (error: Error) => void;
}

export interface OcrWorkerUseOptions {
  discardOnError?: boolean;
  idleTimeoutMs?: number;
}

const idle: PooledWorker[] = [];
const waiting: WaitingRequest[] = [];
const all = new Set<PooledWorker>();
const maximumWorkers = 2;
export const V4_OCR_IDLE_TIMEOUT_MS = 120_000;

let creating = 0;
let generation = 0;
let idleTerminationTimer: ReturnType<typeof setTimeout> | undefined;
let workerCreationQueue: Promise<void> = Promise.resolve();

export async function withV4OcrWorker<T>(
  paths: WorkerPaths,
  onProgress: ((progress: OcrProgress) => void) | undefined,
  task: (worker: Worker) => Promise<T>,
  options: OcrWorkerUseOptions = {},
): Promise<T> {
  const pooled = await acquire(paths);
  pooled.onProgress = onProgress;
  pooled.idleTimeoutMs = options.idleTimeoutMs;
  let failed = false;
  try {
    return await task(pooled.worker);
  } catch (error) {
    failed = true;
    if (options.discardOnError) await discard(pooled);
    throw error;
  } finally {
    pooled.onProgress = undefined;
    if (!failed || !options.discardOnError) release(pooled);
  }
}

export async function terminateV4OcrWorkers(): Promise<void> {
  generation += 1;
  clearIdleTerminationTimer();
  const pending = waiting.splice(0);
  const error = new Error("OCR Worker 已释放");
  pending.forEach((request) => request.reject(error));

  const workers = [...all];
  all.clear();
  idle.length = 0;
  await Promise.allSettled(workers.map((pooled) => pooled.worker.terminate()));
}

export function getV4OcrWorkerPoolDiagnostics() {
  return {
    workers: all.size,
    idle: idle.length,
    waiting: waiting.length,
    creating,
    maximumWorkers,
    idleTimerArmed: idleTerminationTimer !== undefined,
  };
}

async function acquire(paths: WorkerPaths): Promise<PooledWorker> {
  clearIdleTerminationTimer();
  const available = idle.pop();
  if (available) return available;
  if (all.size + creating < maximumWorkers) return createPooledWorker(paths);
  return new Promise((resolve, reject) => waiting.push({ paths, resolve, reject }));
}

async function createPooledWorker(paths: WorkerPaths): Promise<PooledWorker> {
  creating += 1;
  const createGeneration = generation;
  const holder = {} as PooledWorker;
  const creation = workerCreationQueue.then(async () => {
    if (createGeneration !== generation) throw new Error("OCR Worker 创建已取消");
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
  });
  workerCreationQueue = creation.then(() => undefined, () => undefined);
  try {
    await creation;
    if (createGeneration !== generation) {
      await holder.worker.terminate();
      throw new Error("OCR Worker 创建期间已被释放");
    }
    all.add(holder);
    return holder;
  } catch (error) {
    const waiter = waiting.shift();
    if (waiter) {
      waiter.reject(error instanceof Error ? error : new Error("OCR Worker 创建失败"));
    }
    throw error;
  } finally {
    creating -= 1;
  }
}

function release(worker: PooledWorker) {
  if (!all.has(worker)) return;
  const waiter = waiting.shift();
  if (waiter) {
    waiter.resolve(worker);
    return;
  }
  idle.push(worker);
  scheduleIdleTermination();
}

async function discard(worker: PooledWorker): Promise<void> {
  if (!all.delete(worker)) return;
  const idleIndex = idle.indexOf(worker);
  if (idleIndex >= 0) idle.splice(idleIndex, 1);
  await Promise.resolve(worker.worker.terminate()).catch(() => undefined);

  const waiter = waiting.shift();
  if (waiter) {
    void acquire(waiter.paths).then(waiter.resolve, waiter.reject);
  } else {
    scheduleIdleTermination();
  }
}

function scheduleIdleTermination() {
  clearIdleTerminationTimer();
  if (all.size === 0 || idle.length !== all.size || waiting.length > 0 || creating > 0) return;
  const timeouts = idle.map((worker) => worker.idleTimeoutMs);
  if (timeouts.some((timeout) => timeout === undefined)) return;
  const timeout = Math.min(...timeouts as number[]);
  idleTerminationTimer = setTimeout(() => {
    idleTerminationTimer = undefined;
    void terminateV4OcrWorkers();
  }, timeout);
}

function clearIdleTerminationTimer() {
  if (idleTerminationTimer === undefined) return;
  clearTimeout(idleTerminationTimer);
  idleTerminationTimer = undefined;
}
