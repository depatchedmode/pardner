# Phone companion

## Sub-features

Turning phone access on and off on a chosen network, Rebind after an address
change or failed bind, keyed pairing codes (QR, grouped digits, countdown,
several waiting at once, cancel), pairing from the scanned link or by typing the
code, the reduced phone header, edits authored as the computer's human,
presence showing the phone's name, revoking a phone, signing out on the phone,
and returning to pairing when the session ends. The older standalone **Pair
another device** flow is separate (see Gotchas).

## How to get to it (user POV)

On the computer, open the local client (`pardner client open`) and a project,
then **Pair a phone** → choose **Network** if there are several → **Turn on phone
access** → **New code**. On the phone (same network), scan the QR code or open the
shown `http://<address>:<port>/pardner/` and type the eight digits. The phone opens
the board with **You (phone)** in its header; **Sign out this phone** is behind it.
Back on the computer, **Paired phones** lists the phone with **Revoke**. Follow
the [phone guide](../../../../docs/PARDNER-LAN.md) for network changes, the
security model and the real-phone rehearsal.

## Driving it with Playwright

Run `npm run test:ui` with pinned Chromium and WebKit installed;
`test/client-companion-ui.test.js` runs in both. It starts a client with
`withClientWorkspace(engine, { clientOptions: { interfaces } })`, injecting a
"LAN" interface on `127.0.0.1` so the phone listener is a second loopback port
(a separate origin). The computer is a 1440×900 context; each phone is its own
mobile context (`isMobile`, `hasTouch`, 390×844), so cookies never mix.

It checks: the dialog keeps its box while turning on and making a code; the code
is `NNNN NNNN` with "Use once before … · m:ss left" and a QR image; no Copy
control; opening `${phoneUrl}#pair=<code>` strips the fragment and opens the board
without Invite, Pair a phone, Control or Start/join; no horizontal scroll at
390px; the computer shows **Paired: <name>**; a description edit on the phone is
readable through the client API with `task.update` authored by the human's
Actor; the computer's own profile lists the phone's name as a live session; three
codes wait together and one is typed on a second phone after a refused code
(which clears the field); **Revoke** returns the first phone to **Pair this
phone**; **Sign out this phone** does the same for the second; **Turn off phone
access** asks first; and no code or companion cookie appears in either browser's
console or the service's stdout/stderr. A second case covers a used link, a failed
bind on a documentation address (192.0.2.0/24) with **Rebind**, **Use this
network**, and a changed address followed by **Rebind**.

Pure helpers (`takePairingCode`, `groupPairingCode`, `formatCountdown`,
`pairingState` and the companion API calls) are unit-tested in
`test/client-onboarding-ui.test.js`. Routes, throttling, expiry, revocation and
secret handling at the service are in `test/client-companion.test.js`
(`test:runtime`).

For manual browser checks, drive the same setup: `startClient({ interfaces })`
with a test interface, a desktop context signed in with `/open`, and a mobile
context on the phone URL. Screenshot the dialog in each state (off, bind failed,
on without a code, code, paired, waiting codes, expired or cancelled, revoke and
turn-off confirmations, changed address) and the phone's pairing screen, refused
code, board, settings and revoked notice. Mask the digits and QR code in any
retained artifact.

## Gotchas

Loopback stands in for the LAN: it proves the separate surface, origin checks,
cookie and flow, not Wi-Fi reachability, client isolation or a phone camera
scanning the QR code. Mobile contexts are not real-phone evidence; that needs the
manual rehearsal recorded in `docs/evidence/`. Cookies are scoped to the host,
not the port, so a desktop and a phone context must be separate browser
contexts. The phone returns to pairing when a poll or reconnect gets
`AUTH_REQUIRED`, which can take up to the five-second presence poll. Binding a
non-local address fails quickly with `EADDRNOTAVAIL`; use 192.0.2.x for failure
cases, never a real interface of the machine. Never run an exercise against the
user's own client data directory.

The standalone service's browser pairing (**Pair another device**) is gone from
the UI. Its server-side LAN endpoints remain until they are removed, covered by
`test/lan-server.test.js`.

Security coverage elsewhere: `test/markdown-privacy.test.js` (persisted images,
CSP, referrer-free links, `test:ui`), `test/framing.test.js` (headers and iframe
rejection) and `test/vite-security.test.js` (development listener) run through
full test discovery.
