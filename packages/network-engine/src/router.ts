import dgram from "node:dgram";
import { getDefaultGateway, run } from "./system";
import type { LocalNetworkEngine } from "./engine";

const ROUTER_PORTS = [21, 22, 23, 53, 80, 443, 7547, 8080, 8443];
export async function assessRouter(engine: LocalNetworkEngine): Promise<Record<string, unknown>> {
  const gateway = await getDefaultGateway();
  if (!gateway) return { supported: false, reason: "No default gateway found" };
  const [services, ssdp, upnpc] = await Promise.all([engine.checkTcpPorts(gateway, ROUTER_PORTS), discoverSsdp(), run("upnpc", ["-l"], 8_000)]);
  return {
    supported: true, gateway, services: services.filter(({ state }) => state === "open").map((service) => ({ ...service, severity: severityFor(service.port) })),
    upnp: ssdp, portMappings: upnpc.supported ? { state: "TOOL_OUTPUT", output: upnpc.stdout } : { state: "NOT_LISTABLE", reason: "miniupnpc (upnpc) is not installed" },
    natPmpPcp: { state: "UNKNOWN", reason: "Enumeration requires a compatible router adapter or authorized NAT-PMP/PCP probe" },
    publicAccess: { state: "EXTERNAL_CHECK_REQUIRED", reason: "LAN-side observation cannot prove Internet reachability" }
  };
}
function severityFor(port: number): string { return port === 23 ? "CRITICAL" : port === 7547 ? "HIGH" : port === 80 || port === 8080 ? "MEDIUM" : "INFO"; }
function discoverSsdp(): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4"); const responses: string[] = [];
    const timer = setTimeout(() => { socket.close(); resolve({ state: responses.length ? "DETECTED" : "NOT_DETECTED", responses }); }, 1_500);
    socket.on("message", (message: Buffer) => responses.push(message.toString("utf8").slice(0, 8_192)));
    socket.on("error", () => { clearTimeout(timer); socket.close(); resolve({ state: "UNKNOWN", reason: "SSDP socket unavailable" }); });
    socket.send(Buffer.from('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 1\r\nST: ssdp:all\r\n\r\n'), 1900, "239.255.255.250");
  });
}
