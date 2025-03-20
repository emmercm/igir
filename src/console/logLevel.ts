export const LogLevel = {
  TRACE: 1,
  DEBUG: 2,
  INFO: 3,
  WARN: 4,
  ERROR: 5,
  NOTICE: 6,
  ALWAYS: 7, // always print
  NEVER: 8, // never print
} as const;
type LogLevelKey = keyof typeof LogLevel;
export type LogLevelValue = (typeof LogLevel)[LogLevelKey];
export const LogLevelInverted = Object.fromEntries(
  Object.entries(LogLevel).map(([key, value]) => [value, key]),
) as Record<number, LogLevelKey>;
