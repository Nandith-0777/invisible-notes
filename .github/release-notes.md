One shared Ghost Notes codebase, with separate installers for each platform.

| Platform                       | Download                                |
| ------------------------------ | --------------------------------------- |
| Windows                        | `Ghost-Notes-Setup-…exe`                |
| macOS, Intel and Apple Silicon | `Ghost-Notes-…-universal.dmg` or `.zip` |
| Ubuntu 24.04, amd64            | `Ghost-Notes-…-ubuntu-24.04-amd64.deb`  |

The Ubuntu preview bundles Electron and the capture integration. It requires
the default GNOME Wayland desktop and Mutter `46.2-1ubuntu0.24.04.18`.
Install the `.deb`, then save work and restart Ubuntu before opening Ghost Notes.
No Git, Node.js, npm or compiler is needed to install it. Other Ubuntu/compositor
versions are not supported by this preview. The matching modified Mutter source
is included inside the `.deb` and provided as a separate source archive.

macOS and Windows signing depends on the release certificates configured by the
maintainer. An unsigned preview can trigger the operating system's normal
publisher checks. Capture protection depends on the platform and capture method;
direct X11/KMS recording and ordinary GNOME screenshots are outside the Ubuntu
integration's scope.

Main developer: Navya Bijoy. Co-developer and Linux integration: Nandith Narayanan.
