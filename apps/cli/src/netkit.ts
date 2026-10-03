#!/usr/bin/env node
import { DEFAULT_SERVICE_PORTS, LocalNetworkEngine, assessRouter, discoverLocalNetwork, getHealth, run } from "../../../packages/network-engine/src";
import { Resolver } from "node:dns/promises";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { InMemoryFindingStore, JsonSecurityLogger, loadSecurityConfig, PcapCommandCapture, PcapStreamDecoder, SecurityEngine } from "../../../packages/network-engine/src/security";

const engine = new LocalNetworkEngine();
const [command, ...args] = process.argv.slice(2);

async function main(): Promise<void> {
  switch (command) {
    case "security": await security(args); return;
    case "health":
      print({ status: "ok", ...(await getHealth(engine)) });
      return;
    case "scan":
    case "devices":
      print(await scan());
      return;
    case "ping":
      print(await engine.ping(requireTarget(args[0])));
      return;
    case "ports":
      print(await engine.checkTcpPorts(requireTarget(args[0]), parsePorts(args.slice(1))));
      return;
    case "services":
      print((await engine.checkTcpPorts(requireTarget(args[0]), DEFAULT_SERVICE_PORTS)).filter(({ state }) => state === "open"));
      return;
    case "dns":
    case "dnslookup":
      print({ hostname: requireTarget(args[0]), addresses: await engine.lookupDns(requireTarget(args[0])) });
      return;
    case "dnsbench": print(await dnsBenchmark()); return;
    case "speed": print(await speed()); return;
    case "dhcp": print(await dhcp(args.includes("--active"))); return;
    case "wifi": print(await wifi()); return;
    case "traceroute":
    case "trace":
      print(await engine.traceroute(requireTarget(args[0])));
      return;
    case "router":
    case "routervuln":
      print(await assessRouter(engine));
      return;
    case "monitor":
    case "events":
    case "insights":
    case "topology":
    case "trust":
    case "block":
    case "unblock":
    case "report":
      print({ supported: false, command, reason: "Not implemented in Phase 1. This command will require an agent, persistent inventory, or a verified router adapter; NetKit does not simulate it." });
      process.exitCode = 2;
      return;
    default:
      usage();
      process.exitCode = command ? 1 : 0;
  }
}

async function security(args: string[]): Promise<void> {
  const [action, value] = args; const store = new InMemoryFindingStore(); const monitor = new SecurityEngine(loadSecurityConfig(), store, new JsonSecurityLogger());
  if (action === "scan") { if (!value) throw new Error("Usage: security scan <classic-pcap-file>"); const data = await readFile(value); new PcapStreamDecoder(loadSecurityConfig().maxPacketBytes, async (frame, timestamp) => { await monitor.ingestFrame(frame, timestamp); }).push(data); await new Promise((resolve) => setTimeout(resolve, 0)); print({ mode: "offline-pcap", stats: monitor.stats(), findings: await monitor.recentFindings(100) }); return; }
  if (action === "live") { const capture = new PcapCommandCapture(); await capture.start({ interface: process.env.PACKET_CAPTURE_INTERFACE, maxPacketBytes: loadSecurityConfig().maxPacketBytes }, async (frame, timestamp) => { await monitor.ingestFrame(frame, timestamp, process.env.PACKET_CAPTURE_INTERFACE); }); print({ mode: "live", interface: process.env.PACKET_CAPTURE_INTERFACE, status: "capturing", stop: "Ctrl+C" }); return; }
  if (action === "stats") { print(monitor.stats()); return; }
  throw new Error("Usage: security scan <classic-pcap-file> | security live | security stats");
}

