const IPV4_PARTS = 4;

export function ipv4ToInt(value: string): number {
  const parts = value.split(".");
  if (parts.length !== IPV4_PARTS || parts.some((part) => !/^\d+$/.test(part))) {
    throw new Error(`Invalid IPv4 address: ${value}`);
  }
  const octets = parts.map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) throw new Error(`Invalid IPv4 address: ${value}`);
  return (((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0;
}

export function intToIpv4(value: number): string {
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

export function isPrivateIpv4(value: string): boolean {
  try {
    const [a, b] = value.split(".").map(Number);
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  } catch {
    return false;
  }
}

export function cidrFromAddressAndNetmask(address: string, netmask: string): string {
  const addressInt = ipv4ToInt(address);
  const maskInt = ipv4ToInt(netmask);
  const binaryMask = maskInt.toString(2).padStart(32, "0");
  if (!/^1*0*$/.test(binaryMask)) throw new Error(`Non-contiguous netmask: ${netmask}`);
  const prefix = binaryMask.indexOf("0") === -1 ? 32 : binaryMask.indexOf("0");
  return `${intToIpv4(addressInt & maskInt)}/${prefix}`;
}

export function assertPrivateTarget(target: string): void {
  if (!isPrivateIpv4(target)) throw new Error("Target must be a private IPv4 address on an authorized network");
}
