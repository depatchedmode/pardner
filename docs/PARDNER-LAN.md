# Use Pardner on a companion device

Companion device access serves the existing workspace from a computer on your
trusted local network. Connect from a browser on a phone, tablet, laptop, or
another desktop. Keep the host computer and the Pardner service running. The
companion device is a browser client; it does not hold an offline Automerge replica.

## Connect once

1. Install dependencies and build the current browser client:

   ```sh
   npm ci
   npm ci --prefix ui-prototype
   npm run ui:build
   node bin/pardner.js serve --data .pardner
   ```

2. On that computer, open the reported loopback HTTP address at `/pardner/`.
   Connect with the token in `.pardner/connection.json` and register an Actor with
   the CLI if the workspace has none.
3. Choose **Pair another device**. Select the Wi-Fi or Ethernet interface shared
   with the companion device and choose **Enable device access**. One eligible
   IPv4 interface is selected automatically; multiple interfaces require an explicit choice.
4. Stop the service with Ctrl-C and restart it with the **same data directory**.
   Reopen **Pair another device** on the desktop. Scan the QR code, or open
   the displayed link on the other device. A one-time code is generated automatically.
5. The device connects automatically. Choose the Actor making changes.
   Manual eight-digit code entry remains available as a fallback. The link carries
   the code in its URL fragment, which the receiving page removes before redeeming it.
   The code works once, for ten minutes. A new code replaces the old one, and
   service restart clears unused codes. After ten redemption attempts in a minute,
   wait a minute before trying again.
6. Choose **My reviews** to show tasks assigned to that Actor with status
   **Review**. Change the assignee/status filters to see other work. Task details,
   comments, evidence, status changes, and handoffs use the normal operation API.

The browser remembers the shared credential and workspace preferences in local
storage, without application expiry. Closing and reopening the browser or
restarting the service does not require another pairing. Browser storage is
origin-specific: clearing site data or changing the host address can require
pairing again. Private browsing can discard credentials when its session ends.

## Transport and credential lifecycle

LAN mode uses **HTTP and WS, without encryption**. Anyone able to observe or alter
this network traffic may obtain the shared secret or workspace content. Pairing
is a convenience for transferring the existing secret; it does not encrypt the
connection or verify an Actor's identity. Use a trusted network. No ports are
automatically forwarded through a router and no firewall rules are changed.

Everyone holding the shared secret has the existing flat workspace access.
**Forget this workspace** removes that browser's stored credential, preferences,
and tab's pending request. It does not revoke the shared secret or disconnect
other browsers. Resolve an uncertain write before forgetting its pending request.

Rotate the shared secret by stopping the service and restarting with a newly
generated `PARDNER_API_TOKEN` supplied through your normal secret-management
mechanism. Do not print it into logs or put it in URLs. The new token is saved in
the protected connection file. Update any explicitly configured CLI/replica
credentials that used the old token. Existing browsers reconnect through pairing
or by entering the current local service token. There is no per-device revocation.

Unused pairing codes are in memory only. Durable credentials remain in protected
`connection.json` on the host and browser local storage on the companion device;
they are never put in QR codes or published addresses. Short-lived WebSocket tickets are
obtained automatically with that secret whenever a subscription connects. Ticket
expiry does not sign a human out. Rejection logs omit query strings and secrets.

An uncertain operation is retained in tab session storage under the workspace
identity and retried with its original ID and payload. This is not browser-only
offline persistence: do not close the tab before resolving an uncertain save.
Browser requests include the expected workspace identity so a stale page cannot
write to a different workspace that later occupies the same address.

## Configuration and recovery

Companion device setup saves `access.json` in the service data directory with
mode 0600. It records the enable flag and interface name, and changes apply at restart.
The standard loopback listeners remain available. LAN listeners use the same
HTTP/WebSocket port numbers on the selected interface (normally 8004 and 8005).
The native replica protocol continues to use the existing WebSocket port.

