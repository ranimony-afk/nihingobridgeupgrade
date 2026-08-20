export type LogLevel = "debug" | "info" | "warn" | "error";

const rank: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogRecord = {
  level: LogLevel;
  msg: string;
  ts: string;
  [key: string]: string | number | boolean | null | undefined;
};

export function formatLog(level: LogLevel, msg: string, meta: Record<string, string | number | boolean | null | undefined> = {}) {
  const record: LogRecord = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...meta,
  };
  return JSON.stringify(record);
}

export function createLogger(minLevel: LogLevel = "info", write: (line: string) => void = console.log) {
  const log = (level: LogLevel, msg: string, meta?: Record<string, string | number | boolean | null | undefined>) => {
    if (rank[level] < rank[minLevel]) return;
    write(formatLog(level, msg, meta));
  };
  return {
    debug: (msg: string, meta?: Record<string, string | number | boolean | null | undefined>) => log("debug", msg, meta),
    info: (msg: string, meta?: Record<string, string | number | boolean | null | undefined>) => log("info", msg, meta),
    warn: (msg: string, meta?: Record<string, string | number | boolean | null | undefined>) => log("warn", msg, meta),
    error: (msg: string, meta?: Record<string, string | number | boolean | null | undefined>) => log("error", msg, meta),
  };
}

export const logger = createLogger((process.env.LOG_LEVEL as LogLevel | undefined) ?? "info");
