# Development (Phase 1)

## Requirements

Node.js 22+ and npm are required. Phase 1 has no runtime service dependencies.

```bash
npm install
npm run check
npm test
npm run cli -- health
```

The CLI only accepts private IPv4 targets for direct ping, port, service, and
traceroute operations. Discovery derives its CIDR from a local private IPv4
interface and caps a scan at 1,024 hosts. It is intended only for networks the
operator owns or is authorized to administer.

## Environment variables

`NETKIT_INTERFACE` optionally selects a local interface by name. No credentials
or API secrets are used in this phase.

## Known limitations

ARP data depends on OS command availability and permissions. DHCP, Wi-Fi,
router configuration, UPnP mapping enumeration, NAT-PMP/PCP enumeration, and
enforcement are reported as unavailable when no verified local implementation
exists; they are not emulated.