The same explicit allowlist covers built assets, configuration, API requests,
and WebSocket upgrades. Enabling device access adds the selected LAN HTTP origin
and supported loopback origins; it does not trust arbitrary request origins.
Explicit `PARDNER_ALLOWED_ORIGINS` entries remain supported for other known
clients. Device setup expects the normal loopback binding; remove an ad hoc
`PARDNER_BIND_HOST` override before enabling the saved pairing flow.

- **Changed network/address:** reopen the desktop dialog. If the selected
  interface's address changed, restart, then use the new displayed URL. A stale
  unreachable bookmark cannot show application-level recovery on first load.
- **Missing or ambiguous interface:** loopback remains available. Choose an
  interface with one usable IPv4 address, save, and restart. Link-local IPv4 and
  IPv6 device setup are not supported in this version.
- **Could not start LAN listeners:** check the selected interface and both ports,
  then restart. A partial LAN startup closes its listeners and preserves loopback.
- **Page loads but updates fail:** allow both displayed ports through the host
  firewall and check Wi-Fi client isolation/guest-network settings.
- **Blank or failed assets:** the HTML startup shell includes recovery guidance.
  Rebuild the browser client and reload using the current address.
- **Connection interrupted:** the browser retries with bounded backoff and
  reconnects when brought to the foreground. Use **Retry connection** if needed.
- **Disable access:** choose **Disable device access** in the desktop dialog and
  restart. Until restart, existing listeners remain active. Workspace data stays
  intact; the shared secret does not change.

## Reuse behind a future HTTPS proxy

The browser reads `/pardner/config`. The response includes `workspaceId`,
`apiBase`, `wsPath`, optional `wsPort`, and `canManageAccess`.
With `wsPort`, it uses the page hostname and the separate WebSocket port.
Without `wsPort`, it uses the page's port. HTTPS pages select WSS automatically.

Setting `PARDNER_BROWSER_WS_PATH=/pardner/ws` makes the service advertise that
same-origin path and omit `wsPort`. A proxy would route assets and API requests
to the HTTP port, and upgrades on `/pardner/ws` to the existing WebSocket
subscription endpoint. The override does not create a new listener or configure
a proxy. Forwarded headers are not used to infer public endpoints or grant local
network administration. Development uses the existing Vite API/WS proxies through
the same browser connection helper.

Public HTTPS deployment and persistent revocable browser sessions are tracked in
[#56](https://github.com/depatchedmode/pardner/issues/56). The local proxy test
qualifies endpoint routing, not public hosting, certificates, or public-safe
authentication.

## Verification and physical-phone rehearsal

Install the pinned browser engines with `npx playwright install chromium webkit`.
`npm run test:ui` covers existing workflows, mobile Chromium/WebKit over an actual
non-loopback HTTP address, persistent browser reopening, lost-response retries,
service restart, credential rotation, bootstrap failures, and a local proxy.
Without a LAN IPv4 interface, the LAN-specific tests explicitly report a skip;
they do not substitute localhost. `npm run verify` adds full regression and one
acceptance scenario. Automated mobile contexts are not physical-phone evidence.

For a physical rehearsal, use a separate data directory and explicit free ports
so the normal workspace is unaffected. Register two test Actors, create a review
task assigned to the phone Actor, and run the connection recipe above. Record:

1. Commit/diff identity, date, phone model, OS, browser/version, and HTTP transport.
2. Clean page load, pairing, explicit Actor selection, and the My reviews filter.
3. A desktop comment appearing on the phone without reload.
4. A phone comment and status change, verified by CLI readback and Actor attribution.
5. Browser closure/reopening and phone sleep/resume without repeated pairing.
6. Same-directory service restart followed by reconnect and durable readback.
7. Forgetting the workspace and the return to pairing; disabling LAN and restart.

Run on iOS Safari and Android Chrome where available, and identify devices not
tested. Capture addresses only if useful; never capture tokens or pairing codes.
Keep the rehearsal result separate from automated-test evidence.

Any connected browser can use **Pair another device** to display the LAN QR code and generate a one-time pairing code. This includes a desktop opened through the LAN address. Changing the network interface or enabling/disabling access still requires the local service address.
