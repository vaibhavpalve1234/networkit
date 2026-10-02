const SERVICES: Record<number, string> = {
  21: "ftp", 22: "ssh", 23: "telnet", 53: "dns", 67: "dhcp", 80: "http", 443: "https",
  445: "smb", 554: "rtsp", 1883: "mqtt", 1900: "upnp", 3389: "rdp", 5037: "adb", 7547: "tr-069",
  8080: "http-alt", 8443: "https-alt"
};

export const DEFAULT_SERVICE_PORTS = Object.freeze(Object.keys(SERVICES).map(Number));
export function serviceForPort(port: number): string { return SERVICES[port] ?? "unknown"; }
