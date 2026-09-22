# Doors to the real Internet

*Last verified: September 2026. This landscape shifts constantly — tools
get blocked, protocols get patched, new ones emerge. Treat this as a
dated snapshot, not a permanent reference; the meta-resources at the
bottom stay current even when specific tool names here go stale.*

## Circumvention protocols/clients (the actual bypass tech)

- **Shadowsocks** (shadowsocks.org) — SOCKS5 proxy purpose-built to defeat
  DPI-based blocking; the long-standing standard against the GFW specifically
- **V2Ray/V2Fly** (v2fly.org) and **Xray** — protocol suite built on top
  of/alongside Shadowsocks, widely used in China
- **Trojan** (trojan-gfw.github.io) — disguises traffic as ordinary
  HTTPS, harder for DPI to fingerprint
- **Hysteria** (hysteria.network) — UDP-based, designed to perform well
  even on high-loss/heavily-throttled networks
- **NaiveProxy** (github.com/klzgrad/naiveproxy) — HTTPS-camouflaged,
  rides on Chromium's own network stack
- **Clash / Clash Meta / Mihomo** — GUI clients that can run most of the
  above protocols, common entry point for non-technical users
- **AmneziaWG** — a WireGuard variant specifically modified to evade DPI
  (plain WireGuard's handshake is fingerprintable and gets blocked)

## Turnkey apps (less setup, good for less technical users)

- **Psiphon** (psiphon.ca) — one-tap, widely used in Iran/China, adapts
  protocols automatically
- **Lantern** (getlantern.org) — P2P-assisted, designed for censored regions
- **Outline** (getoutline.org, Jigsaw/Google) — easy to self-host a
  Shadowsocks server for personal/small-group use
- **Tor Browser** (torproject.org) — the standard for anonymity, has
  built-in "bridges" (obfs4, snowflake) specifically for censored
  networks where plain Tor is blocked

## Messaging resistant to shutdown/surveillance

- **Briar** (briarproject.org) — peer-to-peer, works over
  Bluetooth/WiFi/Tor, **no central server needed at all** — keeps
  working during a full internet shutdown, closest fit to this
  project's actual scenario
- **Signal** (signal.org) — E2E encrypted, has domain-fronting history
  for reaching it when blocked
- **SimpleX Chat** (simplex.chat) — no persistent user identifiers by design
- **bitchat** — Bluetooth mesh messaging, no internet needed at all

## App distribution when Google Play itself is blocked/monitored

- **F-Droid** (f-droid.org) — open-source Android app store, common
  distribution channel for circumvention tools

## DNS-layer help (EFW does DNS pollution specifically)

- **Cloudflare 1.1.1.1 app** — DNS-over-HTTPS/TLS, defeats basic DNS
  injection; has a built-in WARP VPN mode too
- **NextDNS** — configurable DoH resolver

## Meta-resources — stay current, link to these directly

- **EFF Surveillance Self-Defense** (ssd.eff.org) — comprehensive,
  actively maintained, multi-language
- **Access Now Digital Security Helpline** (accessnow.org/help) — direct
  human help for someone in an active crisis, not just docs
- **GreatFire.org** — specifically tracks Chinese censorship, mirrors
  blocked sites, tests circumvention tools
- **Open Technology Fund** (opentech.fund) — funds and vets many of the
  tools above, good index
