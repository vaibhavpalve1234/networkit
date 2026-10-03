export interface UdpPacket { srcPort: number; dstPort: number; payloadOffset: number; }
export function parseUdp(packet: Buffer): UdpPacket | undefined { if (packet.length < 8) return undefined; return { srcPort: packet.readUInt16BE(0), dstPort: packet.readUInt16BE(2), payloadOffset: 8 }; }