async function scan(): Promise<Record<string, unknown>> {
  const devices = await discoverLocalNetwork(engine); const statePath = join(homedir(), ".netkit", "scan-state.json");
  let previous: Array<{ ip: string; mac?: string }> = [];
  try { previous = JSON.parse(await readFile(statePath, "utf8")).devices ?? []; } catch { /* first scan */ }
  await mkdir(join(homedir(), ".netkit"), { recursive: true }); await writeFile(statePath, JSON.stringify({ capturedAt: new Date().toISOString(), devices }, null, 2), { mode: 0o600 });
  const before = new Set(previous.map((device) => device.mac ?? device.ip)); const after = new Set(devices.map((device) => device.mac ?? device.ip));
  return { devices, newDevices: devices.filter((device) => !before.has(device.mac ?? device.ip)), goneDevices: previous.filter((device) => !after.has(device.mac ?? device.ip)), source: "bounded active local-subnet probe plus ARP cache" };
}
async function dnsBenchmark(): Promise<Record<string, unknown>> {
  const servers = ["1.1.1.1", "8.8.8.8", "9.9.9.9", "208.67.222.222"]; const samples = 3;
  const results = await Promise.all(servers.map(async (server) => {
    const measurements: number[] = [];
    for (let i = 0; i < samples; i += 1) { const resolver = new Resolver(); resolver.setServers([server]); const start = performance.now(); try { await resolver.resolve4("example.com"); measurements.push(performance.now() - start); } catch { /* record failure below */ } }
    const ordered = [...measurements].sort((a, b) => a - b); return { server, samples, successful: ordered.length, medianMs: ordered.length ? ordered[Math.floor(ordered.length / 2)] : undefined, p95Ms: ordered.length ? ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * .95) - 1)] : undefined };
  })); return { results, note: "Public resolver queries are intentional benchmark probes; no target network is scanned." };
}
async function speed(): Promise<Record<string, unknown>> {
  const bytes = Number(process.env.NETKIT_SPEED_BYTES ?? 5_000_000); if (!Number.isInteger(bytes) || bytes < 100_000 || bytes > 50_000_000) throw new Error("NETKIT_SPEED_BYTES must be 100000..50000000");
  const start = performance.now(); const response = await fetch(`https://speed.cloudflare.com/__down?bytes=${bytes}`, { signal: AbortSignal.timeout(60_000) }); const body = await (response as any).arrayBuffer(); const durationMs = performance.now() - start;
  return { supported: true, bytesReceived: body.byteLength, durationMs, downloadMbps: body.byteLength * 8 / durationMs / 1_000, limitation: "Download-only measurement; upload needs a configured authorized endpoint." };
}
async function dhcp(active: boolean): Promise<Record<string, unknown>> {
  if (active && !process.env.NETKIT_ALLOW_ACTIVE_DHCP) return { supported: false, reason: "Set NETKIT_ALLOW_ACTIVE_DHCP=true only when authorized; broadcast probing is disabled by default." };
  const local = engine.getLocalInterface(process.env.NETKIT_INTERFACE);
  const result = process.platform === "win32" ? await run("ipconfig", ["/all"]) : process.platform === "darwin" ? await run("ipconfig", ["getpacket", local.name]) : await run("nmcli", ["-f", "DHCP4", "dev", "show", local.name]);
  return result.supported ? { supported: true, activeProbe: false, raw: result.stdout } : { supported: false, reason: "No supported DHCP lease inspection tool found" };
}
async function wifi(): Promise<Record<string, unknown>> {
  const result = process.platform === "win32" ? await run("netsh", ["wlan", "show", "networks", "mode=bssid"], 15_000) : process.platform === "darwin" ? await run("system_profiler", ["SPAirPortDataType"], 15_000) : await run("nmcli", ["-f", "SSID,BSSID,CHAN,SIGNAL,SECURITY", "dev", "wifi", "list", "--rescan", "yes"], 20_000);
  return result.supported ? { supported: true, raw: result.stdout, limitation: "OS location permission and Wi-Fi hardware determine available results." } : { supported: false, reason: "No supported Wi-Fi tool found or no Wi-Fi hardware is available" };
}

function requireTarget(value: string | undefined): string {
  if (!value) throw new Error("A target is required");
  return value;
}

function parsePorts(values: string[]): readonly number[] {
  if (values.length === 0) return DEFAULT_SERVICE_PORTS;
  return values.flatMap((value) => value.split(",")).map((value) => Number(value));
}

function print(value: unknown): void { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
function usage(): void {
  process.stdout.write("NetKit Phase 1 (authorized private networks only)\nCommands: health, scan, devices, ping <private-ip>, ports <private-ip> [ports], services <private-ip>, dns <hostname>, traceroute <private-ip>\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected error";
  process.stderr.write(`${JSON.stringify({ success: false, error: { code: "INVALID_REQUEST", message } })}\n`);
  process.exitCode = 1;
});
