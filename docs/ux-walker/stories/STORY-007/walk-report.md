# STORY-007 walk report: PORT_IN_USE — another process on the client's port

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-007/`. Setup: client "Lena Novak" with project "Storefront" saved on port 47107, then stopped. Three kinds of squatter were put on 47107 in turn: the repo's own **real Vite 4.5.14 dev server** (`ui-prototype/node_modules/.bin/vite --port 47107`), a plain HTTP server answering 404, and a raw TCP socket that drops connections. CLI-only story; one browser check at the end.

## Steps
1. **`pardner open` with real Vite on the saved port** → `{"success":false,"error":{"code":"INTERNAL_ERROR","message":"Unexpected end of JSON input"}}`; stderr `INTERNAL_ERROR: Unexpected end of JSON input`. (A hand-rolled server answering 200 HTML gave `INTERNAL_ERROR: Unexpected token '<', "<h1>Vite d"... is not valid JSON`.) Vite answers `200 text/html` to the probe's `GET /session`, so the probe crashes on JSON parsing instead of classifying the port as foreign. The story's expected PORT_IN_USE never appears for the story's own scenario (F-007-01).
1b. **Same with a server that answers 404** → the expected `PORT_IN_USE: http://127.0.0.1:47107 is answering but is not this Pardner client; stop that process or start with --http-port`.
2. **`pardner open --http-port 47108`** → identical PORT_IN_USE (404 squatter) or identical INTERNAL_ERROR (Vite). The advised flag cannot take effect (F-007-02). `client status` with the 404 squatter gives `INTERNAL_ERROR: Unexpected token 'N', "Not found" is not valid JSON`; `client stop` gives PORT_IN_USE.
3. **Squatter stopped, `pardner open`** → `{"success":true,…,"launchIssued":true}`; the launched link signed the browser in to "Storefront" (`screenshots/step-3-signed-in-after-port-freed.png`). Geometry clean.
- **Variation: non-HTTP holder** (raw TCP) → `PORT_IN_USE: Port 47107 is in use by another process; choose another --http-port` in 0.5 s; then `pardner open --http-port 47108` **worked** and saved the new port. Confirms two differently worded PORT_IN_USE messages from two code paths (F-007-03).
- **Variation: foreground `client serve --http-port 47108`** while Vite held 47107 → bound 47108 and rewrote `client-connection.json`. This is the only working escape hatch in the foreign case, and no message mentions it.
- **Mobile 390×844** (`screenshots/mobile-check.png`): board header wraps (same as STORY-002 F-002-03).

## Flagged claim verdicts
- **#23 `PORT_IN_USE` in the `foreign` case tells the person to use `--http-port`, but the probe runs before the flag is used, so the advice cannot take effect — CONFIRMED.** `pardner open --http-port 47108` returned the same PORT_IN_USE naming 47107. Worse: with a real Vite dev server the person does not even get PORT_IN_USE, only a raw JSON-parse INTERNAL_ERROR.

## Flow Log
- Ideal 2 (read error, re-run with `--http-port`). Actual with the 404 squatter: 3 (error → follow advice → same error → must find and stop the other process). With real Vite: the error does not mention the port at all; the person must guess. Escape hatch (`client serve --http-port` in the foreground) is undocumented in any message.

Status: fail
