#!/usr/bin/env python3
"""Export the matching native binary, full corresponding source and dependencies."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[2]
MUTTER = '46.2-1ubuntu0.24.04.18'
LIBRARY = 'libmutter-14.so.0.0.0'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare(work, electron, output):
    build = json.loads((work / 'build-manifest.json').read_text())
    if build['mutterSourceVersion'] != MUTTER:
        raise ValueError('Unsupported Mutter build revision')
    relative = 'lib/x86_64-linux-gnu/' + LIBRARY
    binary = work / 'stage/usr' / relative
    if digest(binary) != build['libraries'][relative]:
        raise ValueError('Staged native binary differs from its build manifest')
    source = work / 'source/mutter-46.2'
    if not (source / 'src/compositor/meta-window-actor.c').exists():
        raise ValueError('Full corresponding Mutter source is required')
    if 'GHOST_NOTES_CAPTURE' not in (source / 'src/compositor/meta-window-actor.c').read_text():
        raise ValueError('Mutter source has not been patched')
    dependencies = subprocess.check_output([
        'python3', str(ROOT / 'packaging/ubuntu/runtime-dependencies.py'),
        '--library', str(binary), '--electron', str(electron),
    ], text=True).strip()
    output.mkdir(parents=True, exist_ok=True)
    shutil.copy2(binary, output / LIBRARY)
    archive = output / 'mutter-source.tar.xz'

    def source_only(info):
        parts = Path(info.name).parts
        return None if '_ghostnotes' in parts or '__pycache__' in parts else info

    with tarfile.open(archive, 'w:xz') as bundle:
        bundle.add(source, arcname='mutter-46.2', filter=source_only)
        for name in ['apply-mutter-patch.py', 'build-user.sh', 'README.md']:
            bundle.add(ROOT / 'integrations/gnome-capture' / name,
                       arcname='mutter-46.2/ghost-notes-build-instructions/' + name)
        bundle.add(ROOT / 'packaging/ubuntu/prepare-release-build.sh',
                   arcname='mutter-46.2/ghost-notes-build-instructions/prepare-release-build.sh')
    manifest = {
        'protocol': 1, 'provider': 'gnome-mutter', 'sourceVersion': MUTTER,
        'experimental': True, 'sha256': digest(output / LIBRARY),
        'sourceSha256': digest(archive), 'runtimeDependencies': dependencies,
    }
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path, required=True)
    parser.add_argument('--electron', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    prepare(args.work.resolve(), args.electron.resolve(), args.output.resolve())
