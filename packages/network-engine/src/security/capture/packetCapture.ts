import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { CaptureOptions, PacketCapture } from "../types";
/** Real libpcap output capture through tcpdump/dumpcap; no synthetic packets are produced. */
export class PcapCommandCapture implements PacketCapture {
  private child?: ChildProcessWithoutNullStreams; private stopped = false;
  constructor(private readonly command: "tcpdump" | "dumpcap" = process.platform === "win32" ? "dumpcap" : "tcpdump") {}
  async start(options: CaptureOptions, onPacket: (frame: Buffer, timestamp: number) => Promise<void>): Promise<void> { if (this.child) throw new Error("Capture already started"); if (!options.interface) throw new Error("PACKET_CAPTURE_INTERFACE is required for live capture"); const args = this.command === "dumpcap" ? ["-P", "-i", options.interface, "-w", "-"] : ["-U", "-n", "-i", options.interface, "-s", String(options.maxPacketBytes), "-w", "-"]; this.child = spawn(this.command, args, { stdio: ["ignore", "pipe", "pipe"] }); const decoder = new PcapStreamDecoder(options.maxPacketBytes, onPacket); this.child.stdout.on("data", (data: Buffer) => decoder.push(data)); await new Promise<void>((resolve, reject) => { this.child?.once("spawn", () => resolve()); this.child?.once("error", () => reject(new Error("Unable to start packet capture command"))); }); }
  async stop(): Promise<void> { this.stopped = true; this.child?.kill("SIGTERM"); this.child = undefined; }
}
export class PcapStreamDecoder {
  private buffer = Buffer.alloc(0); private endian: "LE" | "BE" | undefined;
  constructor(private readonly maxPacketBytes: number, private readonly onPacket: (frame: Buffer, timestamp: number) => Promise<void>) {}
  push(chunk: Buffer): void { this.buffer = Buffer.concat([this.buffer, chunk]); if (!this.endian) { if (this.buffer.length < 24) return; const magic = this.buffer.readUInt32BE(0); this.endian = magic === 0xa1b2c3d4 ? "BE" : magic === 0xd4c3b2a1 ? "LE" : undefined; if (!this.endian) throw new Error("Only classic libpcap streams are supported; configure dumpcap with -P"); this.buffer = this.buffer.subarray(24); } while (this.buffer.length >= 16) { const read = (offset: number): number => this.endian === "LE" ? this.buffer.readUInt32LE(offset) : this.buffer.readUInt32BE(offset); const seconds = read(0); const micros = read(4); const included = read(8); if (included > this.maxPacketBytes || included > 1_048_576) throw new Error("Captured packet exceeds configured safety limit"); if (this.buffer.length < 16 + included) return; const frame = this.buffer.subarray(16, 16 + included); this.buffer = this.buffer.subarray(16 + included); void this.onPacket(frame, seconds * 1_000 + Math.floor(micros / 1_000)); } }
}
