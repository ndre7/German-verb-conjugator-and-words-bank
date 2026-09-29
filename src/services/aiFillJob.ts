// Global AI Fill Job Manager (Singleton)
// Handles sequential, chunked, cancellable AI background fill jobs
// with transient retry, automatic splitting, and immediate persistence.

export type JobStatus = "idle" | "running" | "complete" | "partial" | "stopped" | "cancelled";

export interface FailedJobItem {
  id: string;
  word: string;
}

export interface JobStartOptions<T> {
  type: "verb" | "vocab";
  items: T[];
  processBatch: (items: T[], signal: AbortSignal) => Promise<any[]>;
  onBatchDone: (results: any[], originalBatch: T[]) => Promise<void>;
  getItemId: (item: T) => string;
  getItemWord: (item: T) => string;
}

class AiFillJob {
  status: JobStatus = "idle";
  jobType: "verb" | "vocab" | null = null;
  batch: number = 0;
  totalBatches: number = 0;
  totalItems: number = 0;
  succeededCount: number = 0;
  failed: FailedJobItem[] = [];
  failedItems: any[] = [];
  errorMessage: string | null = null;
  estimatedRemainingSeconds: number = 0;

  private ac: AbortController | null = null;
  private listeners = new Set<() => void>();
  private lastOptions: JobStartOptions<any> | null = null;
  private batchDurations: number[] = [];

