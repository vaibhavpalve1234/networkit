# NetKit architecture

## Target architecture

NetKit is a TypeScript monorepo.  It separates local, privileged network work
from tenant-aware platform concerns so a central service never performs an
unscoped scan on behalf of an arbitrary request.

```
apps/
  api/       Fastify REST/SSE control plane (future phases)
  web/       React dashboard (future phases)
  agent/     authenticated per-network collector (future phases)
  cli/       local operator CLI (Phase 1)
packages/
  network-engine/       safe local discovery primitives (Phase 1)
  security-engine/      findings and scoring (future)
  router-adapters/      capability-declared enforcement (future)
  policy-engine/        approval and protection policy evaluation (future)
  notification-engine/  delivery providers (future)
  search-engine/        workspace-scoped search (future)
  insights-engine/      cross-network aggregation (future)
  shared/               IDs, schemas, error contracts (future)
```

PostgreSQL is the system of record; Redis is reserved for locks, queues,
sessions, and short-lived state. Agents authenticate to exactly one workspace
and one network; telemetry is scope-checked before persistence. A router
adapter must declare each capability, and unsupported enforcement returns an
explicit unsupported result rather than a simulated success.

## Data model (planned)

`users --< workspace_members >-- workspaces --< networks --< devices`

`workspaces --1 subscriptions --< network_entitlements` controls included plus
add-on network capacity. `networks --< network_agents`, `devices --<
device_observations`, `devices --< device_services`, and `networks --< events`
capture monitored state. Security collaboration uses `security_findings --<
finding_comments`; `audit_logs` is append-only. Tenant tables have a
`workspace_id` index, and device observations additionally index network, MAC,
IP, and observation time.

## Control-plane security (planned)

Versioned `/api/v1` endpoints will use validated input, server-side workspace
membership and permissions, rotating secure sessions, request IDs, structured
logging, rate limits, and append-only audit records. Every resource lookup will
be scoped by the workspace derived from the authenticated identity—not values
supplied by the client. Router secrets will be encrypted through a secret-store
abstraction; no secret is accepted in logs or responses.

## Phase 1 boundary

Phase 1 delivers a reusable, local network engine and CLI. It has no central
database, authentication, router enforcement, or claim of UPnP/NAT mapping
enumeration support. It can perform bounded local discovery, health checks,
native DHCP/Wi-Fi inspection, SSDP discovery, and router TCP service checks.
Those observations are distinct from capability-declared router management,
which requires later platform services and a configured adapter.
