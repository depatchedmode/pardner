# Hub channel v2

[#215](https://github.com/depatchedmode/pardner/issues/215) extends the native
WebSocket on the existing client gateway. The owner chose the signed X25519
exchange after comparing an inner TLS 1.3 connection and a Noise dependency.
The Node runtime provides all cryptographic primitives. The November 18 proxy
probe established message boundaries, keepalive and close behavior independently
of this implementation. [Owner decision and proxy probe](https://github.com/depatchedmode/pardner/issues/215)

The hub is a member machine that stores and forwards. That role confers no
membership authority. This release speaks only v2 between machines. Enrolled
storage and identity follow [the existing identity profile](PARDNER-IDENTITY-SPEC.md).
On a version refusal the board and CLI advise updating both ends. The browser
continues to read and write through its local service.

## Encoding and exchange

Strings are UTF-8. Canonical JSON sorts object keys by UTF-16 code units and
uses JSON string and number encodings without whitespace. Array order is
preserved. Binary values embedded in JSON use unpadded base64url. A named
signature domain is its literal UTF-8 string followed immediately by the
canonical encoded value. The signature is Ed25519.

The only clear WebSocket messages are the opening JSON text hello and reply,
and a possible early refusal. The hello has `type: "hello"`, `v: 2`,
`transport: "ws"`, `projectId`, `route`, `initiator` and an optional
`checkpoint`. The route is the URL dialled, including pathname and any query;
the hub checks it against its advertised routes. Each party has `machineId`
(a canonical Ed25519 DID), `publicKey` (the raw 32 bytes encoded in that DID),
`role`, `nonce` (32 fresh random bytes) and `ephemeral` (32 raw X25519 public
key bytes). The allowed role pairs are replica → hub and peer → peer. The
second pair describes the wire shape; this build serves the replica → hub route.

The transcript object has exactly `checkpoint` (null when absent),
`initiator`, `projectId`, `responder`, `route`, `transport` and `v`. The
responder sends `{type:"hello-reply",responder,signature}` under
`pardner/hello/v2/responder`. The initiator verifies it against its own hello
and sends sealed `{type:"hello-confirm",signature}` under
`pardner/hello/v2/initiator`. The responder verifies the confirmation before
applying the checkpoint or replying with records. The checkpoint's own
signature is separately checked. Including its full value in both signatures
prevents stripping or substituting it en route.

A hub catching up after restore may send a sealed `membership-request`
with no project records. Before sending its records in a sealed `membership`
reply, the initiator recognizes the responder from its saved membership or
the pin established by its authenticated enrollment reply. The hub evaluates
membership and its restore checkpoint again before serving.
A sealed `welcome` carries records, checkpoint and the board document URL.
The initiator computes membership from the invitation's project root using
the union of its own and offered records. Both machines must still be members
after the initiator saves the records it can admit.
It checks the URL against an existing board if it has one. No native sync
message reaches or leaves Repo before a protected join and peer announcement.

An early refusal carries `{type:"refused",code}` and supplies a local
diagnostic for version, project, route or role. Only an authenticated refusal
can establish that the hub is waiting after a restore. A sealed refusal can
also carry `records`. For removal, both WebSocket and HTTP send only the
certifications and authority needed to establish the relevant removal.
The replica acts on removal after its own record store admits the proof and
computes the removal. It then blocks future local writes and stops native
reconnects and HTTP acknowledgement polling. An opaque close code, including
4403, carries no authority. The hub omits a close reason and keeps internal
failure details in local diagnostics. The hub stops serving as soon as it learns the
removal. Work already on disk remains there.

## Protected messages

Compute X25519 with one fresh key per endpoint per connection. Reject failure
or an all-zero shared result. Derive two 32-byte secrets using HKDF-SHA-256.
Use SHA-256 of the canonical transcript as salt, the shared result as input
key material, and UTF-8 `pardner/channel/v2/initiator` or
`pardner/channel/v2/responder` as info for the sender of that direction.

Each WebSocket message is one binary ChaCha20-Poly1305 record. The plaintext
is one frame type byte followed by the payload. The wire bytes are ciphertext
followed by the 16-byte tag. There is no additional authenticated data. The
nonce is four zero bytes followed by the unsigned big-endian 64-bit counter
for that direction. Start both at zero. No counter is sent. Counters never
wrap. A text frame after the key transition, wrong tag, reorder, duplicate,
unknown type, phase error or malformed native payload cuts the socket. The
receiver never dispatches the failed or any subsequent frame. A reconnect
performs the entire exchange with fresh keys and nonces. The replica has a
ten-second budget from dial to the peer announcement. Local readiness is
released independently after one second if the hub has yet to respond.
Production retries start at one second and reach a four-second cap.

| Byte | Payload |
| --- | --- |
| 1 | UTF-8 JSON control message |
| 2 | Native Automerge Repo CBOR message |
| 3, 4 | Reserved for sealed ping and pong in #258. Empty payload. |

The WebSocket limit is 100 MiB including the type and tag. WebSocket control
ping/pong every five seconds keeps the route open until #258. The adapter
accepts one Repo join with supported protocol list containing `"1"`. Its
sender ID has the format `<authenticated machine DID>/<Repo peer ID>`.
The suffix is 1–128 ASCII alphanumeric, underscore or hyphen characters.
The protected peer announcement binds the other endpoint's ID the same way.
Every later native message must use exactly those sender and target IDs.
Both sides validate message shape and storage IDs before dispatch.

## HTTP answers and enrollment

HTTP sessions use the same transcript and signing domains with
`transport: "http"`, `checkpoint: null`, and no ephemeral fields. The session
name is base64url SHA-256 of `pardner/session/v2` followed by the transcript.
Requests use `pardner/request/v2` and the existing session, sequence, method,
dialled URL, body digest and project fields. Sequence freshness is scoped
to the session.

Both session handshake responses require HTTP 200 to advance. A refusal
still needs a verified response and, for removal, a locally accepted proof.

Hub replies use the `x-pardner-responder` DID and
`x-pardner-response-signature`. The signed canonical object has
`{projectId,request,status,body}`. Here `request` is the base64url SHA-256
digest of canonical `{method,suffix,body,session,seq,signature}` from the
request. The suffix includes path and query below the session route. For
enrollment it is the full enrollment path. A read's body and absent headers
are null; present headers are their string values. Response `body` is the
base64url SHA-256 digest of the canonical JSON response. The domain is
`pardner/response/v2`. A persistence acknowledgement is considered only
after verification under the session responder and the existing head and
local persistence checks. A session-unknown response triggers a fresh
session only when that response verifies for that exact request.

An enrollment answer includes the hub's genesis proof and binds a fresh
32-byte request challenge. The joiner verifies the signature and project
before using a request ID, nonce, status or approval. The request binding uses
the JSON body as transmitted. The joiner takes the hub origin
from the signed invitation route. A private runtime checks the first sealed
welcome against the authenticated enrollment signer. The registry publishes
the replica only after that welcome, durable first sync, and verification
that the membership records certify the invitation and this machine's
consent. A failed join stops its private runtime and keeps its saved data and
credentials for retry. The retry verifies its welcome before publication.
Identity, authority and the local Actor IDs come from those records.
The hub signs supplemental display metadata including the project title and
device labels.

## Contract for first download

[#306](https://github.com/depatchedmode/pardner/issues/306) can build its
transfer at the admitted channel boundary. The transcript digest binds both
DIDs, their roles, the project, the advertised route and this particular
connection. A pin or a persisted chunk never grants admission. A reconnect,
even to resume the same pin, needs fresh keys and current membership. The
serving runtime must check the recipient and its own serving eligibility at
admission, before queued work starts, and in the same turn that sends each
protected response. Local membership changes, restored-hub waiting and
shutdown cancel queued work and end affected channels. Bytes already handed
to the transport and previously saved data cannot be recalled. The receiver
also checks its own record store before publishing. A removal assertion
without valid records cannot authorize or invalidate a publish.

Bootstrap needs a phase before the Repo join. Version 2 reserves no bootstrap
message numbers and closes on unknown types. First download therefore needs
an explicit later wire revision with manifest, part and receipt bindings and
a defined bootstrap-to-Repo transition. Manifest and ordinal verification,
pin budgets and expiry, install authorization, and receipt retry after restart
are #306 decisions.

Direct peer transport remains [#200](https://github.com/depatchedmode/pardner/issues/200).
Desktop peers on a LAN or tailnet can dial an explicit route; across unrelated
NATs they need discovery and reachability support, and both local services
must run concurrently. The hub still provides store-and-forward, enrollment
and leases. [Direct lane decision](PARDNER-TRUST-DESIGN.md#direct-peer-lane)

## Vector

With the two test keys from RFC 7748 §6.1, use its shared value
`4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742` and
synthetic canonical transcript `{"transcript":"Pardner wire vector","v":2}`.
For frame type 1, payload `{"type":"fixture"}`, counter zero and empty AAD:

| Sender | Secret (hex) | Sealed record (hex) |
| --- | --- | --- |
| Initiator | `ae4d3828994f82a42356f2412144e4a894a12d06cdd6275a64e1bad0aaedc33c` | `3e1857298991d9fc74d37b71297f34f1c2b51cd77ae3b2708c585a6453b1059913d959` |
| Responder | `fe96b7e47a81e56f3455d004f0a4d443199a26ed95ceac695bcd397f58ea51ca` | `f3fbeba92eabcaf0b1dd1ed4bcbae51a7af87bc17bf2a10b04abed9f6ef3b06bb72f83` |

The fixture keys are public examples. The expected HKDF output was generated
using Python HMAC and the frame output with libsodium independently of the
Node implementation. [X25519](https://www.rfc-editor.org/rfc/rfc7748#section-6.1) ·
[HKDF](https://www.rfc-editor.org/rfc/rfc5869) ·
[ChaCha20-Poly1305](https://www.rfc-editor.org/rfc/rfc8439#section-2.8)

## Limits

A TLS terminator can read HTTP, opening frames, timing and sizes, deny
service and cut a stream. An authenticated hub can lie about persistence or
withhold data. Its signed answer identifies the signer and request; a replica
needs independent evidence to detect a lie. A stale replica may still accept
an authorized removal from an admin it has yet to learn was removed
([#255](https://github.com/depatchedmode/pardner/issues/255)). The shipped hub's
WebSocket ping proves reachability only to the relay path. A review of the
implementation and separate human cryptographic review remain gates.
