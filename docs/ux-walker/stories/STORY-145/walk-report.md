# STORY-145: Trying to open the board from a phone on the same Wi-Fi

Setup: client "Hannah Cho" with "Sprint 14", running on loopback port 57265. A real phone was not available, so the "phone" is Playwright WebKit with the iPhone 13 profile on the same machine, using the machine's LAN address (redacted as `<lan-ip>`). Evidence: `<evidence-archive>/walker-2026-11-09/STORY-145/`.

## Steps
1. **Open `http://<lan-ip>:57265/pardner/` on the "phone".** `Could not connect to the server` (WebKit). The service is bound to 127.0.0.1 only. `screenshots/step-1-phone-lan.png` is a rendering of the WebKit error, because headless WebKit shows a blank page for refused connections. Matches. This is honest but unhelpful: the person gets a generic browser error with no Pardner explanation. That is inherent to loopback-only binding.
2. **README.** Line 49: "…computer's loopback only. Phone access is not currently offered; it is planned…". `docs/PARDNER-CLIENT.md` line 155 says the same. Matches.

### Variations and edge cases walked
- **`--public-url https://pardner.example.dev` gateway** (a second client started with that flag; the gateway was simulated by sending the public host to the loopback listener):
  - `Host: pardner.example.dev`, GET `/pardner/`: `403 {"code":"ORIGIN_REJECTED","error":"Open the configured client address"}`. Matches the catalog's code and message.
  - With an `Origin: https://pardner.example.dev` header: `403 {"code":"ORIGIN_REJECTED","error":"Origin not allowed"}`. `screenshots/var-gateway-browser-route.png` shows how a phone browser renders it: raw JSON with a "Pretty-print" checkbox (F-145-01).
  - A plain `X-Forwarded-Host` alone is not treated as the public origin (200 on loopback). That is not a defect.
- **Forwarded `#grant=…` URL opened from the phone on the LAN host:** the same "Could not connect to the server", because the grant never reaches the service.
- **Standalone `pardner serve` page:** not walked here (STORY-135 covers the standalone service).
- **Mobile check:** `screenshots/mobile-check.png` is Hannah's laptop board at 390x844, geometry clean. That is the only view a phone-sized screen can actually get.

## Flagged claim verdicts
- None of the flagged claims name this story.

## Flow Log
- Ideal 1 (learn quickly that phone access isn't offered). Actual: try the LAN URL (browser error), then find and read the README = 2. The product itself never tells her, because the browser error comes before Pardner can say anything. Through a gateway she gets raw JSON.

Status: pass
