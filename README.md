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

# ADB Wireless Debugging — Quick Reference

## 1. Prerequisites

Make sure:

* Android phone has **Developer Options** enabled.
* **Wireless debugging** is enabled.
* PC and Android phone are on the same network.
* `adb.exe` is available from Android SDK Platform Tools.

Example project structure:

```text
platform-tools/
├── adb.exe
├── fastboot.exe
└── ...
```

---

# 2. Open platform-tools

### Git Bash

```bash
cd /path/to/platform-tools
```

Example:

```bash
cd ~/Desktop/platform-tools
```

Verify:

```bash
./adb.exe version
```

### Windows CMD

```cmd
cd C:\path\to\platform-tools
adb.exe version
```

### PowerShell

```powershell
cd C:\path\to\platform-tools
.\adb.exe version
```

---

# 3. Pair Android Device

On Android:

```text
Settings
  ↓
Developer Options
  ↓
Wireless debugging
  ↓
Pair device with pairing code
```

Android will display something like:

```text
IP address & Port

192.168.1.20:38273

Wi-Fi pairing code

275675
```

Run:

### Git Bash

```bash
./adb.exe pair 192.168.1.20:38273
```

### CMD

```cmd
adb.exe pair 192.168.1.20:38273
```

Enter the pairing code:

```text
275675
```

Successful result:

```text
Successfully paired to 192.168.1.20:38273
```

---

# 4. IMPORTANT: Pairing Port vs Connection Port

These are **not necessarily the same port**.

### Pairing

Used only for:

```bash
adb pair IP:PAIRING_PORT
```

Example:

```bash
./adb.exe pair 192.168.1.20:38273
```

### Connection

After pairing, go back to:

```text
Developer Options
  ↓
Wireless debugging
```

Look for:

```text
IP address & Port

192.168.1.20:41235
```

Use this port for `adb connect`:

```bash
./adb.exe connect 192.168.1.20:41235
```

Expected:

```text
connected to 192.168.1.20:41235
```

---

# 5. Verify Device

Run:

```bash
./adb.exe devices
```

Expected:

```text
List of devices attached
192.168.1.20:41235    device
```

If you see:

```text
device
```

the connection is ready.

---

# 6. Test ADB Shell

Run:

```bash
./adb.exe shell
```

You should enter the Android shell.

For example:

```bash
./adb.exe shell getprop ro.product.model
```

Get Android version:

```bash
./adb.exe shell getprop ro.build.version.release
```

Get device manufacturer:

```bash
./adb.exe shell getprop ro.product.manufacturer
```

---

# 7. Useful ADB Commands

## List devices

```bash
./adb.exe devices
```

## Detailed device information

```bash
./adb.exe shell getprop
```

## Android model

```bash
./adb.exe shell getprop ro.product.model
```

## Android version

```bash
./adb.exe shell getprop ro.build.version.release
```

## Device serial

```bash
./adb.exe get-serialno
```

## Restart ADB

```bash
./adb.exe kill-server
./adb.exe start-server
```

## Disconnect device

```bash
./adb.exe disconnect
```

## Disconnect specific device

```bash
./adb.exe disconnect 192.168.1.20:41235
```

## Connect again

```bash
./adb.exe connect 192.168.1.20:41235
```

---

# 8. Complete Flow

Every time you want to configure a new device:

```text
Android Phone
     │
     ▼
Enable Developer Options
     │
     ▼
Enable Wireless Debugging
     │
     ▼
Pair device with pairing code
     │
     ▼
adb pair IP:PAIRING_PORT
     │
     ▼
Enter 6-digit pairing code
     │
     ▼
Successfully paired
     │
     ▼
Get IP:CONNECTION_PORT
from Wireless Debugging screen
     │
     ▼
adb connect IP:CONNECTION_PORT
     │
     ▼
adb devices
     │
     ▼
device
```

---

# 9. Example

Suppose Android shows:

```text
Pairing:

192.168.1.20:38273

Pairing code:

275675
```

Run:

```bash
./adb.exe pair 192.168.1.20:38273
```

Enter:

```text
275675
```

Then Android Wireless Debugging shows:

```text
192.168.1.20:41235
```

Run:

```bash
./adb.exe connect 192.168.1.20:41235
```

Then:

```bash
./adb.exe devices
```

Result:

```text
List of devices attached
192.168.1.20:41235    device
```

Now test:

```bash
./adb.exe shell
```

---

# 10. If `adb devices` Shows `offline`

Try:

```bash
./adb.exe disconnect
./adb.exe kill-server
./adb.exe start-server
```

Then:

```bash
./adb.exe connect IP:PORT
```

Example:

```bash
./adb.exe connect 192.168.1.20:41235
```

Then:

```bash
./adb.exe devices
```

---

# 11. If Pairing Fails

If you see:

```text
error: protocol fault
```

try:

```bash
./adb.exe kill-server
./adb.exe start-server
```

Then restart Wireless Debugging on the phone.

Generate a new pairing session:

```text
Wireless debugging
    ↓
Pair device with pairing code
```

Then run:

```bash
./adb.exe pair NEW_IP:NEW_PAIRING_PORT
```

---

# 12. Check Network Connectivity

From Windows:

```cmd
ping 192.168.1.20
```

The PC and phone should normally be reachable over the same network.

If pairing/connection still fails, check:

* PC and phone are on the same Wi-Fi/network.
* VPN is disabled temporarily.
* Windows Firewall isn't blocking ADB.
* Wireless debugging is enabled.
* You're using the current pairing/connection port shown by Android.
* `adb.exe` is up to date.

---

# 13. Pairing vs Connecting — Remember This

```text
adb pair
    ↓
Trust/pair PC with Android
```

and:

```text
adb connect
    ↓
Create the actual ADB connection
```

They are **two different steps**.

Typical workflow:

```bash
./adb.exe pair 192.168.1.20:38273
```

then:

```bash
./adb.exe connect 192.168.1.20:41235
```

then:

```bash
./adb.exe devices
```

---

# 14. One-Line Test Sequence

After the device is already paired and you know the connection port:

```bash
./adb.exe connect 192.168.1.20:41235 && ./adb.exe devices
```

Then test:

```bash
./adb.exe shell getprop ro.product.model
```

---

# 15. Useful Debugging Commands

Check ADB version:

```bash
./adb.exe version
```

Check ADB server:

```bash
./adb.exe start-server
```

List devices:

```bash
./adb.exe devices -l
```

Get device serial:

```bash
./adb.exe get-serialno
```

Check Android model:

```bash
./adb.exe shell getprop ro.product.model
```

Check Android version:

```bash
./adb.exe shell getprop ro.build.version.release
```

---

# Quick Cheat Sheet

```bash
# 1. Go to platform-tools
cd /path/to/platform-tools

# 2. Check ADB
./adb.exe version

# 3. Pair
./adb.exe pair IP:PAIRING_PORT

# 4. Connect
./adb.exe connect IP:CONNECTION_PORT

# 5. Verify
./adb.exe devices

# 6. Test
./adb.exe shell

# 7. Device model
./adb.exe shell getprop ro.product.model

# 8. Android version
./adb.exe shell getprop ro.build.version.release

# 9. Disconnect
./adb.exe disconnect
```

**Remember:**

```text
PAIRING PORT ≠ necessarily CONNECTION PORT
```

Always take the current ports from the Android **Wireless debugging** screen.
