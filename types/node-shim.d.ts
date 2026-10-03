/* Minimal Node declarations for offline Phase 1 builds. Production installs should use @types/node. */
declare const process: { argv: string[]; env: Record<string, string | undefined>; platform: string; exitCode?: number; stdout: { write(value: string): void }; stderr: { write(value: string): void } };
declare namespace NodeJS { interface ErrnoException extends Error { code?: string } }
declare module "node:child_process" { export const execFile: (...args: unknown[]) => unknown; export interface ChildProcessWithoutNullStreams { stdout: { on(event: string, handler: (data: Buffer) => void): void }; kill(signal?: string): void; once(event: string, handler: (...args: unknown[]) => void): void; } export const spawn: (command: string, args: string[], options: unknown) => ChildProcessWithoutNullStreams; }
declare module "node:dns/promises" { export const lookup: (...args: any[]) => Promise<any>; export class Resolver { setServers(servers: string[]): void; resolve4(name: string): Promise<string[]>; } }
declare module "node:os" { export const networkInterfaces: () => Record<string, Array<{ family: string; internal: boolean; address: string; netmask: string }> | undefined>; export const homedir: () => string; }
declare module "node:net" { const net: any; export = net; }
declare module "node:util" { export const promisify: (fn: any) => any; }
declare module "node:dgram" { const dgram: any; export = dgram; }
declare class Buffer implements Iterable<number> { readonly length: number; [index: number]: number; static from(value: string | number[]): Buffer; static alloc(size: number): Buffer; static concat(list: Buffer[]): Buffer; copy(target: Buffer, targetStart?: number): number; readUInt16BE(offset: number): number; readUInt32BE(offset: number): number; readUInt32LE(offset: number): number; writeUInt16BE(value: number, offset: number): number; subarray(start?: number, end?: number): Buffer; toString(encoding?: string): string; [Symbol.iterator](): Iterator<number>; }
declare class AbortSignal { static timeout(milliseconds: number): AbortSignal; }
declare function fetch(input: string, init?: any): Promise<{ status: number }>;
declare module "node:assert/strict" { const assert: any; export = assert; }
declare module "node:test" { const test: any; export = test; }
declare module "node:fs/promises" { export const readFile: any; export const writeFile: any; export const mkdir: any; }
declare module "node:path" { export const join: (...parts: string[]) => string; }
declare module "node:crypto" { export const randomUUID: () => string; }
