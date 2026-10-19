# Plan: supported phone and LAN access

Issue: [#51 — Provide supported phone/LAN access and connection setup](https://github.com/depatchedmode/pardner/issues/51)

## Baseline and scope

- Planning baseline: `origin/main` at `7afc80ad0cfc4a652cd9cf663cdda3909ecbfe33`. This worktree was clean and fast-forwarded to that commit.
- Prerequisite [#49](https://github.com/depatchedmode/pardner/issues/49) is closed. Its fix is present in `ui-prototype/src/operation-id.js` (`13d3eb98`), with browser regression cases for both availability states of `crypto.randomUUID`.
- The refreshed `origin/cursor/native-automerge-ws-sync-cda6` reference is an ancestor of this baseline, 14 commits behind. There is no separate sync implementation to reconcile into this plan.
- The phone is a browser client of a running service. Service storage remains authoritative. No browser replica, public hosting, router forwarding, or sync-schema change is required.
- Working authentication recommendation: one-time pairing with an independently revocable browser credential. This is a proposed product choice, pending the user's preference; the issue also permits an explicit shared-token flow.

## What exists and what needs work

| Area | Current behavior | Required change |
| --- | --- | --- |
| Service setup | `lib/local-service.js` remembers ports and tokens in protected `connection.json`; bind host and origins come from server options/environment | Persist deliberate LAN settings and provide a supported enable/disable/status flow |
| Address | Startup reports a loopback address for wildcard binding | Report usable, credential-free phone URLs and diagnose stale addresses |
| Admission | Browser manually receives the service token; token lives in tab session storage | Provide deliberate enrollment and a documented lifecycle |
| Origins | One exact allowlist gates HTTP assets/API and both WebSocket protocols | Derive the same explicit origins from selected LAN settings and actual ports |
| Logging | Rejection messages interpolate `req.url`, including query strings | Omit credential and ticket values from all logs and evidence |
| Browser startup | `index.html` has an empty root; React handles configuration fetch failure only after modules load | Render recovery guidance before JavaScript loads and expose distinct connection failures |
| Reconnection | Browser retries many failures every second without displaying their cause | Show actionable states, retry configuration, and recover after restart |
| Qualification | UI tests use desktop Chromium on loopback, with `randomUUID` disabled in one case | Add actual non-loopback HTTP coverage, mobile engines/viewports, and physical-phone rehearsal |

## Proposed user flow

1. On the host, deliberately enable LAN access for a named interface or explicit local address. The command validates settings and reports whether the service must restart. A plain `pardner serve --data PATH` remains loopback-only for a new workspace.
2. Startup and a connection-status command show the local URL, selected interface, current phone URL at `/pardner/`, required HTTP/WebSocket ports, and transport mode. A URL QR code is optional; any QR code contains only the public address.
3. The host operator opens a short-lived pairing window. The phone opens the address and enters a one-time code shown on the host. A successful exchange grants a browser credential, after which the phone explicitly selects an Actor.
4. Restarting the service with the same data directory restores its LAN configuration and enrolled credentials. The existing phone tab reconnects and requests a fresh WebSocket ticket.
5. The host can list paired browsers, revoke one, or disable LAN access. An expired/revoked credential returns the phone to a clear pairing state.

Proposed CLI surface, to finalize against existing parser conventions:

```text
pardner access configure --mode lan --interface NAME --data PATH
pardner access configure --mode loopback --data PATH
pardner access status --data PATH
pardner access pair --data PATH
pardner access devices --data PATH
pardner access revoke DEVICE_ID --data PATH
```

Configuration changes are applied at service startup, with an explicit restart-required result for a running service. Status must distinguish saved configuration from the running configuration. Pairing and revocation are live operations against the owning service, avoiding concurrent writes to its credential registry.

## Implementation sequence

### 1. Persist and resolve LAN configuration

Files: `lib/cli.js`, `lib/local-service.js`, a focused new access-configuration module, and service/CLI tests.

- Add versioned service access settings alongside existing workspace files. Keep editable access configuration separate from generated connection discovery and credential material. Use existing atomic-write conventions and validate before writing.
- Define precedence explicitly: command flags, environment overrides, saved configuration, then loopback defaults. Only the configuration command persists access-setting changes; temporary serve/environment overrides remain temporary and status identifies them.
- Preserve the selected mode, interface/address, explicit extra origins, and ports. Keep CLI discovery pointed at a locally reachable endpoint; do not replace it with a phone-only address.
- Resolve current local interface addresses at startup and on status inspection. Exclude wildcard/loopback addresses from phone URLs; never choose VPN/container interfaces merely because they sort first. Multiple candidates require selection rather than silently exposing all interfaces.
- For interface selection, resolve its current address on restart. For a pinned address that disappears, fail with instructions to reconfigure. A missing selected interface must never broaden the bind to all interfaces.
- If the interface address changes while running, report that the listener/address is stale and needs restart. A loaded phone page can suggest rerunning host status; a fresh visit to an unreachable old address cannot display application guidance. Document that limitation and the recovery steps.
- Specify address-family support. Initial phone setup should support ordinary IPv4 LAN addresses; correctly bracket supported IPv6 addresses and explicitly diagnose unsupported scoped/link-local addresses.
- Validate port range, origin syntax, and incompatible settings. Refuse unsafe unauthenticated mode for LAN startup. Acquire service ownership before persisting active connection state, and preserve workspace data on all setup failures.

### 2. Align HTTP assets, APIs, and WebSocket access

Files: `automerge-sync-server.js`, configuration module, `ui-prototype/vite.config.js` where development parity requires it, and server tests.

- Construct one effective exact-origin allowlist from the selected phone address, actual HTTP port, local supported addresses, and explicitly configured extras. Update ephemeral-port handling after binding. Do not trust arbitrary request Host/Origin values or allow wildcard/private-subnet origins.
- Apply the same policy to module/static requests, configuration, API/preflight requests, ticket issuance, and WebSocket upgrades. Keep no-Origin native/CLI requests authenticated and supported.
- Preserve separate JSON subscription and native Automerge WebSocket paths. Report both required ports and keep browser endpoint construction consistent with the advertised HTTP origin.
- Give origin failures stable error codes and recovery text. For top-level HTML failures, provide a readable response; do not depend on the blocked React bundle to explain an asset failure.
- Replace raw request-URL logging with safe pathname/status diagnostics across every HTTP and WebSocket rejection path. Verify that headers, pairing codes, credentials, and query tickets never appear in logs or error responses.

### 3. Add deliberate pairing and credential lifecycle

Files: a focused service-owned credential registry, `lib/cli.js`, `lib/local-service.js`, `automerge-sync-server.js`, and credential/HTTP/WebSocket tests.

- Host initiation requires the existing local service credential and a loopback request. It creates a single-use code with a short expiry (proposed: five minutes), bounded attempts, and service-wide plus per-source rate limits. Do not rely on source IP alone or forwarded headers for local authority.
- Display the code only through an explicit interactive host action, separate from normal JSON results and service diagnostics. Refuse accidental noninteractive disclosure; never place the code or a durable token in shareable URLs, QR codes, command arguments, or evidence.
- Accept the code through a same-origin POST endpoint available only while LAN pairing is enabled. Wrong, expired, replayed, exhausted, and concurrently redeemed codes have deterministic outcomes. Only one redemption succeeds.
- Issue a cryptographically random browser credential after persisting its hash and device metadata in a protected local registry. Never copy the privileged service/hub credential into the phone. On uncertain exchange or storage failure, fail closed and let the operator start a new pairing attempt.
- Browser credentials permit the existing browser workspace APIs and JSON subscriptions, but not credential administration or native replica enrollment. Actor selection continues to supply attribution; device enrollment does not authenticate an individual Actor or introduce Actor roles.
- Store the browser credential in tab session storage for this scope. Server restart preserves admission for an open/reloaded tab. Closing the tab, clearing storage, or changing origin may require pairing again; long-term remember-device storage is a separate product choice.
- Bind WebSocket tickets to credential identity and JSON-subscription audience. Revocation invalidates outstanding tickets and closes that credential's existing subscriptions, rather than merely rejecting later HTTP calls. Keep native service-token admission functioning.
- Persist enrolled credentials until explicit revocation; expire unused pairing attempts and all outstanding tickets on service restart. Document browser disconnect versus host revocation, device loss, service-token rotation, and how to revoke all devices. Tokens and enrollment metadata stay local to the service and are not synced into Automerge.

### 4. Make browser startup and recovery visible

Files: `ui-prototype/index.html`, `ui-prototype/src/main.jsx`, `ui-prototype/src/Pardner.jsx`, `ui-prototype/src/pardner.css`, and browser tests.

- Put a minimal visible loading/recovery shell and a no-JavaScript message in HTML. Add bootstrap failure handling that does not depend on the application module loading; detect missing/blocked modules and retain instructions plus reload.
- Separate configuration loading/failure, pairing required/in progress/failed, authenticated connection, subscription failure, service unavailable, and revoked credential states. Check response status, malformed JSON, and bounded request timeouts.
- Add retry actions that refetch configuration and rebuild the WebSocket endpoint. Use bounded backoff and resume after reconnect/focus so phone sleep and service restart do not leave a silent spinner.
- Explain which host command finds the current address and which ports must be reachable. A browser cannot reliably distinguish all CORS, firewall, and network failures; give useful checks without claiming certainty.
- Keep Actor selection explicit and validate a restored Actor against the current workspace. Preserve #49's operation-ID generation, original uncertain-retry payloads, and durable-acknowledgement behavior.
- Bind pending operations and saved Actor context to workspace identity. Changing server/workspace or pairing identity must not silently replay a prior workspace's pending operation. Do not imply unsent drafts or confirmed browser views are a durable offline replica.
- Make code entry, errors, Actor selection, and primary write controls usable at phone widths with touch and accessible labels.

### 5. Document transport and recovery

Files: `README.md`, `docs/PARDNER-CLI.md`, a new `docs/PARDNER-LAN.md`, and `docs/README.md`.

- Give a complete host-to-phone recipe using the production build/service, with enable, find address, pair, select Actor, write, restart, revoke, and disable steps. Remove reliance on ad hoc forwarding processes.
- Plain LAN HTTP/WS provides no confidentiality or server authentication; pairing does not change that. Make choosing this mode deliberate and explain its trusted-network limitation before code entry.
- Do not claim HTTPS support solely because the browser can build a `wss:` URL. Document TLS termination as an advanced deployment only with explicit HTTP/WebSocket routes, allowed origins, and certificates trusted by the phone, and qualify any supported recipe. Automatic certificate provisioning is outside this issue.
- Explain firewall/client-isolation checks, both ports, multiple interfaces, stale bookmarks after address changes, same-tab credential lifetime, recovery after revocation, and preservation of the service data directory.

### 6. Qualify the complete flow

- Configuration tests: default loopback, explicit enable/disable, precedence, malformed config, private file permissions, actual bound ports, missing/changed interfaces, multiple candidates, restart, and preservation after setup/write failures.
- HTTP/WebSocket tests: allowed/disallowed origins for built modules, configuration, preflight, operations, ticket issuance, and both socket paths. Retain native authentication coverage and verify log redaction for legacy token queries as well as tickets.
- Pairing tests: valid/invalid/expired codes, attempt limits, simultaneous redemption, persistence before success, service restart, browser revocation, pending-ticket invalidation, live socket closure, and denied native/admin access.
- Browser tests: production build in mobile Chromium and WebKit contexts against a real service. Cover pairing, Actor selection, subscription updates from a second client, task creation, comments, status changes, lost-response retry without duplication, service restart, and return from phone sleep.
- Reproduce non-secure HTTP behavior using an actual non-loopback origin in a dedicated LAN test harness; assert `isSecureContext === false` and exercise writes. Retain #49's deterministic disabled-`randomUUID` test as a separate regression. Fail or explicitly mark this qualification unavailable when no suitable interface exists; do not silently substitute localhost.
- Failure tests: blocked/missing module, config 403/500/malformed response, invalid credentials, unavailable HTTP service, blocked WebSocket port, stale address guidance, and storage unavailability. Assert visible recovery and no uncaught page errors.
- Run focused server/CLI/credential suites and `npm run test:ui`, then `npm run verify` for full regression and one acceptance scenario. Install pinned dependencies/browser engines in the test environment first.
- Perform a repeatable physical-phone rehearsal on the same LAN using Safari on iOS and Chrome on Android where available. Record exact build, OS/browser, transport, clean load, pairing, Actor attribution, cross-client subscription, writes, host restart, and revocation. Automated mobile emulation alone does not close this check. Keep all credentials out of captured evidence.

## Acceptance mapping and delivery

| Issue acceptance criterion | Completion evidence |
| --- | --- |
| Explicit LAN configuration, unchanged loopback default | Step 1 configuration/CLI tests and documented enable/disable recipe |
| Usable address and stale-address handling | Interface-resolution tests, host status, browser guidance, phone rehearsal |
| Deliberate credentials, safe URLs/logs, lifecycle/transport documentation | Pairing/revocation tests, log assertions, transport and lifecycle guide |
| Consistent asset/API/WebSocket origins | Step 2 positive/negative matrix including real built modules |
| Actionable failures instead of empty page | Bootstrap and connection-failure browser scenarios |
| Restart retains configuration and workspace data | Same-directory process restart with authenticated phone reconnect and readback of acknowledged writes |
| Repeatable mobile checks | Automated mobile suite plus recorded physical-phone results |

Implement in the sequence above, with tests alongside each behavioral slice. Keep commits scoped to configuration/discovery, origin/log handling, credentials, browser flow, and final documentation/rehearsal evidence. Authentication and browser integration must land together before describing phone setup as supported.

This document is a plan, not implementation or qualification evidence. No tests were run during planning; root dependencies are not installed in this worktree.
