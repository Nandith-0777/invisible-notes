# Navya UI on the Ubuntu test VM

The Ubuntu test installer uses the same Navya UI restoration as the
`test/navya-ui-omarchy` worktree, based on upstream commit `3410262`.
Nandith's redesigned interface remains on `design/nandith-ui-saved-20261113`.
No upstream pull request or default branch change is part of this test.

Target: Ubuntu Desktop 24.04.5, GNOME 46, amd64, Mutter
`46.2-1ubuntu0.24.04.18` in the existing dedicated VM.

The original tested Ubuntu installer was extracted and its JavaScript runtime,
note and manager UI, and matching GNOME status/input-region helpers were replaced
from this worktree. Electron and the native Mutter capture companion were kept
from the original package. The separate test package is
`~/Downloads/ghost-notes-ubuntu_navya-ui_amd64.deb` inside the VM, version
`1.2.2+ubuntu24.04.2+navyaui1`. This is a local test package, not a published release.

The VM had no installed Ghost Notes application before this change. Any existing
normal profile was copied under `~/ghost-notes-backups/before-navya-ui/` with a
private parent directory. The previous installer remains in Downloads.
The missing declared `libdisplay-info1` dependency was installed and package
configuration completed. Ubuntu was restarted to activate the companion.

Application unit/integration suite: 143 tests, 136 passed, 7 skipped, 0 failed.
Live VM results are recorded separately after verification.

Navya's original toolbar does not contain the additional screen-sharing
visibility button from the saved redesign. Existing sharing preferences remain
in the backend; this UI change does not reset note data or those preferences.

Live VM verification passed:

- The original inline note and manager UI loaded successfully.
- A native XTest mouse click switched ghost mode off from its toolbar.
- Pin toggling updated the note state in both directions.
- Real Mutter/PipeWire capture of the private note region exactly matched the
  same region after hiding the note: zero differing bytes. The manager was
  hidden for both captures to keep the underlying fixture unchanged.
- The normal profile reopened with GNOME libsecret encryption, registered global
  shortcuts, capture mode `compositor-omit`, and no visible notes marked shared.
- The default keyring needed unlocking after the VM restart. It was unlocked
  with its existing password without resetting any secrets; the app was then
  restarted successfully.
- The app was finally restarted without a remote-debugging port. Synthetic test
  processes were closed; the normal manager remains open for manual testing.

This verifies the installed UI and compositor integration in the VM. A new live
Google Meet or Zoom call was not performed during this design-only change.
