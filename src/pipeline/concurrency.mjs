import { availableParallelism } from "node:os";

export function pipelineConcurrency(
  environmentName,
  { defaultValue = Math.min(4, Math.max(2, availableParallelism() - 1)), maximum = 8 } = {},
) {
  const configured = Number.parseInt(process.env[environmentName] || "", 10);
  if (!Number.isFinite(configured)) return defaultValue;
  return Math.max(1, Math.min(maximum, configured));
}

export async function orderedMapLimit(values, limit, worker) {
  const results = new Array(values.length);
  let next = 0;
  async function run() {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await worker(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), values.length) }, () =>
      run(),
    ),
  );
  return results;
}
