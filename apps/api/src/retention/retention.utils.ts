export type RetentionSchedule = {
  enabled: boolean;
  retentionDays: number;
};

export function calculateRetentionExpiration(
  retrievalTimestamp: Date,
  policy: RetentionSchedule | null | undefined,
): Date | null {
  if (!policy?.enabled) return null;
  return new Date(retrievalTimestamp.getTime() + policy.retentionDays * 24 * 60 * 60 * 1000);
}
