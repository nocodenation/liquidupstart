---
name: liquid
description: Liquid flow design rules, construction patterns, visual layout standards, and custom processor / NAR packaging for this environment. TRIGGER when user designs or refactors a Liquid flow, lays out processors/funnels/connections, configures Controller Services, or builds and deploys a custom processor or NAR. For raw API mechanics (auth token, CRUD calls, ingress URLs) use the **liquid-api** skill instead.
---

# Liquid Development Rules

These rules govern all Liquid development in this environment. Enforce them without exception.

This skill covers **how to design and build flows well** — change safety, construction
patterns, termination strategy, visual layout, and custom-processor packaging. The
sibling **liquid-api** skill covers the **API transport** (proxy + `Host:` header, bearer
token, ingress URLs, SSL Context Service properties, links you give the user). When a
rule here needs an API call, follow the connection and auth conventions from **liquid-api**
— never invent endpoints or credentials.

---

## 1. Flow Change Management

### 1.1 Backup Before Changes (MOST CRITICAL RULE)
Before making ANY changes to a flow:
1. Create a backup subdirectory (if not exists)
2. **Save all component placements to a JSON file on disk** (processors, funnels, relationships, ports) BEFORE the change — not just in-memory. Use a timestamped filename (e.g., `/tmp/nifi_backup_YYYYMMDD_HHMMSS.json`)
3. Apply the change
4. Record all component placements AFTER the change
5. Record a timestamp for the change

This safety net allows reverting to any point in time. **In-memory capture is NOT sufficient** — if the script fails or the change is wrong, positions must be recoverable from disk.

### 1.2 Confirm Scope Before Batch Operations
Before applying a batch fix to multiple components (e.g., repositioning all funnels, updating all processor properties), **verify with the user which specific components need fixing** rather than assuming all are wrong. A diagnostic showing "24 components off by 26px" may mean 23 are correct and 1 is wrong — not that all 24 need adjustment. When in doubt, list the candidates and ask before applying.

---

## 2. API Strategy

### 2.1 Direct API — No nipyapi
- **NEVER use `nipyapi`** — proven unreliable for revision management and complex connections
- **ALWAYS use the Liquid REST API directly** (curl, or Python `requests`)

### 2.2 API Configuration — use the liquid-api skill
There is **one** Liquid instance in this environment, reached **only** through the nginx
proxy. The full connection contract — endpoint, `Host:` header, self-signed cert, and
bearer-token auth — lives in the **liquid-api** skill; follow it exactly and do not invent
hostnames, ports, or credentials.

In short:
- **Endpoint**: `https://proxy:${SYSTEM_HTTPS_PORT}/nifi-api` (resolve the port with
  `echo $SYSTEM_HTTPS_PORT` — never hard-code it)
