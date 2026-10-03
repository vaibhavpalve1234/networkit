# Networkit security sensor — Phases 1–2

This is a **network security monitoring / IDS foundation**, not a malware
verdict engine. It decodes captured Ethernet frames into ARP, IPv4, IPv6, TCP,
UDP, and ICMP metadata. It currently detects a changed IP-to-MAC mapping as an
ARP spoofing *indicator*. Legitimate DHCP renewal, failover, router replacement,
and virtualized networking can cause the same observation; repeated gratuitous
replies, gateway changes, and endpoint telemetry would increase confidence.

## Capture implementation and setup

The `PcapCommandCapture` consumes actual classic-libpcap byte streams from a
child process; it does not fabricate capture data. On Linux/macOS install
`tcpdump` (libpcap) and grant the least capture privilege available. On Windows,
install **Npcap** and Wireshark's `dumpcap`; `dumpcap -P` requests classic PCAP
output. Npcap alone provides the driver but not a maintained Node packet-capture
binding, so invoking `dumpcap` is the reliable cross-platform boundary. Capture
only interfaces and networks you are authorized to monitor.

```bash
# Linux/RHEL
sudo dnf install tcpdump libpcap
PACKET_CAPTURE_INTERFACE=eth0 npm run cli -- security live

# macOS (run according to local capture permissions)
brew install tcpdump
PACKET_CAPTURE_INTERFACE=en0 npm run cli -- security live

# Windows PowerShell: install Npcap + Wireshark/dumpcap, then use the adapter index/name
$env:PACKET_CAPTURE_INTERFACE='1'; npm run cli -- security live

# Analyze an existing classic-PCAP file without live privileges
npm run cli -- security scan ./authorized-capture.pcap
```

`security live` requires the configured external capture command and leaves the
process running. `security scan` is deterministic offline ingestion. Environment
limits: `MAX_PACKET_BYTES` (64–1,048,576; default 65,535), `ARP_ENTRY_TTL_MS`,
and `MAX_ARP_ENTRIES`. Oversized, truncated, unsupported, and fragmented frames
are discarded or retained only as safe metadata; payloads are bounded.

## Next phases

DNS/HTTP/TLS parsers will consume `PacketInfo.payload` and attach protocol
metadata. Payload signatures, flows, reputation, correlation, and a protected
API remain future phases. TLS packet payload is encrypted; a sensor can inspect
handshake metadata only unless an explicitly authorized TLS inspection point or
endpoint telemetry is configured. Production deployments should send Suricata
and Zeek evidence into Node.js for correlation/API/storage rather than attempt
to reimplement their mature capture and protocol engines in JavaScript.
