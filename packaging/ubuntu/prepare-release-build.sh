#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run with sudo on the Ubuntu 24.04 build machine'; exit 1; }
. /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 24.04 && $(dpkg --print-architecture) == amd64 ]] || {
  echo 'The Ubuntu installer must be built on Ubuntu 24.04 amd64'; exit 1;
}
version=46.2-1ubuntu0.24.04.18
python3 - <<'PY'
from pathlib import Path
import re
source = Path('/etc/apt/sources.list.d/ubuntu.sources')
if not source.exists():
    raise SystemExit('Expected Ubuntu DEB822 source configuration')
Path('/etc/apt/sources.list.d/ghost-notes-build.sources').write_text(
    re.sub(r'^Types:.*$', 'Types: deb-src', source.read_text(), flags=re.M)
)
PY
export DEBIAN_FRONTEND=noninteractive
apt-get update -o Acquire::Retries=3
# Matching stock libraries provide ABI dependencies and symbol metadata.
apt-get install -y --no-install-recommends \
  "libmutter-14-0=$version" "mutter-common=$version" "mutter-common-bin=$version"
DEB_BUILD_PROFILES='nocheck nodoc' apt-get build-dep -y --no-install-recommends "mutter=$version"
apt-get install -y --no-install-recommends meson ninja-build build-essential pkg-config dpkg-dev xz-utils
