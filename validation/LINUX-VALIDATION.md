# Linux validation — 29 October 2026

Environment: Omarchy 4.0.4, kernel 7.2.5-3-omarchy, Hyprland 0.56.2,
1920×1080 internal display at 1.25 scaling, Intel integrated graphics.
Runtime: Electron 43.6.0, X11/XWayland. Test data was isolated under `/tmp`.

## Verified on this machine

- Notes open as floating XWayland utility windows without a manual float step.
- Rich-text editor rendering and state updates; color, transparency, text size
  and monospace controls.
- Collapse to a 48×48 Electron-client bubble and restore with content intact.
- PNG clipboard-event paste saves an image and associates it with the note.
- Pin and ghost controls change persisted state. End-to-end mouse forwarding
  and fullscreen stacking were not established by the state assertions.
- `--new-note` creates a note while another Wayland application has focus.
- Ctrl+Shift+M opens the manager through keyboard delivery.
- Manager rename, workspace creation, theme switching, hide and reopen.
- The global Ctrl+Alt+Shift+N shortcut creates exactly one note when a different
  Wayland app has focus. This was tested through a temporary client of the
  compositor's virtual-keyboard protocol, not by directly invoking the handler.
- Existing test records survive closing the source app and launching the packaged
  app. `gnome_libsecret` encryption is active, the stored file begins with `v11`,
  the plaintext marker is absent, and permissions are 0600.
- Export writes a valid JSON backup; merge import adds a distinct record. Native
  dialog selections were stubbed in the isolated main process; the native file
  chooser UI was not evaluated end to end. Original dialog functions were restored.
- With `no_screen_share` enabled, a note-only `grim` capture is black in its center.
  Disabling the integration rule makes the same region capture the note. This
  establishes masking for this compositor capture path, not for every recorder.
- A direct GPU/KMS recording still includes the note while compositor masking
  is enabled. Only the note region was retained; the full-desktop temporary
  recording was deleted. See `kms-results.json` and `kms-note-only.png`.
- User-local installation, idempotent setup behavior, config backup, and a clean
  `hyprctl reload` / `hyprctl configerrors` result.
- Linux application-directory packaging and a packaged-app launch.

See the adjacent JSON results and two note-only capture images. Screenshots are
of disposable test notes; no user notes database or full-desktop capture is included.

## Automated checks

The Node test run contains 99 tests: 92 passed, 7 platform-specific skips,
0 failures. The additional tests cover Linux launch flags, explicit option
preservation, keychain selection, rejecting `basic_text`, encrypted-file
preservation, encryption errors, installer idempotence and shortcut replacement.
Formatting passes with Prettier. Linux/Windows/macOS CI jobs are configured;
Windows and macOS GUI behavior was not exercised locally.

## Remaining parity gaps

- **Capture omission is not portable.** Hyprland provides black-rectangle masking
  on supported capture paths. Direct GPU/KMS recording can still capture the
  physical display, so the notes cannot be advertised as universally invisible.
- Native Wayland mode, non-Hyprland desktops, older Hyprland versions, multiple
  monitors, physical click-through recovery, fullscreen stacking and individual
  meeting apps require separate testing.
- The runtime compositor shortcut must be restored by restarting Ghost Notes
  after a Hyprland configuration reload. Persisted window rules survive reloads.
- If the desktop keychain is absent or locked, encryption cannot be silently
  promised; unreadable encrypted stores stop startup without modification.

This branch is a measured Linux implementation with explicit boundaries, not a
claim of complete feature parity across all Linux desktops.
