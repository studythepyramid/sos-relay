# FDT clip upload (https://sosweb.org/handclips/)

Receives the clips of the FDT Android app (and any tus client). Built 2026-11-25.

## What runs

- `tusd` v2.10.3 (resumable upload server, tus protocol) on `127.0.0.1:1080`,
  systemd unit `tusd`, user `tusd`, binary `/usr/local/bin/tusd`.
- Caddy (in the `sosweb.org` block) forwards `/handclips/files/*` to tusd and
  answers `/handclips/ping` with `ok` (the app's connection check).
- Hooks in `/opt/handclips/hooks/` (Python 3, from `hooks/` here):
  - `pre-create`: accepts only a safe `.mp4` or `.json` name, a player id
    `[A-Za-z0-9_-]{6,64}`, size up to 200 MB (mp4) or 1 MB (json), and refuses
    when `/var/handclips` would pass **10 GB** in total.
  - `post-finish`: moves a finished upload to
    `/var/handclips/clips/<player>/<filename>` (and its tus info next to it as
    `<filename>.tusinfo`). The same name with the same size is kept once.
- No invite token and no login (za, 2026-11-25). The checks above and the quota
  are the only gate. Downloads and deletes through the API are disabled
  (`-disable-download -disable-termination`).
- Deleting a player's clips is not built: do it by hand on the VPS
  (`sudo rm -r /var/handclips/clips/<player>`).

## Install / re-install

```bash
ssh lightsail.a 'rm -rf /tmp/handclips && mkdir -p /tmp/handclips'
scp -r deploy/handclips/{install.sh,tusd.service,handclips.caddy,hooks} lightsail.a:/tmp/handclips/
ssh lightsail.a 'cd /tmp/handclips && sudo ./install.sh'
```

`install.sh` is idempotent. It backs up the Caddyfile as
`/etc/caddy/Caddyfile.before-handclips-<time>`, validates the new one and rolls
back if it does not validate.

## Check

```bash
curl https://sosweb.org/handclips/ping                 # ok
ssh lightsail.a 'systemctl is-active tusd caddy; sudo du -sh /var/handclips'
ssh lightsail.a 'sudo find /var/handclips/clips -type f | head'
```

## Pull the clips to the PC

```bash
rsync -av lightsail.a:/var/handclips/clips/ ~/dev/linput/hand/ubuntu/recordings/phone-uploads/
```
(needs `sudo` on the VPS side: `--rsync-path="sudo rsync"`, since the folder belongs to `tusd`.)

## Client

`~/dev/fdt-android/collector/.../Tus.kt`: a small tus client on HttpURLConnection;
chunks go as `POST` with `X-HTTP-Method-Override: PATCH` (HttpURLConnection has no
PATCH). The player id is temporary: `p-<yyMMddHHmmss>-<model>-<6 hex>`.
