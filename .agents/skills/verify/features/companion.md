# Companion browsers

## Sub-features

Pairing over LAN, persisted browser credentials and Actor/filter choices,
cross-client updates, uncertain-save retry, service restart/reconnect, credential
rotation, forgetting a workspace, and configured same-origin proxy routing.

## How to get to it (user POV)

From `/pardner/`, use **Pair another device**, select **Network interface**, and
**Enable device access**. Restart the same disposable service, reopen pairing,
and open the generated link in the companion browser. Choose **Actor**,
**Assigned to**, and **Status filter**. Follow the [LAN guide](../../../../docs/PARDNER-LAN.md)
for setup, recovery, and the separate physical-phone exercise.

## Driving it with Playwright

Run `npm run test:ui` with pinned Chromium and WebKit installed. The phone test
uses actual non-loopback IPv4 HTTP, enables LAN through the desktop UI, restarts,
pairs a persistent mobile context, and checks Actor/review filters after browser
reopening. It checks desktop/phone updates and reads back writes through the CLI.
The connection tests cover failed pairing, credential rotation, late stale auth
responses, bootstrap failures, and local proxy routing.

Expected: only matching tasks appear, no repeated pairing on normal reopen,
correct Actor attribution, one write after retry, and recovery after restart.
Inspect the saved masked screenshots under `output/playwright/`; copy relevant
ones into the unique verification run directory so later runs cannot replace
the evidence. Capture traces for new interactions where assertions alone leave
the failure unclear.

## Gotchas

Tests explicitly skip without a suitable LAN IPv4 interface. Treat that as missing
evidence when this behavior is affected. Mobile browser contexts do not establish
physical phone behavior, and a local proxy does not establish public HTTPS.
Mask tokens, one-time pairing codes, pairing links, and QR codes in artifacts.
Never run an exercise against the user's existing workspace.
