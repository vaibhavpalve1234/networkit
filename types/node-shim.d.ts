/* Minimal Node declarations for offline Phase 1 builds. Production installs should use @types/node. */
declare const process: { argv: string[]; env: Record<string, string | undefined>; platform: string; exitCode?: number; stdout: { write(value: string): void }; stderr: { write(value: string): void } };
declare namespace NodeJS { interface ErrnoException extends Error { code?: string } }
declare module "node:child_process" { export const execFile: (...args: any[]) => any; }
declare module "node:dns/promises" { export const lookup: (...args: any[]) => Promise<any>; export class Resolver { setServers(servers: string[]): void; resolve4(name: string): Promise<string[]>; } }
declare module "node:os" { export const networkInterfaces: () => Record<string, Array<{ family: string; internal: boolean; address: string; netmask: string }> | undefined>; export const homedir: () => string; }
declare module "node:net" { const net: any; export = net; }
declare module "node:util" { export const promisify: (fn: any) => any; }
declare module "node:dgram" { const dgram: any; export = dgram; }
declare class Buffer { static from(value: string): Buffer; toString(encoding?: string): string; }
declare class AbortSignal { static timeout(milliseconds: number): AbortSignal; }
declare function fetch(input: string, init?: any): Promise<{ status: number }>;
declare module "node:assert/strict" { const assert: any; export = assert; }
declare module "node:test" { const test: any; export = test; }
declare module "node:fs/promises" { export const readFile: any; export const writeFile: any; export const mkdir: any; }
declare module "node:path" { export const join: (...parts: string[]) => string; }
