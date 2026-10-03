# NetKit

NetKit is being built as an authorized-network monitoring, security, and
protection platform. This initial release implements **Phase 1**: a strict
TypeScript local network engine and a compatible CLI foundation. It deliberately
does not represent unavailable router, DHCP, Wi-Fi, NAT, or enforcement
capabilities as functional.

## Architecture and roadmap

The selected monorepo design keeps privileged local collection in the agent and
network-engine packages while a future API provides multi-tenant workspaces,
RBAC, audit trails, events, findings, entitlements, and real-time views. The
full target architecture, schema relationships, security model, and Phase 1
boundary are documented in [Architecture](docs/Architecture.md).

Future storage entities are `users`, `workspaces`, `workspace_members`,
`subscriptions`, `network_entitlements`, `networks`, `network_agents`,
`devices`, `device_observations`, `device_services`, `events`,
`security_findings`, `finding_comments`, `network_policies`,
`notification_preferences`, and append-only `audit_logs`. PostgreSQL migrations
will be introduced with the central API in Phase 2; no migration is needed in
Phase 1.

## Phase 1 implementation

`packages/network-engine` contains reusable, OS-aware primitives for:

- local private IPv4 interface and CIDR discovery;
- private-target validation that prevents direct public IPv4 scanning;
- ping, bounded TCP port checks, service naming, DNS lookup/benchmark,
  traceroute, DHCP lease inspection, Wi-Fi command integration, router service
  checks/SSDP discovery, and local ARP-cache discovery;
- typed results with explicit supported/unavailable states.

`apps/cli` exposes the engine. Existing project files were not available in the
repository (only the initial Git placeholder existed), so there was no scanner
logic to move or replace.

## Install, validate, and run

```bash
npm install
npm run check
npm test
npm run cli -- health                 # gateway/internet/DNS/captive health
npm run cli -- scan                   # bounded local CIDR discovery + snapshot diff
npm run cli -- ports 192.168.1.1 22,80,443
npm run cli -- services 192.168.1.1
npm run cli -- dnsbench
npm run cli -- dhcp
npm run cli -- wifi
npm run cli -- router
```

Use this software only on networks you own or are explicitly authorized to
administer. Commands that contact a target accept only RFC1918 IPv4 addresses.
ARP discovery reads the local OS cache and does not actively sweep a network.

## Interfaces that protect against fake functionality

Phase 1 returns `supported: false` whenever an OS tool, interface, gateway, or
router capability is unavailable. It also reserves platform commands such as
`monitor`, `events`, `trust`, `block`, and `report` for later phases. Every
future router adapter will declare capabilities (for example `blockDevice`,
`upnp`, or `bandwidthLimit`), and enforcement will only be offered after a
configured adapter confirms it.
LAN observation alone will never be reported as proof of public Internet
exposure; that requires an authorized external probe.

See [Development](docs/Development.md) for the environment variable,
limitations, and command details.
