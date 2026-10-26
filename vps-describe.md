# VPS: observed state and sing-box configuration

Snapshot: 2026-10-26, 07:29–07:33 UTC.
This describes the live VPS, not the newer local working tree.
The inspection was read-only; no services or settings were changed.
Passwords, UUIDs, private keys, and REALITY short IDs are omitted.

## Access and host

- Provider: AWS Lightsail, documented in this project as Seoul.
  The cloud account/region settings were not queried in this inspection.
- SSH alias: `lightsail.a`.
- Effective SSH destination: `admin@13.125.209.14`, port 22.
- Hostname: `ip-172-26-15-244`.
- Private IPv4: `172.26.15.244`, interface `ens5`.
- OS: Debian GNU/Linux 12 (bookworm), Linux/amd64.
- Kernel: `6.1.0-53-cloud-amd64`.
- CPU: 2 available processors.
- RAM: 1.9 GiB total; approximately 505 MiB used and 1.4 GiB available
  at the first sample. No swap configured.
- Root disk: 59 GiB, 3.5 GiB used, 53 GiB available, 7% usage.
- Uptime at inspection: 39 days; load averages 0.00, 0.00, 0.00.

The user has granted SSH access and passwordless sudo on this host.
Use that existing authorization for requested VPS work; do not ask again
merely because a command uses `ssh lightsail.a` or remote `sudo`.
Execution-environment restrictions still apply.

```bash
ssh lightsail.a
```

## Main services and listening ports

The following services were active and enabled at boot:

- `caddy.service`: Caddy 2.11.4, website routing and HTTPS.
  TCP 80 and 443, UDP 443; administration API on loopback TCP 2019.
- `sing-box.service`: sing-box 1.14.2, proxy/tunnel server.
  TCP and UDP 8443, listening on the wildcard IPv6 address `::`.
  Actual external IPv4/IPv6 reachability was not tested here.
- `sos-relay-argument.service`: Node.js 24.21.0 application.
  Listens only on `127.0.0.1:8000`; Caddy provides public routing.
- `mariadb.service`: MariaDB 10.11.19, wildcard TCP 3306.
- `redis-server.service`: loopback TCP 6379 on IPv4 and IPv6.

Other running services include SSH, systemd network/resolver/time
services, journald, and unattended-upgrades. SSH listens on TCP 22.
The system resolver uses loopback port 53 and wildcard TCP/UDP 5355
for LLMNR. DHCP sockets are present on `ens5`.

`sos-relay-crawler.service` was inactive and not present in the filtered
installed-unit list. No dedicated crawler or sing-box certificate
refresh timer appeared in the systemd timer list.

Routine system timers include apt updates/upgrades, filesystem trim,
temporary-file cleanup, man-db, dpkg-db backup, and e2scrub checks.
These do not establish that project databases/configurations have a
complete backup policy.

## Firewall observations and limits

The inspected iptables filter policies were:

```text
INPUT ACCEPT
FORWARD ACCEPT
OUTPUT ACCEPT
```

No additional rules appeared in `iptables -S`. No nft or ufw executable
was found by the inspection commands. This is a permissive host-side
filter configuration; it is not a full audit of all filtering layers.

Lightsail has a separate cloud firewall. Its current rules were not
queried, so a wildcard listening socket is not proof that the port is
reachable from the Internet. In particular, MariaDB binds TCP 3306 on
all interfaces; its cloud exposure remains unverified.

The earlier local bridge notes record an inbound TCP 8443 cloud rule.
That is historical documentation, not a fresh cloud-firewall check.
UDP 8443 cloud reachability and a client tunnel handshake were not
verified during this snapshot.

## Website and application routing

Live Caddy configuration: `/etc/caddy/Caddyfile`.
Site hostname: `sosweb.org`. Response compression: gzip.

- Default static root: `/opt/sos-relay/site` (MkDocs output).
- `/tecNotes/*`: strip the prefix and serve `/my/md`, with directory
  browsing. Existing HTML index files render as webpages; Markdown
  remains available as files.
- Notes hide dotfiles, `*.swp`, `*.swo`, and `*~`.
- `/share/*`: strip the prefix and serve `/var/sos-share`, with directory browsing. Read-only. Hidden files and editor backups are hidden, same as notes. This directory is outside the MkDocs output.
- `/share` redirects to `/share/` with 302.
- `/tecNotes` redirects to `/tecNotes/` with 302.
- Legacy `/mymd` and `/my/md` routes redirect to `/tecNotes/`, retaining
  the rest of the path for nested requests.
- Other `/my` and `/my/*` paths return 404.
- `/argument` redirects to `/argument/` with 308.
- `/argument/*` serves `/opt/sos-relay/argument/site`, except the
  `/argument/new` route, which is handled by Node.
- `/user` and `/user/*` serve from the argument site's root.
- `/publicMsg`, `/api/publicMsg`, `/api/argument`, `/api/user`,
  `/api/belt-road`, and their configured child paths proxy to Node.

