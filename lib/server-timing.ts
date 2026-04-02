type TimingFields = Record<string, unknown>;

export function createServerTimingLogger(label: string, baseFields?: TimingFields) {
  const startedAt = performance.now();
  const steps: Record<string, number> = {};

  return {
    mark(step: string, from: number) {
      steps[step] = Math.round((performance.now() - from) * 100) / 100;
    },
    flush(extraFields?: TimingFields) {
      const total = Math.round((performance.now() - startedAt) * 100) / 100;
      console.info(
        `[timing] ${label}`,
        JSON.stringify({
          ...(baseFields ?? {}),
          ...(extraFields ?? {}),
          timingsMs: {
            ...steps,
            total,
          },
        }),
      );
    },
  };
}

export async function timeAsync<T>(
  timings: ReturnType<typeof createServerTimingLogger>,
  step: string,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  const result = await fn();
  timings.mark(step, startedAt);
  return result;
}
