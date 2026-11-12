#!/usr/bin/env bash
set -euo pipefail
: "${GH_REPO:?}" "${GITHUB_SHA:?}" "${RELEASE_TAG:?}" "${RELEASE_VERSION:?}" "${IS_PRERELEASE:?}"

# A missing tag is normal for a first draft; network errors must still stop publishing.
remote_refs=$(git ls-remote --tags origin "refs/tags/$RELEASE_TAG" "refs/tags/$RELEASE_TAG^{}")
if [[ -n "$remote_refs" ]]; then
  tag_sha=$(printf '%s\n' "$remote_refs" | tail -n 1 | awk '{print $1}')
  [[ "$tag_sha" == "$GITHUB_SHA" ]] || { echo 'Tag points to a different source commit'; exit 1; }
fi
if existing=$(gh release view "$RELEASE_TAG" --json isDraft --jq .isDraft 2>/dev/null); then
  [[ "$existing" == true ]] || { echo 'Refusing to overwrite a published release'; exit 1; }
  gh release edit "$RELEASE_TAG" --target "$GITHUB_SHA" --notes-file .github/release-notes.md
else
  options=(--draft --target "$GITHUB_SHA" --title "Ghost Notes $RELEASE_VERSION" --notes-file .github/release-notes.md)
  [[ "$IS_PRERELEASE" != true ]] || options+=(--prerelease)
  gh release create "$RELEASE_TAG" "${options[@]}"
fi
assets=(release-assets/*)
[[ -f "${assets[0]}" ]] || { echo 'No installer assets available'; exit 1; }
gh release upload "$RELEASE_TAG" "${assets[@]}" --clobber
