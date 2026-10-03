export interface SecurityLogger { info(event: string, fields?: Record<string, unknown>): void; warn(event: string, fields?: Record<string, unknown>): void; error(event: string, fields?: Record<string, unknown>): void; debug(event: string, fields?: Record<string, unknown>): void; }
export class JsonSecurityLogger implements SecurityLogger {
  constructor(private readonly debugEnabled = process.env.LOG_LEVEL === "debug") {}
  info(event: string, fields: Record<string, unknown> = {}): void { this.write("info", event, fields); }
  warn(event: string, fields: Record<string, unknown> = {}): void { this.write("warn", event, fields); }
  error(event: string, fields: Record<string, unknown> = {}): void { this.write("error", event, fields); }
  debug(event: string, fields: Record<string, unknown> = {}): void { if (this.debugEnabled) this.write("debug", event, fields); }
  private write(level: string, event: string, fields: Record<string, unknown>): void { process.stderr.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields })}\n`); }
}
