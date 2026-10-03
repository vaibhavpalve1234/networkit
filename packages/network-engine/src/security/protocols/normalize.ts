import { parseArp } from "./arp"; import { parseEthernet } from "./ethernet"; import { parseIcmp } from "./icmp"; import { parseIpv4 } from "./ipv4"; import { parseIpv6 } from "./ipv6"; import { parseTcp } from "./tcp"; import { parseUdp } from "./udp"; import type { PacketInfo } from "../types";
export function normalizePacket(frame: Buffer, timestamp: number, maxPayloadBytes: number, interfaceName?: string): PacketInfo | undefined {
  const ethernet = parseEthernet(frame); if (!ethernet) return undefined; const base: PacketInfo = { timestamp, interface: interfaceName, srcMac: ethernet.srcMac, dstMac: ethernet.dstMac, etherType: ethernet.etherType, protocol: "UNKNOWN", packetLength: frame.length, metadata: {} }; const layer = frame.subarray(ethernet.payloadOffset);
  if (ethernet.etherType === 0x0806) { const arp = parseArp(layer); return arp ? { ...base, protocol: "ARP", srcIp: arp.senderIp, dstIp: arp.targetIp, metadata: { arp } } : base; }
  if (ethernet.etherType === 0x0800) { const ip = parseIpv4(layer); return ip ? transport(base, layer, ip.payloadOffset, ip.protocol, ip.srcIp, ip.dstIp, ip.ttl, ip.fragmented, maxPayloadBytes) : base; }
  if (ethernet.etherType === 0x86dd) { const ip = parseIpv6(layer); return ip ? transport(base, layer, ip.payloadOffset, ip.nextHeader, ip.srcIp, ip.dstIp, ip.hopLimit, false, maxPayloadBytes) : base; }
  return base;
}
function transport(base: PacketInfo, layer: Buffer, offset: number, next: number, srcIp: string, dstIp: string, ttl: number, fragmented: boolean, max: number): PacketInfo {
  const result = { ...base, srcIp, dstIp, ttl, metadata: { fragmented } }; if (fragmented) return result;
  const payload = layer.subarray(offset); if (next === 6) { const tcp = parseTcp(payload); return tcp ? { ...result, protocol: "TCP", srcPort: tcp.srcPort, dstPort: tcp.dstPort, tcpFlags: tcp.flags, payload: payload.subarray(tcp.payloadOffset, tcp.payloadOffset + max) } : result; }
  if (next === 17) { const udp = parseUdp(payload); return udp ? { ...result, protocol: "UDP", srcPort: udp.srcPort, dstPort: udp.dstPort, payload: payload.subarray(udp.payloadOffset, udp.payloadOffset + max) } : result; }
  if (next === 1 || next === 58) { const icmp = parseIcmp(payload); return icmp ? { ...result, protocol: "ICMP", payload: payload.subarray(0, max), metadata: { fragmented, icmp } } : result; } return result;
}
