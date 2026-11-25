#!/usr/bin/env bash
# Install the FDT clip upload on the VPS (Debian 12). Run on the VPS from this folder, with sudo:  sudo ./install.sh
# Idempotent: it can be run again. The Caddy step backs the Caddyfile up, validates the new one and rolls back on a failure.
set -euo pipefail
TUSD_VERSION=v2.10.3
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ ! -x /usr/local/bin/tusd ] || ! /usr/local/bin/tusd -version 2>&1 | grep -q "${TUSD_VERSION#v}"; then
  tmp="$(mktemp -d)"; cd "$tmp"
  curl -fsSL -O "https://github.com/tus/tusd/releases/download/${TUSD_VERSION}/tusd_linux_amd64.tar.gz"
  curl -fsSL -O "https://github.com/tus/tusd/releases/download/${TUSD_VERSION}/tusd_linux_amd64.tar.gz.sha256"
  echo "$(cut -d' ' -f1 tusd_linux_amd64.tar.gz.sha256)  tusd_linux_amd64.tar.gz" | sha256sum -c -
  tar xzf tusd_linux_amd64.tar.gz
  install -m 755 tusd_linux_amd64/tusd /usr/local/bin/tusd
  cd "$HERE"; rm -rf "$tmp"
fi

id tusd >/dev/null 2>&1 || useradd --system --home /var/handclips --shell /usr/sbin/nologin tusd
install -d -o tusd -g tusd -m 750 /var/handclips /var/handclips/incoming /var/handclips/clips
install -d -m 755 /opt/handclips/hooks
install -m 755 "$HERE/hooks/pre-create" "$HERE/hooks/post-finish" /opt/handclips/hooks/
install -m 644 "$HERE/tusd.service" /etc/systemd/system/tusd.service
systemctl daemon-reload
systemctl enable tusd >/dev/null
systemctl restart tusd

if ! grep -q "handclips" /etc/caddy/Caddyfile; then
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  cp -a /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.before-handclips-$stamp"
  python3 - "$HERE/handclips.caddy" <<'PY'
import sys
snip = open(sys.argv[1]).read()
snip = "".join("\t" + l if l.strip() else l for l in snip.splitlines(True))
p = "/etc/caddy/Caddyfile"
s = open(p).read()
mark = "\t# Public downloads."
assert s.count(mark) == 1, "anchor not found once"
open(p, "w").write(s.replace(mark, snip + "\n" + mark))
PY
  if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    systemctl reload caddy
    echo "caddy reloaded"
  else
    cp -a "/etc/caddy/Caddyfile.before-handclips-$stamp" /etc/caddy/Caddyfile
    echo "caddy config did not validate: rolled back" >&2; exit 1
  fi
fi
systemctl is-active tusd caddy
