export interface NetworkInterfaceInfo {
  name: string;
  address: string;
  netmask: string;
  cidr: string;
}

export interface CommandResult {
  supported: boolean;
  reason?: string;
}

export interface PingResult extends CommandResult {
  reachable?: boolean;
  latencyMs?: number;
}

export interface PortResult {
  port: number;
  protocol: "tcp";
  service: string;
  state: "open" | "closed";
  confidence: number;
}

export interface DiscoveredDevice {
  ip: string;
  mac?: string;
  hostname?: string;
  source: "arp";
}

export interface NetworkEngine {
  getLocalInterface(preferredName?: string): NetworkInterfaceInfo;
  ping(target: string, allowInternetProbe?: boolean): Promise<PingResult>;
  checkTcpPorts(target: string, ports: readonly number[], timeoutMs?: number): Promise<PortResult[]>;
  discoverArp(): Promise<DiscoveredDevice[]>;
  lookupDns(hostname: string): Promise<string[]>;
  traceroute(target: string): Promise<CommandResult & { output?: string }>;
}
