# Use Pardner on your phone

A phone companion shows a project's board on your phone, through the local
Pardner client running on your computer. The phone signs in with a one-time
pairing code and then acts as you: its edits are authored by your human Actor,
and presence shows the phone by its own name, such as "Alice's phone".

The phone is a browser of your computer's client, not a replica. It keeps no copy
of the board, works only while the computer is on, running Pardner and reachable
on the same network, and cannot save anything while the computer is unavailable.
To add another computer with its own replica, use a
[My device invitation](PARDNER-CLIENT.md#invite-and-join) instead.

The service-side contract (routes, grants and the phone listener's allowlist) is in
[the client guide](PARDNER-CLIENT.md) and the
[onboarding contract](PARDNER-ONBOARDING-CONTRACT.md#phone-companion-grants).

## Pair a phone

1. On the computer, open Pardner signed in as yourself (`pardner client open`,
   or ask your agent to open it) and open the project.
2. Choose **Pair a phone** in the header. It is offered only on the computer,
   never on a paired phone.
3. Under **Phone access**, choose the network your phone uses when the computer
   has more than one (for example Wi-Fi and Ethernet), then **Turn on phone
   access**. The dialog shows the address phones open, such as
   `http://192.168.1.20:53120/pardner/`.
4. Optionally name the phone (the default is "<your name>'s phone"), then choose
   **New code**. The dialog shows a QR code and the same code as eight digits,
   grouped as `1234 5678`, with the time it must be used by and a countdown.
5. Scan the QR code with the phone's camera. The link opens the phone address with
   the code in its fragment (`#pair=…`); the page removes it from the address bar
   before doing anything else and pairs straight away. Or open the address on the
   phone and type the eight digits.
6. The dialog changes to **Paired: <name>** within a couple of seconds, and the
   phone opens the board.

Each code works once, for ten minutes, and only for the project it was made in.
Up to five codes can wait at once: making a new code does not cancel an earlier
one, so two phones can pair at the same time. Waiting codes are listed with
**Cancel**. The code itself is shown only in the dialog that made it; the client
stores a salted hash and never lists or logs it, and the dialog never offers to
copy the pairing link, because it is a secret sent over unencrypted HTTP.

A phone that pairs again from another project keeps one pairing and gains that
project; its project switcher lists only the projects it was paired for.

If a code is refused, the phone says so next to the field and clears it. The
client does not reveal whether a code was mistyped, used, cancelled or expired;
make a new code on the computer. After ten attempts from one phone in a minute,
or a hundred from all phones, the phone is asked to wait a minute.

## On the phone

The paired phone shows the board, Goals and Activity, with presence. Its header
has no Invite, Pair a phone or Control, and its project switcher cannot start or
join projects. **You (phone)** opens the phone's settings: its name, whose
changes it makes and **Sign out this phone**. Signing out ends the pairing on the
computer too; to use the phone again, pair it with a new code.

If the phone is revoked, its session expires or its project membership ends, the
phone returns to the pairing screen with an explanation the next time it talks
to the computer (within a few seconds while open).

## Choose, change and rebind the network

The phone listener binds only the one IPv4 address of the network you choose,
never another interface and never all interfaces. Its port is chosen once and
kept across restarts, so a paired phone's address stays the same while the
computer's address does. Phone access stays on across client restarts.

- **Switch network:** choose another network in the dialog, then **Use this
  network**. Phones open the new address; their pairing is kept.
- **Address changed:** when the chosen network's address changes (for example
  after rejoining Wi-Fi), the dialog shows **Not running** and "The address of
  <network> changed". Choose **Rebind** to listen on the current address. Pardner
  never falls back to another network on its own.
- **Could not listen:** if the address cannot be used (another program holds the
  port, or the address is not available), the dialog says why. Fix it, then
  **Rebind**, or choose another network.
- **No network:** with no Wi-Fi or Ethernet IPv4 address, the dialog says so and
  offers **Check again**.
- **Turn off phone access:** asks for confirmation, then closes the listener and
  every phone connection and cancels waiting codes. Paired phones stay paired and
  reconnect when you turn it back on.

Saving the settings already in effect changes nothing: it does not restart the
listener or cancel a code.

## Revoke a phone

**Paired phones** in the dialog lists each phone with when it was last seen.
**Revoke** asks for confirmation, then signs the phone out at once: its session is
revoked, its connections close and its presence ends. Revoking does not affect
other phones, the computer or anyone else in the project.

## Security model

- **Unencrypted HTTP on trusted networks only.** The phone listener speaks HTTP
  and WebSocket without TLS. Anyone who can watch or alter traffic on the network
  could read the board or take over the phone's session. Use it on a home or office
  network you trust, never on public Wi-Fi. Pardner does not forward router ports
  or change firewall rules.
- **Separate surface.** The phone listener serves a deny-by-default allowlist:
  the UI, configuration, pairing, sign-out, the phone's session view and the board
  and presence of paired projects. It requires its own Host and Origin and rejects
  every `Authorization` header. Network settings, codes and revocation exist only
  on the computer's loopback address, so a phone cannot make codes or change
  access.
- **The phone's credential is a cookie.** Redeeming a code sets
  `pardner_<client>_companion` with `HttpOnly; SameSite=Strict; Path=/pardner`.
  Script on the page cannot read it, and the client stores only its hash.
  Browsers scope cookies to a host, not a port: another service on the same
  address could receive it, so keep phone access to addresses you control.
- **30 days at most.** A phone's session expires 30 days after pairing, enforced
  by the client as well as the cookie's lifetime. Pair again after that.
- **Not a replica.** The phone holds no project data beyond what the open page
  shows. It depends on the computer for every read and write, and an outage of the
  computer or the network stops it until the computer is back.
- **Secrets stay out of logs.** Pairing codes and phone sessions appear in no log,
  status response or registry file. When capturing evidence, mask the code, the QR
  code and any pairing link.

## Verification

`npm run test:ui` runs `test/client-companion-ui.test.js` in Chromium and WebKit
with a mobile context (390×844, touch). It binds the phone listener to an injected
"LAN" interface on `127.0.0.1`, so the phone is a separate origin on a second
port. It covers turning access on, a code with its QR and countdown, pairing from
the scanned link (and the fragment leaving the address bar), the reduced phone
header, an edit on the phone authored as the human and seen by the computer,
presence showing the phone's name, several waiting codes, manual entry with a
refused code, a used link, a failed bind, a changed address and **Rebind**,
revoking (the phone returns to pairing), signing out, turning access off, and no
code or session in browser console or service output. `npm run test:runtime` runs
`test/client-companion.test.js` for the routes on both surfaces, throttling,
expiry and revocation.

Automated contexts are not real-phone evidence. Before claiming the companion
works on phones, record a rehearsal in `docs/evidence/` with a real phone on real
Wi-Fi: the commit, date, phone model, OS and browser (iOS Safari and Android
Chrome where available), and the result of scanning the QR code, editing a task
and seeing it on the computer, presence on the computer, sleep and resume,
revoking, and signing out. Name the devices not tested. Never record codes, links
or cookies.

## Standalone service

The standalone `pardner serve` workspace is an agent and integration service.
It listens only on its configured bind address and has no LAN listener, phone
pairing or device-access routes; phones pair only through the client companion
described above. An `access.json` left in an older standalone data directory is
no longer read, and is left in place.
