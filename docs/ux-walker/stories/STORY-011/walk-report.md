# STORY-011 walk report: Opening a standalone `pardner serve` in the browser

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-011/`. **Deviation:** the default ports 8004/8005 were not used, because this machine is shared with other walkers; the standalone service ran with `--data <own dir> --http-port 47961 --ws-port 47962`. A first attempt on 47811 collided with another walker's client and failed with a raw `EADDRINUSE: listen EADDRINUSE: address already in use 127.0.0.1:47811` (that attempt's browser check hit the other client and is discarded).

## Steps
1. **`pardner serve --data … --http-port 47961 --ws-port 47962`** → after ~10 emoji-prefixed log lines ("🚀 Starting Automerge Sync Server…", "🌍 Allowed CORS origins: http://localhost:5174, …"), `{"success":true,"serving":true,"role":"hub","workspaceId":"5d85f098-…","httpUrl":"http://127.0.0.1:47961","wsUrl":"ws://127.0.0.1:47962"}`. The log lines precede the JSON result on stdout (F-011-02).
2. **Browser at `/pardner/`** (`screenshots/step-2-standalone-notice.png`): `/pardner/config` = `{"apiBase":"","wsPath":"/","wsPort":47962,"workspaceId":…}`; screen "Pardner / This is an agent and integration service. Open Pardner with `pardner open`." Geometry clean. The command wraps onto its own line in the Courier fallback font. The notice gives no hint that the board started by `pardner open` holds *separate* data from this service (F-011-01). No console errors.
3. **`pardner open`** → starts a separate client (as walked in STORY-001); this service's workspace does not appear there. Not repeated here.
- **Mobile 390×844** (`screenshots/mobile-check.png`): clean.
- Variation `--role replica`: not walked (needs a second standalone hub; the notice code path is the same config shape).

## Flagged claim verdicts
None of the flagged claims touch STORY-011.

## Flow Log
- Ideal 2 (read notice, run `pardner open`). Actual 2. The notice is clear about what to do, but sets a wrong expectation about which data the board will show.

Status: pass
