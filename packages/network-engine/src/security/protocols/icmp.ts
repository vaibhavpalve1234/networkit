export interface IcmpPacket { type: number; code: number; }
export function parseIcmp(packet: Buffer): IcmpPacket | undefined { return packet.length < 2 ? undefined : { type: packet[0], code: packet[1] }; }
