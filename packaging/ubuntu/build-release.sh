#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root"
. /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 24.04 && $(uname -m) == x86_64 ]] || {
  echo 'Build this installer on Ubuntu 24.04 amd64'; exit 1;
}
# Electron 43 downloads lazily; materialize the runtime before inspecting ELF dependencies.
node node_modules/electron/install.js
version=46.2-1ubuntu0.24.04.18
work="$HOME/ghost-notes-gnome"
mkdir -p "$work"
cp integrations/gnome-capture/{build-user.sh,apply-mutter-patch.py} "$work/"
sudo bash packaging/ubuntu/prepare-release-build.sh
bash "$work/build-user.sh" "$version"
python3 packaging/ubuntu/prepare-companion.py \
  --work "$work" --electron "$root/node_modules/electron/dist" --output "$root/out/ubuntu-companion"
python3 packaging/ubuntu/build-deb.py \
  --electron "$root/node_modules/electron/dist" --companion "$root/out/ubuntu-companion" --output "$root/dist"
app_version=$(node -p 'require("./package.json").version')
cp out/ubuntu-companion/mutter-source.tar.xz "dist/Ghost-Notes-${app_version}-ubuntu-mutter-source.tar.xz"
