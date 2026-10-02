import { execFile } from "node:child_process";
import { lookup } from "node:dns/promises";
import { networkInterfaces } from "node:os";
import net from "node:net";
import { promisify } from "node:util";
import { assertPrivateTarget, cidrFromAddressAndNetmask, isPrivateIpv4 } from "./ip";
import { serviceForPort } from "./services";
import type { CommandResult, DiscoveredDevice, NetworkEngine, NetworkInterfaceInfo, PingResult, PortResult } from "./types";

const execFileAsync = promisify(execFile);

export class LocalNetworkEngine implements NetworkEngine {
  getLocalInterface(preferredName?: string): NetworkInterfaceInfo {
    const interfaces = networkInterfaces();
    const candidates: Array<{ name: string; address: string; netmask: string }> = Object.entries(interfaces)
      .filter(([name]) => !preferredName || name === preferredName)
      .flatMap(([name, entries]) => (entries ?? []).filter((entry) => entry.family === "IPv4" && !entry.internal)
        .map((entry) => ({ name, address: entry.address, netmask: entry.netmask })));
    const selected = candidates.find((entry) => isPrivateIpv4(entry.address));
    if (!selected) throw new Error("No private IPv4 interface found; set NETKIT_INTERFACE if needed");
    return { ...selected, cidr: cidrFromAddressAndNetmask(selected.address, selected.netmask) };
  }

  async ping(target: string, allowInternetProbe = false): Promise<PingResult> {
    if (!allowInternetProbe) assertPrivateTarget(target);
    const args = process.platform === "win32" ? ["-n", "1", "-w", "1000", target] : ["-c", "1", "-W", "1", target];
    try {
      const { stdout } = await execFileAsync("ping", args, { timeout: 2_500 });
      const match = stdout.match(/(?:time[=<])([\d.]+)\s*ms/i);
      return { supported: true, reachable: true, latencyMs: match ? Number(match[1]) : undefined };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { supported: false, reason: "ping command is unavailable" };
      return { supported: true, reachable: false };
    }
  }

  async checkTcpPorts(target: string, ports: readonly number[], timeoutMs = 750): Promise<PortResult[]> {
    assertPrivateTarget(target);
    if (ports.length === 0 || ports.length > 128) throw new Error("Provide between 1 and 128 TCP ports");
    return Promise.all(ports.map(async (port) => {
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid TCP port: ${port}`);
      const state = await isTcpOpen(target, port, timeoutMs) ? "open" : "closed";
      return { port, protocol: "tcp", service: serviceForPort(port), state, confidence: state === "open" ? 0.98 : 0.9 };
    }));
  }

  async discoverArp(): Promise<DiscoveredDevice[]> {
    const command = process.platform === "win32" ? "arp" : "ip";
    const args = process.platform === "win32" ? ["-a"] : ["neigh", "show"];
    try {
      const { stdout } = await execFileAsync(command, args, { timeout: 3_000 });
      const records = stdout.matchAll(/(\d{1,3}(?:\.\d{1,3}){3}).*?((?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2})/gi);
      const devices = new Map<string, DiscoveredDevice>();
      for (const match of records) if (isPrivateIpv4(match[1])) devices.set(match[1], { ip: match[1], mac: match[2].replaceAll("-", ":").toLowerCase(), source: "arp" });
      return [...devices.values()];
    } catch {
      return [];
    }
  }

  async lookupDns(hostname: string): Promise<string[]> {
    if (!/^[a-zA-Z0-9.-]{1,253}$/.test(hostname)) throw new Error("Invalid hostname");
    return (await lookup(hostname, { all: true, verbatim: true })).map((answer: { address: string }) => answer.address);
  }

  async traceroute(target: string): Promise<CommandResult & { output?: string }> {
    assertPrivateTarget(target);
    const command = process.platform === "win32" ? "tracert" : "traceroute";
    try {
      const { stdout } = await execFileAsync(command, process.platform === "win32" ? ["-d", target] : ["-m", "12", "-n", target], { timeout: 20_000 });
      return { supported: true, output: stdout };
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException & { stdout?: string };
      if (err.code === "ENOENT") return { supported: false, reason: `${command} command is unavailable` };
      return { supported: false, reason: "traceroute did not complete", output: err.stdout };
    }
  }
}

function isTcpOpen(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (open: boolean) => { socket.removeAllListeners(); socket.destroy(); resolve(open); };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}
