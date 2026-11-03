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
The phone test waits for the pairing QR `<img>` but does not assert that the
image loads. A change to the page's content policy or image handling needs an
explicit check that the QR image loads as an image (for example
`image.decode()` resolving and a nonzero `naturalWidth`) in Chromium and
WebKit. Describe that check as image loading: it does not read the QR payload,
compare it with the pairing link, or show that a phone camera can scan it.
Payload and scannability need a QR decoder or the physical-phone exercise.
Mask tokens, one-time pairing codes, pairing links, and QR codes in artifacts.
Browser traces of pairing capture the credential entry and ticketed WebSocket
URL; retain only copies produced by `verify:sanitize` (see SKILL.md, Artifact
privacy). Never run an exercise against the user's existing workspace.
