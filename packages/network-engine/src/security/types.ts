export type PacketProtocol = "ARP" | "ICMP" | "TCP" | "UDP" | "DNS" | "HTTP" | "HTTPS" | "TLS" | "UNKNOWN";
export interface PacketInfo { timestamp: number; interface?: string; srcMac?: string; dstMac?: string; etherType?: number; srcIp?: string; dstIp?: string; ipVersion?: 4 | 6; ttl?: number; protocol: PacketProtocol; srcPort?: number; dstPort?: number; tcpFlags?: string[]; packetLength: number; payload?: Buffer; metadata: Record<string, unknown>; }
export type FindingSeverity = "info" | "low" | "medium" | "high" | "critical";
export type FindingCategory = "malware" | "c2" | "scan" | "dns" | "arp" | "icmp" | "http" | "tls" | "protocol" | "anomaly" | "reputation" | "behavior" | "file";
export interface SecurityFinding { id: string; timestamp: number; severity: FindingSeverity; category: FindingCategory; title: string; description: string; sourceIp?: string; destinationIp?: string; sourcePort?: number; destinationPort?: number; confidence: number; score: number; evidence: Record<string, unknown>; tags: string[]; }
export interface CaptureOptions { interface?: string; maxPacketBytes: number; }
export interface PacketCapture { start(options: CaptureOptions, onPacket: (frame: Buffer, timestamp: number) => Promise<void>): Promise<void>; stop(): Promise<void>; }
export interface FindingStore { add(finding: SecurityFinding): Promise<void>; getRecent(limit: number): Promise<SecurityFinding[]>; getByHost(ip: string): Promise<SecurityFinding[]>; clear(): Promise<void>; }
