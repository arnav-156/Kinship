export type SloTargetName = "workspace" | "search" | "urlAnalysis" | "brief" | "draft";

export interface SloTarget {
  maxErrorRate: number;
  name: SloTargetName;
  p95LimitMs: number;
}

export interface SloSample {
  durationMs: number;
  status: number;
}

export interface SloLoadOptions {
  concurrency: number;
  execute(target: SloTarget): Promise<SloSample>;
  iterations: number;
  targets: readonly SloTarget[];
}

export const DEFAULT_SLO_TARGETS: readonly SloTarget[] = [
  { maxErrorRate: 0.01, name: "workspace", p95LimitMs: 500 },
  { maxErrorRate: 0.01, name: "search", p95LimitMs: 1_000 },
  { maxErrorRate: 0.01, name: "urlAnalysis", p95LimitMs: 5_000 },
  { maxErrorRate: 0.01, name: "brief", p95LimitMs: 15_000 },
  { maxErrorRate: 0.01, name: "draft", p95LimitMs: 15_000 },
] as const;

export async function runSloLoad(options: SloLoadOptions) {
  if (!Number.isInteger(options.iterations) || options.iterations < 1) {
    throw new Error("iterations must be a positive integer");
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new Error("concurrency must be a positive integer");
  }

  const jobs = options.targets.flatMap((target) =>
    Array.from({ length: options.iterations }, () => target),
  );
  const samplesByTarget = new Map<SloTargetName, SloSample[]>(
    options.targets.map((target) => [target.name, []]),
  );
  let nextJob = 0;
  const worker = async () => {
    while (nextJob < jobs.length) {
      const target = jobs[nextJob];
      nextJob += 1;
      if (!target) return;
      let sample: SloSample;
      try {
        sample = await options.execute(target);
      } catch {
        sample = { durationMs: 0, status: 0 };
      }
      samplesByTarget.get(target.name)?.push(sample);
    }
  };
  await Promise.all(Array.from({ length: Math.min(options.concurrency, jobs.length) }, worker));

  const results = options.targets.map((target) =>
    summarizeTarget(target, samplesByTarget.get(target.name) ?? []),
  );

  return {
    concurrency: options.concurrency,
    iterations: options.iterations,
    passed: results.every((target) => target.passed),
    targets: results,
    totalRequests: results.reduce((total, target) => total + target.requests, 0),
  };
}

function summarizeTarget(target: SloTarget, samples: SloSample[]) {
  const durations = samples.map((sample) => sample.durationMs).sort((a, b) => a - b);
  const errors = samples.filter((sample) => sample.status < 200 || sample.status >= 300).length;
  const errorRate = errors / samples.length;
  const totalDurationMs = durations.reduce((total, duration) => total + duration, 0);
  const p95Ms = percentile(durations, 0.95);
  return {
    errorRate,
    estimatedRequestsPerSecond:
      totalDurationMs > 0 ? Number(((samples.length * 1_000) / totalDurationMs).toFixed(2)) : null,
    failedRequests: errors,
    maxErrorRate: target.maxErrorRate,
    name: target.name,
    p50Ms: percentile(durations, 0.5),
    p95LimitMs: target.p95LimitMs,
    p95Ms,
    p99Ms: percentile(durations, 0.99),
    passed: errorRate <= target.maxErrorRate && p95Ms <= target.p95LimitMs,
    requests: samples.length,
    successfulRequests: samples.length - errors,
  };
}

function percentile(sortedValues: number[], percentileValue: number): number {
  const index = Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1);
  return sortedValues[index] ?? 0;
}