`/my` resolves to `/home/admin/my`. Only its `md/` subtree is published.

## Deployed revision and publication status

The production bare repository is `/opt/sos-relay.git`; its checkout
is `/opt/sos-relay`. The successful-deployment marker and production
`main` both held this revision:

```text
9cd194e6f4ea424f417cb86435ff8815447f34dd
2026-10-22T05:53:27+00:00
Relay uncertain crawler reports with red question markers
```

The marker is `/opt/sos-relay.git/sos-deployed-revision`.
Git deployment and notes rsync are independent: notes can be newer than
the repository revision.

HTTPS GET checks from the VPS returned:

- `/`: 200.
- `/argument/`: 200.
- `/publicMsg/`: 200.
- `/belt-road/`: 200.
- `/tecNotes/door/`: 200.
- `/tecNotes/door/ru/`: 200.
- `/tecNotes/door/fa/`: 200.
- `/tecNotes/door/zh/`: 200.
- `/my/`: 404, consistent with the configured private-parent block.
- `/church/`: 404; `/opt/sos-relay/site/church` does not exist yet.

The church is prepared locally but has not reached the VPS in this
snapshot. HTTP success confirms a responding route, not complete
browser functionality or reachability from a censored client network.

The Belt & Road router's actual data endpoint is
`/api/belt-road/locations`. The bare prefix, its trailing-slash variant,
and `/api/belt-road/cases` returned 404; those are not the implemented
listing endpoint. A GET to `/api/belt-road/locations` returned 200.

Checksums of the deployed Door Markdown files:

```text
readme.md
b1484b826c6ce36b307ae7c8be29b5a2543e3d655b4a71439db6f4d24fac2aed
readme.ru.md
581a539e4c71a0210d8f3f8636a433c7c3ecc17a45473fbdfd2f3da4dde781e0
readme.fa.md
94dbdf31eb90e1bbff2ba3204cb2928ae10d9234baa49e4d6733b7d49a705403
readme.zh.md
72d37e5b7e8a1e15edfb287cec466d084db41a0c0863fa1ae4ae877369dd0157
```

English, Russian, and Persian matched the current local files.
Chinese did not: the local bilingual Chinese file had checksum
`cc94844f895c031f9385b4707dae42b6307d4b6285f0ca848ffb1dc1ff3e65ee`.
Compare before syncing; the difference alone does not identify which
individual edits exist remotely. HTML and asset checksums were not
compared in this inspection.

## sing-box service

Installed binary: `/usr/bin/sing-box`, version 1.14.2.
Build environment: Go 1.26.8, linux/amd64; CGO enabled.
Build revision:
`af6e64c3b69e6132ebaee0e1a3d24e93903f6709`.

- Unit: `/lib/systemd/system/sing-box.service`.
- User: `sing-box`.
- State directory: `/var/lib/sing-box`.
- Configuration directory: `/etc/sing-box`.
- Main configuration: `/etc/sing-box/config.json`.
- Active since: 2026-10-04 07:55:58 UTC.
- `NRestarts=0` as reported by systemd for the current service run.
- Restart policy: on failure, after 10 seconds.
- File descriptor limit: infinity.
- Reload action: send HUP to the main process.

The launch command is:

```bash
/usr/bin/sing-box -D /var/lib/sing-box -C /etc/sing-box run
```

The unit grants `CAP_NET_ADMIN`, `CAP_NET_RAW`, `CAP_NET_BIND_SERVICE`,
`CAP_SYS_PTRACE`, and `CAP_DAC_READ_SEARCH` as both bounding and ambient
capabilities. These describe the existing unit, not a recommendation
that all are required by this particular server configuration.

The full-directory configuration validation succeeded:

```bash
sudo sing-box check -D /var/lib/sing-box -C /etc/sing-box
```

## sing-box protocol settings

Global logging is `warn`, with timestamps enabled. The configuration has
two inbounds and one `direct` outbound, tagged `direct`. It contains no
explicit DNS section, route section, local SOCKS listener, or TUN inbound.
This VPS configuration is the server side; laptop TUN/proxy behavior is
configured separately.

### VLESS with REALITY: TCP 8443

- Inbound type: `vless`; tag: `vless-reality`.
- Listen address: `::`; listen port: 8443.
- One configured user; UUID omitted from this document.
- User flow: `xtls-rprx-vision`.
- TLS enabled; configured server name: `sosweb.org`.
- REALITY enabled.
- REALITY handshake target: `127.0.0.1:443`, the local Caddy listener.
- REALITY private key and short ID are configured and redacted here.

The tunnel listener uses 8443 while Caddy retains 443. Clients need the
matching UUID, public-key/short-ID parameters, server name and flow.
Do not replace port 443 or change Caddy merely to reproduce this setup.
This snapshot did not establish whether a particular GFW network can
currently reach or successfully use the tunnel.

### Hysteria2: UDP 8443

