import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { intToIpv4, ipv4ToInt } from "./ip";

const exec = promisify(execFile);
export async function run(command: string, args: string[], timeout = 5_000): Promise<{ supported: boolean; stdout?: string; stderr?: string }> {
  try { const result = await exec(command, args, { timeout, maxBuffer: 1_000_000 }); return { supported: true, stdout: result.stdout, stderr: result.stderr }; }
  catch (cause: unknown) {
    const error = cause as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    if (error.code === "ENOENT") return { supported: false };
    return { supported: true, stdout: error.stdout, stderr: error.stderr };
  }
}

export async function getDefaultGateway(): Promise<string | undefined> {
  const result = process.platform === "win32" ? await run("route", ["print", "-4", "0.0.0.0"]) : process.platform === "darwin" ? await run("route", ["-n", "get", "default"]) : await run("ip", ["route", "show", "default"]);
  const text = result.stdout ?? "";
  const match = process.platform === "win32" ? text.match(/^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+(?:\.\d+){3})/m) : text.match(/(?:gateway:|via)\s+(\d+(?:\.\d+){3})/);
  return match?.[1];
}

export function hostsInCidr(cidr: string, maximum = 1024): string[] {
  const [network, bitsValue] = cidr.split("/"); const bits = Number(bitsValue);
  if (!network || !Number.isInteger(bits) || bits < 8 || bits > 30) throw new Error("CIDR must be between /8 and /30");
  const count = 2 ** (32 - bits) - 2;
  if (count > maximum) throw new Error(`Refusing active discovery of ${count} hosts; limit is ${maximum}`);
  const base = ipv4ToInt(network); return Array.from({ length: count }, (_, index) => intToIpv4(base + index + 1));
}
