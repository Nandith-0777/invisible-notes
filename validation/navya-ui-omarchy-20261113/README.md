# Navya UI on Omarchy

Restores the original note and manager appearance from upstream commit `3410262`
while preserving Linux dragging, resizing, click-through toolbar recovery,
modifier-based shortcut recording, and capture exclusion. Linux delete
confirmations use a dialog inside the manager to avoid misplaced desktop dialogs.

The redesigned interface remains saved on `design/nandith-ui-saved-20261113`.
The original installed app and notes profile were also privately backed up before
applying the change. No private notes, logs, credentials, or backups are included
in this validation folder.

Synthetic-profile checks passed for real pointer click-through and toolbar
recovery, dragging, resize settling, ghost-mode colour menus, and collapse/expand.
Capture comparison found zero differing pixels against the unobstructed public
background with protection continuously enabled. Confirmation checks verified
placement, Escape, Cancel, and deletion of a disposable workspace.

The user subsequently verified the restored design on both Omarchy and the
Ubuntu VM. See the adjacent Ubuntu validation folder for its independent native
mouse, encrypted-profile, and Mutter/PipeWire checks.
