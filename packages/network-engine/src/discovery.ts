import { hostsInCidr } from "./system";
import type { DiscoveredDevice } from "./types";
import type { LocalNetworkEngine } from "./engine";

export async function discoverLocalNetwork(engine: LocalNetworkEngine): Promise<DiscoveredDevice[]> {
  const local = engine.getLocalInterface(process.env.NETKIT_INTERFACE);
  const hosts = hostsInCidr(local.cidr);
  // Bounded concurrency avoids both resource exhaustion and a packet burst.
  for (let offset = 0; offset < hosts.length; offset += 16) await Promise.all(hosts.slice(offset, offset + 16).map((host) => engine.ping(host)));
  return engine.discoverArp();
}
