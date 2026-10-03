import type { FindingStore, SecurityFinding } from "../types";
export class InMemoryFindingStore implements FindingStore {
  private readonly findings: SecurityFinding[] = [];
  constructor(private readonly capacity = 10_000) {}
  async add(finding: SecurityFinding): Promise<void> { this.findings.push(finding); if (this.findings.length > this.capacity) this.findings.splice(0, this.findings.length - this.capacity); }
  async getRecent(limit: number): Promise<SecurityFinding[]> { return this.findings.slice(-Math.max(0, limit)).reverse(); }
  async getByHost(ip: string): Promise<SecurityFinding[]> { return this.findings.filter((finding) => finding.sourceIp === ip || finding.destinationIp === ip); }
  async clear(): Promise<void> { this.findings.length = 0; }
}