  private beforeUnloadHandler = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = "";
  };

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error("[AiFillJob listener error]", e);
      }
    });
  }

  isRunning(): boolean {
    return this.status === "running";
  }

  cancel(): void {
    if (this.status === "running" && this.ac) {
      this.ac.abort();
      this.status = "cancelled";
      this.emit();
    }
  }

  async retryFailed(): Promise<boolean> {
    if (!this.lastOptions || this.failedItems.length === 0 || this.isRunning()) {
      return false;
    }
    const failedToRetry = [...this.failedItems];
    return this.start({
      ...this.lastOptions,
      items: failedToRetry,
    });
  }

  async start<T>(options: JobStartOptions<T>): Promise<boolean> {
    if (this.isRunning()) {
      console.warn("[AiFillJob] A job is already running; lock active.");
      return false;
    }

    if (!options.items || options.items.length === 0) {
      return false;
    }

    this.lastOptions = options;
    this.jobType = options.type;
    this.ac = new AbortController();
    this.status = "running";
    this.errorMessage = null;
    this.batch = 0;
    this.failed = [];
    this.failedItems = [];
    this.succeededCount = 0;
    this.totalItems = options.items.length;
    this.batchDurations = [];

    const BATCH_SIZE = 2;
    // Build chunks of 2 items
    const chunks: T[][] = [];
    for (let i = 0; i < options.items.length; i += BATCH_SIZE) {
      chunks.push(options.items.slice(i, i + BATCH_SIZE));
    }
    this.totalBatches = chunks.length;
    this.estimatedRemainingSeconds = this.totalBatches * 3; // Initial heuristic: ~3s per batch

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", this.beforeUnloadHandler);
    }
    this.emit();

    const signal = this.ac.signal;

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (signal.aborted) {
          this.status = "cancelled";
          break;
        }

        const chunk = chunks[i];
        const batchStartTime = Date.now();

        // Pause ~0.7s between batches (after the first batch)
        if (i > 0) {
          await this.pauseMs(700, signal);
          if (signal.aborted) {
            this.status = "cancelled";
            break;
          }
        }

        try {
          await this.executeBatchWithRules(chunk, options, signal);
        } catch (err: any) {
          if (err.isGlobalFailure) {
            this.status = "stopped";
            this.errorMessage = err.message || "Global AI authentication or quota error";
            break;
          }
          if (signal.aborted) {
            this.status = "cancelled";
            break;
          }
        }

        this.batch = i + 1;
        const batchDuration = (Date.now() - batchStartTime) / 1000;
        this.batchDurations.push(batchDuration);
        const avgDuration =
          this.batchDurations.reduce((sum, d) => sum + d, 0) / this.batchDurations.length;
        const remainingBatches = Math.max(0, this.totalBatches - this.batch);
        this.estimatedRemainingSeconds = Math.round(avgDuration * remainingBatches);
        this.emit();
      }

      if (signal.aborted) {
        this.status = "cancelled";
      } else if (this.status !== "stopped") {
        if (this.failed.length === 0) {
          this.status = "complete";
        } else {
          this.status = "partial";
        }
      }
    } catch (e: any) {
      if (signal.aborted) {
        this.status = "cancelled";
      } else {
        console.error("[AiFillJob error]", e);
        this.status = "partial";
      }
    } finally {
      if (typeof window !== "undefined") {
        window.removeEventListener("beforeunload", this.beforeUnloadHandler);
      }
      this.estimatedRemainingSeconds = 0;
      this.emit();
    }

    return true;
  }

  private async executeBatchWithRules<T>(
    chunk: T[],
    options: JobStartOptions<T>,
    signal: AbortSignal
  ): Promise<void> {
    // Attempt 1: Full chunk (usually 2 items)
    try {
      const results = await options.processBatch(chunk, signal);
      await options.onBatchDone(results, chunk);
      this.succeededCount += chunk.length;
      return;
    } catch (firstErr: any) {
      if (signal.aborted) return;
      this.checkGlobalFailure(firstErr);

      // Handle 429 wait hint
      const waitHintSeconds = this.extractWaitHint(firstErr);
      if (waitHintSeconds > 0) {
        await this.pauseMs(waitHintSeconds * 1000, signal);
      } else {
        await this.pauseMs(800, signal);
      }
      if (signal.aborted) return;

      // Attempt 2: Retry the batch ONCE
      try {
        const results = await options.processBatch(chunk, signal);
        await options.onBatchDone(results, chunk);
        this.succeededCount += chunk.length;
        return;
      } catch (secondErr: any) {
        if (signal.aborted) return;
        this.checkGlobalFailure(secondErr);

        // If chunk has 2 items, split into two single-item batches
        if (chunk.length > 1) {
          for (const singleItem of chunk) {
            if (signal.aborted) break;
            await this.pauseMs(400, signal);
            try {
              const resSingle = await options.processBatch([singleItem], signal);
              await options.onBatchDone(resSingle, [singleItem]);
              this.succeededCount += 1;
            } catch (singleErr: any) {
              this.checkGlobalFailure(singleErr);
              this.markItemFailed(singleItem, options);
            }
          }
        } else {
          // Single item that failed twice
          this.markItemFailed(chunk[0], options);
        }
      }
    }
  }

  private markItemFailed<T>(item: T, options: JobStartOptions<T>): void {
    const id = options.getItemId(item);
    const word = options.getItemWord(item);
    this.failed.push({ id, word });
    this.failedItems.push(item);
    this.emit();
  }

  private checkGlobalFailure(err: any): void {
    const status = err?.status || err?.statusCode || 0;
    const msg = (err?.message || "").toLowerCase();
    const isAuth =
      status === 401 ||
      status === 403 ||
      msg.includes("unauthenticated") ||
      msg.includes("invalid api key") ||
      msg.includes("authentication failed");
    const isTotalQuota =
      (status === 429 || msg.includes("quota")) &&
      (msg.includes("every account") || msg.includes("all ai accounts"));

    if (isAuth || isTotalQuota) {
      const globalErr = new Error(
        isAuth
          ? "احراز هویت کلیدهای هوش مصنوعی با خطا مواجه شد."
          : "سهمیه تمام کلیدها و حساب‌های هوش مصنوعی پایان یافته است."
      );
      (globalErr as any).isGlobalFailure = true;
      throw globalErr;
    }
  }

  private extractWaitHint(err: any): number {
    const msg = String(err?.message || "");
    const match = msg.match(/retry in\s+([\d.]+)\s*s/i) || msg.match(/wait\s+([\d.]+)\s*s/i);
    if (match) {
      const s = parseFloat(match[1]);
      if (!isNaN(s) && s > 0 && s <= 30) return s;
    }
    return 0;
  }

  private pauseMs(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abortHandler);
        resolve();
      }, ms);
      const abortHandler = () => {
        clearTimeout(timer);
        resolve();
      };
      signal.addEventListener("abort", abortHandler, { once: true });
    });
  }
}

export const aiFillJob = new AiFillJob();