- **Routing header**: `-H "Host: liquid.localhost:${SYSTEM_HTTPS_PORT}"` — the
  `X.localhost` name does not resolve in-container (see the main instructions' **URL rule**)
- **TLS**: self-signed cert → always pass `-k` / `--insecure`. There is **no** mTLS,
  client certificate, or `--tls-max` requirement here — that was a different environment.
- **Auth**: acquire a Bearer token via `POST /nifi-api/access/token` using
  `$LIQUID_USERNAME` / `$LIQUID_PASSWORD` (already injected — never ask the user). Send it as
  `Authorization: Bearer <token>` on every call. Tokens last 12 h; on `401`, regenerate.

```bash
HTTPS_PORT=$(echo $SYSTEM_HTTPS_PORT)
LIQUID_TOKEN=$(curl -sk -X POST https://proxy:$HTTPS_PORT/nifi-api/access/token \
  -H "Host: liquid.localhost:$HTTPS_PORT" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "username=$LIQUID_USERNAME" \
  --data-urlencode "password=$LIQUID_PASSWORD")

curl -sk https://proxy:$HTTPS_PORT/nifi-api/flow/status \
  -H "Host: liquid.localhost:$HTTPS_PORT" \
  -H "Authorization: Bearer $LIQUID_TOKEN"
```

When a processor must call **another** service (PostgREST, Nextcloud, OpenProject…), it
also goes through the proxy with a `Host:` dynamic property — see the **liquid-api** skill's
*Connecting Liquid to other services* section. Never point a processor at a bare container
name or an external production host.

### 2.3 Revision Control (Required)
- **ALWAYS** fetch the latest component `revision` (`version`) immediately before any `PUT` update
- Never cache or reuse old revision values — stale revisions cause `409 Conflict` errors

---

## 3. Flow Construction Rules

### 3.1 Idempotency
Check for existing components (by Name or ID) before creating — never create duplicates.

### 3.2 Controller Services
- Check for existing services of same type before creating new ones
- Explicitly link processors to a specific Controller Service ID
- Run cleanup to remove unused/duplicate services
- Verify service state (ENABLED/DISABLED) before use

### 3.3 Relationship Names
Relationship names are case-sensitive. Names with spaces (e.g., `"No Retry"`, `"No Match"`) must be correctly quoted/encoded in JSON payloads.

### 3.4 Verify Supported Relationships Before Wiring (CRITICAL)
Before connecting a relationship from a processor, **always verify** that the processor type actually supports that relationship. Query the processor's type definition via the API or documentation. Not all processors have `failure` — e.g., `HandleHttpRequest` does NOT have a `failure` relationship. Connecting a non-existent relationship creates an invalid flow with wasted funnels.

### 3.5 API-First Property Mapping (CRITICAL)
Before setting ANY property on a processor or controller service:
1. **GET** the component's property descriptors from the Liquid API
2. **Match** each provided config value (from the user's request, an environment variable, or a config source) to a native property by comparing against the descriptor list
3. **Never duplicate** a native property by adding it under a slightly different name — this creates a superfluous dynamic property that may invalidate the component
4. **User-defined properties**: Some components support user-defined (dynamic) properties — check if the component's descriptor indicates support for additional properties (e.g., via `supportsDynamicProperties`). Only add custom properties when the component explicitly supports them. Components like `UpdateAttribute` support dynamic properties; most others do not.
5. If a provided value cannot be confidently matched to a native property, **fail loudly** or ask the user rather than guessing
6. **Never set a property to an explicit empty string** unless the user or config source explicitly provides that value. An explicit empty string (`""`) differs from leaving a property unset (`null`) — some processors treat empty string as invalid while null means "use default". Only set values that are explicitly provided.

### 3.6 SSL Context Service — one shared service
This environment has a **single** keystore/truststore pair (a wildcard cert covering
`liquid.localhost` and its ingress subdomains), mounted read-only at `/certs`. Unlike
multi-domain setups, you do **not** create a separate SSL context per ingress domain.

When a processor needs TLS (`HandleHttpRequest`, `ListenHTTP` with TLS, `InvokeHTTP` over
HTTPS), **first list controller services and reuse the existing
`StandardRestrictedSSLContextService`** if one is present. Only create one if none exists,
using the exact property values from the **liquid-api** skill's *SSL Context Service*
section:

| Property | Value |
|---|---|
| Keystore Filename | `/certs/liquid.keystore.p12` |
| Keystore Password | value of `$LIQUID_KEYSTORE_PASSWORD` |
| Key Password (`key-password`) | value of `$LIQUID_KEYSTORE_PASSWORD` |
| Keystore Type | `PKCS12` |
| Truststore Filename | `/certs/liquid.truststore.p12` |
| Truststore Password | value of `$LIQUID_KEYSTORE_PASSWORD` |
| Truststore Type | `PKCS12` |
| TLS Protocol | `TLS` |

`$LIQUID_KEYSTORE_PASSWORD` is injected into the environment — read it with
`echo $LIQUID_KEYSTORE_PASSWORD`, never ask the user. The native API property for the key
password is `key-password`, **not** `Key Password`. Enable the service after creating it.

### 3.7 HTTP Context Map Per Ingress
Every `HandleHttpRequest` processor and its associated `HandleHttpResponse` processors MUST share a **dedicated named HTTP Context Map** (`StandardHttpContextMap`). Name it after the ingress it serves — here that means the ingress **port** (e.g., `"ingress-8900"`), since ingresses are addressed as `https://{port}.liquid.localhost:HTTPS_PORT` (ports 8900–8999). All `HandleHttpResponse` processors in the same flow must reference the same context map as their `HandleHttpRequest`.

### 3.8 FetchFile Attribute Setup (Without ListFile)
When using `FetchFile` without a preceding `ListFile`, always insert an `UpdateAttribute` processor **BEFORE** `FetchFile` to set `absolute.path` and `filename`. Then configure FetchFile's "File to Fetch" as `${absolute.path}/${filename}`. This mirrors the attributes that `ListFile` would normally produce, ensuring `filename` is available to all downstream processors (e.g., PutEmail attachment name, PutFile output). Avoids hardcoding full file paths in FetchFile properties.

### 3.9 Content-Type Mapping for Static Assets
When serving static assets via Liquid (e.g., through `RouteOnAttribute` + `UpdateAttribute`), maintain a **single** `mime.type` expression covering ALL served file extensions (`.ico`, `.gif`, `.png`, `.jpg`, `.css`, `.js`, etc.). When adding support for a new file type, update the existing mime.type expression rather than creating a separate route or processor.

### 3.10 User-Data in Filenames — Sanitization
When using user-provided values (e.g., email addresses) in filenames, always sanitize with Liquid EL `replaceAll` to remove or replace characters that are invalid or problematic in file paths. **Double escaping required**: Liquid EL unescapes `\\` → `\` before passing to Java regex, so a literal backslash in the regex needs **4 backslashes** in the stored property value. Example: `${form.email:replaceAll("[/\\\\\\\\]", "_")}` — Liquid EL reduces to `[/\\]`, Java regex matches `/` or `\`.

---

## 4. Error Handling & Termination Strategy

### 4.1 No Auto-Termination (Strict Rule)
**NEVER** auto-terminate relationships in processor configuration. All relationships (`failure`, `retry`, `no retry`, `original`, `expired`, `success`) must be explicitly connected to dedicated funnels.

### 4.1a HandleHttpResponse Success (Required)
`HandleHttpResponse` processors ALWAYS have a `success` relationship that MUST be connected to a terminal funnel below the processor. Without this connection, the processor is invalid. This is easy to miss because the success FlowFile carries no useful data, but Liquid requires it to be wired.

### 4.2 Individual Funnels (Required)
- **ALWAYS** create a **dedicated individual funnel** for EACH terminating relationship
- **NEVER** connect multiple terminating relationships to a single shared funnel
- Example: If a processor has `Failure` and `Retry`, create two separate funnels

### 4.3 Queue Expiration
- Set `flowFileExpiration` to **`100 days`** on ALL terminating connections (funnels with only incoming connections)
- Apply only if expiration is currently `"0 sec"`
- User-specified expiration overrides this default

### 4.4 Unconnected Funnels
Remove any funnel with no incoming or outgoing connections during cleanup.

---

## 5. Visual Layout Standards

All placement rules are derived from **relative component proportions**, not absolute pixel values. The funnel (1F = 48 units) is the base unit.

| Component | Width | Height |
|---|---|---|
| Funnel | 1F | 1F |
| Connection Label | ~5.7F | ~1.5F |
| Processor (core) | ~7.3F | ~3.7F |
| Processor (visual incl. stats) | ~11F | ~4.1F |
| Process Group | ~12F | ~5.5F |

**Key ratio**: Labels are ~4x wider than tall → vertical spacing can be compact; horizontal spacing must be generous.

### 5.1 Intermediary Funnels Everywhere
**Every connection between two components MUST pass through an intermediary funnel.** No direct processor-to-processor, port-to-processor, or processor-to-port connections. Exception: self-loops (§5.9).

```
Component A → [label] → Funnel → [label] → Component B
```

### 5.2 Flow Direction & Column Alignment
- Primary flow: **top-down vertical**
- All happy-path processors share the **same X coordinate** — zero horizontal drift
- Each branch column has its own fixed X; all its processors align vertically
- Forks: branch LEFT for errors, RIGHT for alternative success paths, then continue vertically per branch

### 5.3 Funnel Centering
The intermediary funnel sits at the **MIDPOINT** between its two adjacent components:
- **X**: centered under processor core: `funnel_x = proc_x + (PROC_CORE_W - FUNNEL_W) / 2`
- **Y**: centered in the vertical gap: `funnel_y = source_bottom + (dest_top - source_bottom - FUNNEL_H) / 2`

### 5.4 Vertical Spacing (Compact)
The gap between two processors must fit: label + padding + funnel + padding + label = ~5F minimum.
- Min proc-to-proc (top-to-top): PROC_H + 5F ≈ 8.7F
- Recommended: 9–10F for readability

### 5.5 Processor Spatial Zones (Four-Zone Model)
Each processor owns four directional zones:

```
              [IN funnel]
                  |
 Failure ←── PROCESSOR ──→ Self-loop
 No Retry ←─┘     |            (Retry)
 Original ←─┘     |
              [OUT funnel]
             (happy path)
```

| Zone | Direction | Content |
|---|---|---|
| TOP | Above | Incoming intermediary funnel |
| LEFT | Left | Terminal failure/error funnels (stacked vertically) |
| RIGHT | Right | Self-loop connections (with bends) |
| BOTTOM | Below | Outgoing intermediary funnel (happy path) |

### 5.6 Failure Funnel Placement (CRITICAL — Symmetric Gap Rule)
The gap between the processor edge and the failure funnel must equal **exactly one label width (5.7F = 274 units)** on BOTH sides. This ensures labels fit without overlap and the layout looks balanced regardless of whether funnels are placed left or right.

**Left-side placement** (default — center and right columns):
```
failure_x = proc_x - LABEL_W - FUNNEL_W      (= proc_x - 5.7F - 1F = proc_x - 322)
failure_y = proc_y + 0.8F                     (= proc_y + 38 at F=48)
```

**Right-side placement** (when left would go negative — e.g., leftmost column):
```
failure_x = proc_x + PROC_CORE_W + LABEL_W   (= proc_x + 7.3F + 5.7F = proc_x + 624)
failure_y = proc_y + 0.8F
```

**Important**: The Y offset is exactly **0.8F** (38 units), NOT `(PROC_H - FUNNEL_H) / 2` (which would be 65 units). The 0.8F offset places the funnel visually aligned with the processor's connection anchor point, not geometrically centered on the processor body.

**Stacking** multiple failure funnels vertically (1.2F spacing each):
- Order top-to-bottom: `failure` → `no retry` → `not.found` → `original` → `permission.denied`

### 5.7 Branch Column Spacing (Content-Dependent)
Horizontal connections carry labels (~5.7F wide). Min edge gap between columns = LABEL_W + 2F ≈ 7.7F. Increase when multiple horizontal connections exist to avoid crossings.

### 5.8 Clone-Via-Funnel Pattern (Explicit FlowFile Cloning)
When the same FlowFile needs to be sent to multiple independent paths (e.g., store + email + HTTP response), use a **dedicated clone funnel**:
1. Connect the source processor to a single funnel via one relationship
2. Connect the funnel directly to each target processor (Liquid clones the FlowFile automatically)
3. Place the clone funnel directly below the source processor in the same column

**NEVER** reuse the same route name multiple times from one processor to simulate cloning — this obscures the intent and makes the flow harder to read. The clone funnel makes the cloning explicit and visually obvious.

```
Processor --valid--> Clone Funnel ---> Target A
                         |-----------> Target B
                         |-----------> Target C
```

### 5.8a Fan-Out Pattern (Multiple Named Routes)
When a processor has multiple named routes (e.g., RouteOnAttribute):
- One funnel per route, spread **horizontally** below the processor
- Spacing between funnels ≥ LABEL_W + FUNNEL_W ≈ 6.7F
- All fan-out funnels share the same Y
- Order left-to-right: unmatched/error → primary routes → less common

### 5.9 Self-Loop Connections (2 Bends, Opposite or Below Stack)
Self-loops (e.g., `Retry` on InvokeHTTP) use exactly **2 bend points**. Placement depends on where the side-stack (§5.9a) is:

**Stack on the same side as the natural loop direction (RIGHT):**
Place the loop **below the stack** to avoid crossing stacked funnels:
- Bend X: `proc_x + PROC_VISUAL_W + 1.5F`
- Bend Y: **below the lowest funnel** — `stack_bottom_y + FUNNEL_H` to `+ FUNNEL_H + 1.5F`

**Stack on the opposite side (LEFT):**
Place the loop at the **compact bottom-right corner** (the right side is empty):
- Bend 1: `(proc_x + PROC_VISUAL_W + 1.5F, proc_y + PROC_H - 1F)`
- Bend 2: `(proc_x + PROC_VISUAL_W + 1.5F, proc_y + PROC_H + 1.5F)`

- **No funnel** — this is the one exception to §5.1

### 5.9a Terminal Funnel Stacking Rule
**Terminating funnels** (dead-end relationships like `Response`, terminal `Original`) MUST be stacked with the existing failure/error funnels on the LEFT or RIGHT side of the processor, using the same 1.2F vertical spacing. **Non-terminating funnels** (relationships that continue to the next processor, e.g., `Original` feeding into a PutEmail) are placed BELOW the processor on the vertical axis. This keeps side-stacks compact and avoids horizontal label overlaps between terminal funnels.

### 5.10 Terminal (Dead-End) Funnels
- **Terminal success**: ALWAYS placed **directly below** the processor, centered on the processor's X: `funnel_x = proc_x + (PROC_CORE_W - FUNNEL_W) / 2`, `funnel_y = proc_y + PROC_H + 2F`. Success terminal funnels go at the bottom because they could potentially serve as a continuation point for the flow downward. **NEVER** place success terminal funnels to the left — left placement is reserved exclusively for failure/error funnels.
- **Terminal failure**: at failure X per §5.6 (symmetric gap = one label width from processor edge). Failure/dead-end funnels go to the **left** (or right if left would be negative, e.g. leftmost column).
- **NEVER** place terminal funnels above a processor — this violates the top-to-bottom flow direction.

### 5.10a Intermediary Funnel Flow Direction
Incoming intermediary funnels (funnels that feed INTO a processor) MUST be placed **above** the processor they feed. Outgoing intermediary funnels MUST be placed **below** the processor they exit from. All funnels along the flow path must follow the top-to-bottom direction. Violating this creates visual confusion and can lead to flow crossings.

### 5.11 Cross-Column & Long-Distance Connections
- Long-distance connections still go through intermediary funnels as **waypoints**
- Cross-column funnel sits at the **destination column's funnel lane**
- Multiple sources → same destination: each source gets its own funnel, stacked along destination's funnel lane
- Diagonal connections OK if they don't cross other lines

### 5.11a Lane Non-Blocking Rule
Cross-column connections (forks from one column to another) MUST NEVER visually block the lane of an adjacent column. When a connection routes horizontally from column A to column C, it must not prevent column B from extending downward. Ensure the target column has enough horizontal clearance so processors in intermediate columns retain free vertical lanes below them.

### 5.12 No-Crossing Guarantee
Connection lines MUST NEVER cross each other. This is achieved by: single-column main flow, failure funnels left, self-loops right, sufficient column spacing, intermediary funnels everywhere. If crossings occur, **increase column spacing** — never compromise. Specifically:
- Verify that no horizontal connection path crosses a vertical connection path
- When placing processors in multiple columns, check that fan-out connections from a central processor (e.g., RouteOnAttribute) spread outward without crossing each other
- If columns are too close, widen the gap rather than routing connections over/under other flows

### 5.13 Process Groups & Ports
- Sibling PGs: horizontal row below routing funnels
- Input Port → intermediary funnel → first processor (same pattern)
- Output ports → intermediary funnels → fan out to destination columns

---

## 6. Custom Processor Development

### 6.1 PutEmail Content Source (Ask Before Configuring)
When configuring a PutEmail processor, **always ask the user** whether the email body should come from:
- **FlowFile content** (`email-ff-content-as-message = true`) — use when upstream processors (e.g., ReplaceText) build the email body as FlowFile content
- **Static `Message` property** — use for simple inline text
- **Neither** (FlowFile content reserved for attachment) — when `Attach File = true`, the FlowFile content becomes the attachment, so the message must come from the `Message` property or be empty

Do not assume one approach — the choice depends on what the FlowFile content carries at that point in the flow.

### 6.2 InvokeHTTP Retry Loop
- The `Retry` relationship on `InvokeHTTP` must be configured as a **self-loop** (connected to itself), unless explicitly configured otherwise
- Use the 2-bends rule (§5.9) for this loop — routes to the RIGHT of the processor
- The `No Retry` relationship connects to a dedicated funnel on the LEFT (§5.6)

### 6.3 Processor Registration — Service Descriptor (CRITICAL)
Every custom Liquid processor MUST be registered in the SPI descriptor or it will not appear in the Liquid UI.

**File**: `src/main/resources/META-INF/services/org.apache.nifi.processor.Processor`

Each line = fully-qualified class name:
```
org.nocodenation.nifi.MyProcessor
org.nocodenation.nifi.AnotherProcessor
```

**Debugging:**
```bash
# Verify processor is in compiled JAR
unzip -p processors.jar META-INF/services/org.apache.nifi.processor.Processor

# Check Liquid logs for discovery
grep "MyProcessor" nifi-app.log
```

### 6.4 Deploying a NAR — the `nar_extensions` volume (how it works here)
**Do NOT copy NARs into `lib/` by hand.** This environment has a dedicated drop
directory wired into the container's startup:

- Host path: `./volumes/nar_extensions`
- Container path: `/opt/nifi/nifi-current/nar_extensions`

On every container start the entrypoint copies all `*.nar` from `nar_extensions/` into
`/opt/nifi/nifi-current/lib/` before launching Liquid. So the deploy procedure is:

1. Build the NAR(s).
2. Place the `.nar` file(s) in `./volumes/nar_extensions/`.
3. Restart the container: `docker compose restart liquid` (or `up -d --force-recreate liquid`).
4. Confirm the component appears (list controller-service / processor types via the API,
   or check the canvas).

NARs in `lib/` are loaded once at boot — adding a NAR always requires a **restart**, not
just a schema reload. (Liquid also supports hot-loading from an autoload directory, but in
this environment the `nar_extensions` + restart path is the supported mechanism.)

### 6.5 NAR Dependencies & ClassLoading (CRITICAL)
When a NAR requires parent dependencies (e.g., SSL Context Service API), ALL NARs in the dependency chain must be dropped into `nar_extensions/` together.

**Hierarchy example:**
```
nifi-standard-services-api-nar-<nifi-version>.nar
  └── my-service-api-nar-1.0.0.nar
        └── my-service-nar-1.0.0.nar
              └── my-processors-nar-1.0.0.nar
```

**Declare parent NAR in `pom.xml`** (version MUST match the Liquid version of the
`ghcr.io/nocodenation/liquid-nifi` base image — query `/nifi-api/flow/about` to confirm
the running version rather than guessing):
```xml
<dependency>
    <groupId>org.apache.nifi</groupId>
    <artifactId>nifi-standard-services-api-nar</artifactId>
    <version>2.x.x</version>  <!-- MUST match the running Liquid version -->
    <type>nar</type>
</dependency>
```

**"Ghost" implementation symptom**: Component shows as Ghost in UI → missing NAR in chain. Drop all NARs in the chain into `nar_extensions/` (service-api-nar, service-nar, processors-nar) and restart.

**Debugging:**
```bash
# Inside the container — confirm the NAR landed in lib after restart
docker compose exec nifi sh -c 'find /opt/nifi/nifi-current/lib -name "*.nar" | grep my-service'
# Class-loading / ghost errors surface in the app log
docker compose logs liquid | grep -i "classnotfound\|ghost"
```
Liquid's own logs are also under the mounted `./volumes/liquid/` repositories and the
container's `logs/` directory.

### 6.6 Python Processors (Liquid 2.x)
This Liquid (2.x) supports **native Python processors** in addition to Java NARs. Drop a
Python processor module into:

- Host path: `./volumes/python_extensions`
- Container path: `/opt/nifi/nifi-current/python_extensions`

then restart the container. Prefer a Python processor for lightweight custom logic where a
full Java NAR build would be overkill; reserve the NAR path (§6.3–6.5) for processors that
need Java libraries, custom Controller Services, or the SPI service descriptor.

---

## 7. Cleanup Operations

After any flow modification:
- Remove unused Controller Services
- Remove unconnected funnels (§4.4)
- Remove duplicate components
- Verify no auto-terminated relationships remain

---

## 8. Rule Precedence

1. **Rule 1.1 Backup** — absolute precedence
2. **Rule 4.1 No Auto-Termination** — overrides any convenience shortcut
3. **Rule 4.2 Individual Funnels** — cannot be compromised
4. **User explicit requests** — override default configurations
5. **Visual layout rules** — may be adjusted for complex flows with documentation

---

## Quick Reference

**Component Dimensions** (1F = funnel = 48 units)
- Processor core: 7.3F wide × 3.7F tall (352 × 176 units)
- Funnel: 1F × 1F (48 × 48 units)
- Connection label: ~5.7F wide × ~1.5F tall
- Labels are ~4x wider than tall → compact vertical, generous horizontal

**Key Spacing Rules**
- Min proc-to-proc vertical: 8.7F (~418 units), recommended 9–10F
- Failure funnel X offset: -8.3F (~400 units left of processor)
- Happy-path funnel centered: proc_x + 152, midpoint Y between processors
- Branch column min gap: ~15F center-to-center (content-dependent, increase as needed)
- Queue expiration (termination funnels): 100 days

**Liquid API Base URL**: `https://proxy:${SYSTEM_HTTPS_PORT}/nifi-api` with
`-H "Host: liquid.localhost:${SYSTEM_HTTPS_PORT}"` and `-k` (self-signed). Bearer-token auth
only — no mTLS. Resolve the port with `echo $SYSTEM_HTTPS_PORT`. See the **liquid-api** skill.

**User-facing links**: Liquid canvas `https://liquid.localhost:HTTPS_PORT/nifi`; HTTP ingress
`https://{port}.liquid.localhost:HTTPS_PORT/<path>` (ports 8900–8999). Never give the user a
`/nifi-api/` URL or the internal `proxy:`/`Host:` form.

**Custom code drop-points** (restart the container to load):
- Java NARs → `./volumes/nar_extensions` (→ `/opt/nifi/nifi-current/nar_extensions`)
- Python processors → `./volumes/python_extensions` (→ `/opt/nifi/nifi-current/python_extensions`)

**Version**: Liquid 2.x (base image `ghcr.io/nocodenation/liquid-nifi:latest`); custom
Java processors target Liquid 2.x / Java 21. Confirm the exact version via `/nifi-api/flow/about`.
