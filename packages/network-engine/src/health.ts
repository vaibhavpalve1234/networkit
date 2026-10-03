import { lookup } from "node:dns/promises";
import { getDefaultGateway } from "./system";
import type { LocalNetworkEngine } from "./engine";

export async function getHealth(engine: LocalNetworkEngine): Promise<Record<string, unknown>> {
  const gateway = await getDefaultGateway();
  const [gatewayPing, internetPing, dns] = await Promise.all([
    gateway ? engine.ping(gateway) : Promise.resolve({ supported: false, reason: "No default gateway found" }),
    engine.ping("1.1.1.1", true),
    lookup("example.com").then(() => ({ supported: true })).catch(() => ({ supported: true, reachable: false }))
  ]);
  const captivePortal = await fetch("http://connectivitycheck.gstatic.com/generate_204", { signal: AbortSignal.timeout(5_000), redirect: "manual" })
    .then((response) => ({ supported: true, status: response.status, state: response.status === 204 ? "CLEAR" : "POSSIBLE_CAPTIVE_PORTAL" }))
    .catch(() => ({ supported: false, reason: "Connectivity check unavailable" }));
  return { interface: engine.getLocalInterface(process.env.NETKIT_INTERFACE), gateway, gatewayPing, internetPing, dns, captivePortal };
}
