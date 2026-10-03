export interface SecurityConfig { maxPacketBytes: number; arpEntryTtlMs: number; maxArpEntries: number; }
export function loadSecurityConfig(env: Record<string, string | undefined> = process.env): SecurityConfig {
  const maxPacketBytes = numberEnv(env.MAX_PACKET_BYTES, 65_535, 64, 1_048_576);
  return { maxPacketBytes, arpEntryTtlMs: numberEnv(env.ARP_ENTRY_TTL_MS, 3_600_000, 60_000, 86_400_000), maxArpEntries: numberEnv(env.MAX_ARP_ENTRIES, 10_000, 10, 100_000) };
}
function numberEnv(raw: string | undefined, fallback: number, min: number, max: number): number { const value = raw === undefined ? fallback : Number(raw); if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Configuration value must be an integer from ${min} to ${max}`); return value; }