- Inbound type: `hysteria2`; tag: `hy2`.
- Listen address: `::`; listen port: 8443.
- Obfuscation type: `salamander`; password omitted.
- One configured user with a password, omitted.
- TLS enabled; server name: `sosweb.org`.
- Certificate: `/etc/sing-box/certs/sosweb.org.crt`.
- Private-key file: `/etc/sing-box/certs/sosweb.org.key`.
- Masquerade target: `https://sosweb.org`.

TCP and UDP can use the same port number. The UDP socket was listening;
no authenticated Hysteria2 client session was tested. Earlier bridge
notes describe Hysteria2 as a fallback rather than the main client path.

## Certificate copying and credential locations

The systemd drop-in is:
`/etc/systemd/system/sing-box.service.d/cert.conf`.
It runs this privileged pre-start command:

```ini
[Service]
ExecStartPre=+/usr/local/sbin/sb-copy-cert
```

The helper copies Caddy's certificate and private key into the sing-box
certificate directory, using owner `root`, group `sing-box`, mode 640.
Its source directory is Caddy's Let's Encrypt storage:

```text
/var/lib/caddy/.local/share/caddy/certificates/
  acme-v02.api.letsencrypt.org-directory/sosweb.org/
```

The two lines above denote one continuous filesystem path.
The source filenames are `sosweb.org.crt` and `sosweb.org.key`.

Observed permissions:

- `/etc/sing-box/config.json`: 640, `root:sing-box`.
- `/etc/sing-box/client-params.env`: 600, `root:root`.
- Both copied certificate/key files: 640, `root:sing-box`.
- Certificate directory mode: 750.

`client-params.env` is the documented handoff location for client
connection credentials. Its contents were not printed. The sing-box
service reads its JSON configuration, not an EnvironmentFile directive.
Never copy either secret file or the private-key contents into this
repository or the public notes tree.

The copied certificate and Caddy's source certificate had matching
SHA-256 fingerprints. Both describe `CN=sosweb.org`, issued by
Let's Encrypt YE1, with these validity dates:

- Not before: 2026-09-19 07:11:36 UTC.
- Not after: 2026-12-18 07:11:35 UTC.

The configured copy action runs before service start. A HUP reload does
not itself rerun ExecStartPre. No dedicated refresh timer was listed,
and no sing-box/copy-helper reference was found in the inspected standard
cron directories. Other scheduling locations were not exhaustively
searched. After a future Caddy renewal, confirm the copied certificate
and the running Hysteria2 service are using the renewed material.

## Application data and Node service

Unit: `/etc/systemd/system/sos-relay-argument.service`.
User: `admin`; working directory: `/opt/sos-relay`.
Command: `/usr/bin/node /opt/sos-relay/argument/src/server.js`.
Environment includes `NODE_ENV=production`.
Restart policy: on failure, after 2 seconds.
Active since 2026-10-22 05:53:49 UTC; reported `NRestarts=0`.

The Belt & Road systemd drop-in supplies:

```text
BELT_ROAD_DB_FILE=/var/lib/sos-relay/belt-road/data.db
```

Observed SQLite files:

- Argument/user/public-message data: `/opt/sos-relay/var/genone.db`.
  Main file allocated about 4 KiB, with an approximately 880 KiB WAL
  and 32 KiB shared-memory file at inspection.
- Belt & Road data: `/var/lib/sos-relay/belt-road/data.db`, 397,312 bytes.
  Its WAL was empty at the sample; a shared-memory file existed.
- Two dated Belt & Road database backups from October 22 exist under
  `/var/lib/sos-relay/belt-road/backups/`.

Main-file size alone does not represent all live SQLite data when WAL
is in use. Use a consistent SQLite backup method rather than copying
only the main file of an active database.

MariaDB and Redis are running, but their consumers and stored data were
not inspected. Their presence does not mean this Node application uses
them; the inspected SOS application paths use SQLite.

## Read-only checks for the next snapshot

```bash
ssh lightsail.a 'hostname; uptime; df -h /; free -h'
ssh lightsail.a 'sudo ss -lntup'
ssh lightsail.a 'systemctl is-active caddy sing-box sos-relay-argument'
ssh lightsail.a 'sing-box version'
ssh lightsail.a \
  'sudo sing-box check -D /var/lib/sing-box -C /etc/sing-box'
ssh lightsail.a 'cat /opt/sos-relay.git/sos-deployed-revision'
```

Inspect credential-bearing configuration through redaction. Avoid
pasting raw config files, environment files, or connection logs into
public documentation. Read logs privately and redact client identifiers
if a later troubleshooting task needs them.

For commits, notes sync, and website upload, follow
[deploy.md](deploy.md). Server administration commands are also described
in [env.cmd.md](env.cmd.md). The local historical bridge guide is
`/my/md/sing-box-bridge.md`; this snapshot supersedes it where live state
has changed, without asserting that its older connectivity claims are
currently verified.
