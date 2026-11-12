# Releasing Ghost Notes

## One source, one release, separate installers

The default `develop` branch contains the common application and all platform
integrations. Operating systems do not have separate release branches.

- Shared UI and storage: `main.js`, `note/`, `manager/`, `store.js`.
- OS differences: `platform.js`.
- Native Linux integrations: `integrations/gnome-capture/` and `integrations/hyprland-capture/`.
- Complete Ubuntu package: `packaging/ubuntu/`.

`.github/workflows/release.yml` builds Windows, macOS and Ubuntu from the same
commit and app version. It only creates the combined draft release after every
platform build succeeds. Windows uses NSIS `.exe`; macOS produces universal
`.dmg`/`.zip`; Ubuntu builds its native companion on `ubuntu-24.04` and includes
it with Electron in a `.deb`. The Ubuntu job also exports corresponding native
source. Ordinary Electron Linux packaging does not enable Ubuntu invisibility.

## Build a preview

1. Update `package.json` and the root version entries in `package-lock.json`.
2. Run formatting, app tests and installer transaction tests.
3. Push the default branch, then run **Build & Release** in GitHub Actions.
   Alternatively push a matching version tag, such as `v1.3.0-beta.1`.
4. Review the combined draft release, test the actual installers, and publish
   it when ready. Preview versions are marked prerelease; drafts are not public
   downloads. Published releases are never overwritten by the workflow.

A mismatched version tag is rejected. The first unified preview is
`1.3.0-beta.1`; the Debian version maps prerelease `-` to `~` and includes an
Ubuntu package revision. All three assets keep the same app version in their
filenames. `SHA256SUMS` covers the combined downloads.

The Ubuntu target remains limited to GNOME Wayland with Mutter
`46.2-1ubuntu0.24.04.18`. Supporting another revision requires rebuilding and
revalidation. Native build prerequisites are isolated to CI/the developer's
build machine, not installed on end-user machines. See [Ubuntu package
instructions](packaging/ubuntu/README.md).

## Signing status

Certificate configuration must be checked before claiming builds are signed.
The existing macOS configuration explicitly has `identity: null` and therefore
produces unsigned previews. Windows signing is enabled only when the matching
certificate secrets are configured. The workflow passes the existing signing
variables through to the platform builders.

## To sign & notarize macOS builds

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/) ($99/yr).
2. Create a **Developer ID Application** certificate in Xcode or the Apple Developer portal, export it as a `.p12` file with a password.
3. Base64-encode it: `base64 -i DeveloperID.p12 | pbcopy`
4. Add these repo secrets (Settings → Secrets and variables → Actions):
   - `MAC_CSC_LINK` — the base64 `.p12` contents
   - `MAC_CSC_KEY_PASSWORD` — the `.p12` export password
   - `APPLE_ID` — your Apple ID email
   - `APPLE_APP_SPECIFIC_PASSWORD` — an [app-specific password](https://support.apple.com/en-us/102654) for that Apple ID
   - `APPLE_TEAM_ID` — your Apple Developer Team ID

electron-builder auto-signs and auto-notarizes when these are present (`build/entitlements.mac.plist` and `hardenedRuntime: true` are already configured in `package.json`) — but you must also **remove `"identity": null` from `package.json`'s `build.mac` block first**. It's there to force-skip signing on CI runners, which otherwise pick up a stray ambient keychain identity and fail the build with no password to use. Leaving it in place after adding real certs will keep builds unsigned.

## To sign Windows builds

1. Buy a code-signing certificate (EV or standard OV) from a CA (DigiCert, SSL.com, etc.) — EV avoids SmartScreen reputation warnings almost immediately, OV takes longer to build reputation.
2. Export it as a `.pfx`, base64-encode it.
3. Add repo secrets:
   - `WIN_CSC_LINK` — base64 `.pfx` contents
   - `WIN_CSC_KEY_PASSWORD` — the `.pfx` password

No other changes needed — the workflow already passes these through.

## Cutting a release

```bash
npm version patch   # or minor / major — updates package.json + creates a git tag
git push && git push --tags
```

The tag push triggers the build/publish workflow. The website (`docs/`) reads the latest GitHub Release via the GitHub API at page-load time, so it never needs updating for a new version — no hardcoded download URLs anywhere.

## Auto-updates (not implemented yet)

`build.publish` is already set to `{ "provider": "github" }`, which is the prerequisite for `electron-updater`. To add in-app auto-updates later: install `electron-updater`, call `autoUpdater.checkForUpdatesAndNotify()` on launch. Not added now to avoid over-engineering a first release — but nothing here needs to change to add it.
