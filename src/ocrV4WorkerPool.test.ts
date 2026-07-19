import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const workerState = vi.hoisted(() => ({
  created: [] as Array<{ terminate: ReturnType<typeof vi.fn> }>,
  failures: 0,
  blockCreations: false,
  activeCreations: 0,
  maximumCreations: 0,
  releaseCreations: [] as Array<() => void>,
}));

vi.mock("tesseract.js", () => ({
  createWorker: vi.fn(async () => {
    workerState.activeCreations += 1;
    workerState.maximumCreations = Math.max(workerState.maximumCreations, workerState.activeCreations);
    if (workerState.blockCreations) {
      await new Promise<void>((resolve) => workerState.releaseCreations.push(resolve));
    }
    if (workerState.failures > 0) {
      workerState.failures -= 1;
      workerState.activeCreations -= 1;
      throw new Error("worker creation failed");
    }
    const worker = { terminate: vi.fn(async () => undefined) };
    workerState.created.push(worker);
    workerState.activeCreations -= 1;
    return worker;
  }),
}));

import {
  V4_OCR_IDLE_TIMEOUT_MS,
  getV4OcrWorkerPoolDiagnostics,
  terminateV4OcrWorkers,
  withV4OcrWorker,
} from "./ocrV4WorkerPool";

const paths = { workerPath: "/worker.js", corePath: "/core", langPath: "/lang" };

describe("v4/v5 OCR worker pool lifecycle", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await terminateV4OcrWorkers();
    workerState.created.length = 0;
    workerState.failures = 0;
    workerState.blockCreations = false;
    workerState.activeCreations = 0;
    workerState.maximumCreations = 0;
    workerState.releaseCreations.length = 0;
  });

  afterEach(async () => {
    await terminateV4OcrWorkers();
    vi.useRealTimers();
  });

  it("terminates an entirely idle pool after 120 seconds and recreates on demand", async () => {
    await withV4OcrWorker(paths, undefined, async () => "first", {
      idleTimeoutMs: V4_OCR_IDLE_TIMEOUT_MS,
    });
    expect(getV4OcrWorkerPoolDiagnostics()).toMatchObject({ workers: 1, idle: 1, idleTimerArmed: true });

    await vi.advanceTimersByTimeAsync(V4_OCR_IDLE_TIMEOUT_MS + 1);

    expect(workerState.created[0].terminate).toHaveBeenCalledOnce();
    expect(getV4OcrWorkerPoolDiagnostics()).toMatchObject({ workers: 0, idle: 0 });

    await withV4OcrWorker(paths, undefined, async () => "second", {
      idleTimeoutMs: V4_OCR_IDLE_TIMEOUT_MS,
    });
    expect(workerState.created).toHaveLength(2);
  });

  it("discards a worker when an OCR task throws", async () => {
    await expect(withV4OcrWorker(paths, undefined, async () => {
      throw new Error("OCR failed");
    }, { discardOnError: true })).rejects.toThrow("OCR failed");

    expect(workerState.created[0].terminate).toHaveBeenCalledOnce();
    expect(getV4OcrWorkerPoolDiagnostics().workers).toBe(0);
  });

  it("keeps the legacy v4 pool alive when no v5 lifecycle options are supplied", async () => {
    await withV4OcrWorker(paths, undefined, async () => "legacy");

    await vi.advanceTimersByTimeAsync(V4_OCR_IDLE_TIMEOUT_MS + 1);

    expect(workerState.created[0].terminate).not.toHaveBeenCalled();
    expect(getV4OcrWorkerPoolDiagnostics()).toMatchObject({ workers: 1, idle: 1, idleTimerArmed: false });
  });

  it("runs no more than two OCR tasks at once", async () => {
    let active = 0;
    let maximumActive = 0;
    const releases: Array<() => void> = [];
    const task = () => withV4OcrWorker(paths, undefined, async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => releases.push(() => {
        active -= 1;
        resolve();
      }));
    }, { idleTimeoutMs: V4_OCR_IDLE_TIMEOUT_MS });

    const tasks = [task(), task(), task()];
    await vi.advanceTimersByTimeAsync(0);
    expect(getV4OcrWorkerPoolDiagnostics()).toMatchObject({ workers: 2, waiting: 1 });

    releases.shift()?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(maximumActive).toBe(2);

    while (releases.length > 0) {
      releases.shift()?.();
      await vi.advanceTimersByTimeAsync(0);
    }
    await Promise.all(tasks);
  });

  it("serializes worker initialization to avoid concurrent language-cache writes", async () => {
    workerState.blockCreations = true;
    const first = withV4OcrWorker(paths, undefined, async () => "first", {
      idleTimeoutMs: V4_OCR_IDLE_TIMEOUT_MS,
    });
    const second = withV4OcrWorker(paths, undefined, async () => "second", {
      idleTimeoutMs: V4_OCR_IDLE_TIMEOUT_MS,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(workerState.activeCreations).toBe(1);
    expect(workerState.releaseCreations).toHaveLength(1);

    workerState.releaseCreations.shift()?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(workerState.maximumCreations).toBe(1);
    expect(workerState.activeCreations).toBe(1);

    workerState.releaseCreations.shift()?.();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.all([first, second]);
    expect(workerState.maximumCreations).toBe(1);
  });

  it("rejects queued work instead of hanging when all worker creation fails", async () => {
    workerState.failures = 2;
    const tasks = [0, 1, 2].map(() => withV4OcrWorker(paths, undefined, async () => undefined, {
      discardOnError: true,
      idleTimeoutMs: V4_OCR_IDLE_TIMEOUT_MS,
    }));

    const results = await Promise.allSettled(tasks);

    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(getV4OcrWorkerPoolDiagnostics()).toMatchObject({ workers: 0, waiting: 0, creating: 0 });
  });
});
