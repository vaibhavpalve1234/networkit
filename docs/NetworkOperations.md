# Network operations reference

NetKit invokes only OS-native commands or direct standard-protocol probes and
reports unavailable capabilities honestly. Use it only on networks you own or
are authorized to administer.

| NetKit command | Windows | macOS | RHEL / Rocky / Alma | Notes |
|---|---|---|---|---|
| `health` | `ping`, route table | `ping`, `route` | `ping`, `ip route` | Adds a DNS lookup and a documented connectivity HTTP check. |
| `scan` | `ping`, `arp` | `ping`, `arp` | `ping`, `ip neigh` | Bounded to the selected local CIDR (maximum 1,024 hosts). Snapshot state is `~/.netkit/scan-state.json`, mode 0600. |
| `dhcp` | `ipconfig /all` | `ipconfig getpacket` | `nmcli -f DHCP4 dev show` | Passive only. An active DHCP broadcast is deliberately disabled; a future agent requires explicit policy and elevation. |
| `wifi` | `netsh wlan show networks mode=bssid` | `system_profiler SPAirPortDataType` | `nmcli ... wifi list --rescan yes` | Results depend on Wi-Fi hardware and location permissions. |
| `router` / `routervuln` | UDP SSDP + optional `upnpc` | UDP SSDP + optional `upnpc` | UDP SSDP + optional `upnpc` | Checks gateway TCP admin services and discovers SSDP. It never labels public exposure from LAN-only observation. |

Install optional tools yourself using your organization’s approved process:
Nmap/Npcap on Windows, Homebrew `miniupnpc` on macOS, and `miniupnpc` from EPEL
on RHEL-family systems. NetKit does not install packages, run privileged
commands, or invoke Nmap scripts automatically.

## Router interpretation

An SSDP response means only that a local device answered discovery. `upnpc -l`
output is preserved as tool output because routers can refuse mapping listing;
that is **not** evidence that no mappings exist. NAT-PMP/PCP remains `UNKNOWN`
until a configured capability-declared adapter implements it. Public access is
always `EXTERNAL_CHECK_REQUIRED` unless an authorized external probe reports a
result.

## Safety controls

Direct ping, TCP connection, and traceroute commands reject non-RFC1918 target
addresses. The only intentional public contacts are health (`1.1.1.1`, DNS,
and the connectivity check) and `dnsbench` public resolvers; the download speed
test only runs when explicitly requested and defaults to 5 MB (adjust with
`NETKIT_SPEED_BYTES`, maximum 50 MB). Set `NETKIT_INTERFACE` to select a local
interface.
