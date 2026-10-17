/**
 * Pure statistics for the eval report.
 *
 * Deliberately absent: pass@k computed as 1-(1-p)^k from the same k trials that
 * produced p. That is circular (it turns one observed rate into a "probability of
 * at least one success" and always inflates it), so the harness reports raw
 * passes/n with an interval instead.
 */

export interface Interval {
  low: number;
  high: number;
}

/** Wilson score interval for a binomial proportion (default 95%, z = 1.96). Null when n = 0. */
export function wilson(passes: number, n: number, z = 1.96): Interval | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (passes < 0 || passes > n) throw new RangeError('passes must be within 0..n');
  const p = passes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

export interface TaskCount {
  passes: number;
  n: number;
}

/**
 * Suite pass^k: the estimated probability that every task passes on all k
 * independent attempts, = product over tasks of p_task^k, with p_task = passes/n.
 * Point estimate only; with small n it is very noisy, which is why per-task
 * intervals are reported next to it. Null if there are no tasks or any task has
 * no scored trials (an unmeasured task cannot be assumed to pass).
 */
export function passPowerK(tasks: TaskCount[], k: number): number | null {
  if (tasks.length === 0 || !Number.isInteger(k) || k < 1) return null;
  let product = 1;
  for (const t of tasks) {
    if (t.n <= 0) return null;
    product *= Math.pow(t.passes / t.n, k);
  }
  return product;
}
