"""Install a reviewed local Door build, retaining backups outside publication."""
import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

FILES = ['readme.md', 'readme.ru.md', 'readme.fa.md', 'readme.zh.md',
         'index.html', 'ru/index.html', 'fa/index.html', 'zh/index.html',
         'door.css', 'door.js']


def checksum(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def install(build, destination, backup_root, installed_state):
    expected = (build / 'source.sha256').read_text().strip()
    if checksum(destination / 'readme.md') != expected:
        raise ValueError('English source changed after the build; rebuild first')
    previous = json.loads(installed_state.read_text()) if installed_state.exists() else {}
    # Preflight all files before any destination writes.
    for relative in FILES:
        if not (build / 'public' / relative).is_file():
            raise ValueError(f'Incomplete build: {relative}')
        target = destination / relative
        if target.exists() and relative != 'readme.md':
            if previous.get(relative) != checksum(target):
                raise ValueError(f'Unmanaged or edited output: {target}; review before replacing')
    backup = backup_root / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    for relative in FILES:
        target = destination / relative
        if target.exists():
            saved = backup / relative
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, saved)
    for relative in FILES:
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(target.suffix + '.next')
        shutil.copyfile(build / 'public' / relative, temporary)
        temporary.chmod(0o644)
        temporary.replace(target)
    installed_state.parent.mkdir(parents=True, exist_ok=True)
    installed_state.write_text(json.dumps({p: checksum(destination / p) for p in FILES}, indent=2) + '\n')
    print(f'Installed {len(FILES)} files in {destination}. Backup: {backup}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build', type=Path, default=Path('tmp/door'))
    parser.add_argument('--destination', type=Path, default=Path('/my/md/door'))
    parser.add_argument('--backups', type=Path, default=Path('tmp/door-backups'))
    parser.add_argument('--installed-state', type=Path, default=Path('tmp/door-installed.json'))
    args = parser.parse_args()
    install(args.build, args.destination, args.backups, args.installed_state)


if __name__ == '__main__':
    main()
