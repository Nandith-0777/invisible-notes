const isMac = process.platform === "darwin";
const isWindows = process.platform === "win32";
const isLinux = process.platform === "linux";
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const DESKTOP_ID = "com.invisiblenotes.app.desktop";
const NOTE_TITLE = "Ghost Notes Note";
let linuxBackend = null;
let compositorMask = false;
let storageStatus = { encrypted: false, backend: "unavailable" };
let shortcutStatus = "not-registered";
let desktopCommand = null;
let compositorBinding = null;
let shortcutConflict = false;

function configureApp(app, env = process.env) {
  if (env.GHOST_NOTES_DATA_DIR) {
    fs.mkdirSync(env.GHOST_NOTES_DATA_DIR, { recursive: true, mode: 0o700 });
    app.setPath("userData", path.resolve(env.GHOST_NOTES_DATA_DIR));
  }
  if (!isLinux) return;
  if (!app.commandLine.hasSwitch("class"))
    app.commandLine.appendSwitch("class", "com.invisiblenotes.app");
  app.setDesktopName(DESKTOP_ID);
  if (typeof app.getAppPath === "function") {
    const quote = (value) => "'" + value.replace(/'/g, "'\\''") + "'";
    const executable = [
      process.execPath,
      ...(app.isPackaged ? [] : [app.getAppPath()]),
      "--ozone-platform=x11",
      "--class=com.invisiblenotes.app",
      "--new-note",
    ];
    desktopCommand = executable.map(quote).join(" ");
    if (env.GHOST_NOTES_DATA_DIR)
      desktopCommand =
        "env GHOST_NOTES_DATA_DIR=" +
        quote(env.GHOST_NOTES_DATA_DIR) +
        " " +
        desktopCommand;
  }
  // Native Wayland forbids the positioning and sizing bubble mode needs.
  if (!app.commandLine.hasSwitch("ozone-platform") && env.DISPLAY) {
    app.commandLine.appendSwitch("ozone-platform", "x11");
  }
  linuxBackend =
    app.commandLine.getSwitchValue("ozone-platform") ||
    (env.WAYLAND_DISPLAY ? "wayland" : "x11");
  if (
    !app.commandLine.hasSwitch("password-store") &&
    !/kde/i.test(env.XDG_CURRENT_DESKTOP || "")
  ) {
    app.commandLine.appendSwitch("password-store", "gnome-libsecret");
  }
  const features = app.commandLine
    .getSwitchValue("enable-features")
    .split(",")
    .filter(Boolean);
  for (const feature of [
    "GlobalShortcutsPortal",
    "GlobalShortcutsPortalPreferredTrigger",
  ]) {
    if (!features.includes(feature)) features.push(feature);
  }
  app.commandLine.appendSwitch("enable-features", features.join(","));
}

function launchArguments(args, env = process.env) {
  if (!isLinux) return args;
  const result = [...args];
  if (
    !result.some(
      (arg) =>
        arg === "--ozone-platform" || arg.startsWith("--ozone-platform="),
    ) &&
    env.DISPLAY
  ) {
    result.push("--ozone-platform=x11");
  }
  if (!result.some((arg) => arg === "--class" || arg.startsWith("--class="))) {
    result.push("--class=com.invisiblenotes.app");
  }
  return result;
}

function noteWindowOptions() {
  return isLinux ? { title: NOTE_TITLE, type: "utility" } : {};
}

function installDesktopIntegration() {
  if (!isLinux || !process.env.HYPRLAND_INSTANCE_SIGNATURE) return false;
  try {
    const code = fs.readFileSync(
      path.join(__dirname, "integrations", "hyprland.lua"),
      "utf8",
    );
    const result = execFileSync("hyprctl", ["eval", "do\n" + code + "\nend"], {
      encoding: "utf8",
      timeout: 2500,
      stdio: ["ignore", "pipe", "pipe"],
    });
    compositorMask = !/error:/i.test(result);
  } catch (error) {
    compositorMask = false;
    console.warn("Hyprland integration unavailable:", error.message);
  }
  return compositorMask;
}

function createStorageCodec(safeStorage) {
  const backend =
    isLinux && safeStorage?.getSelectedStorageBackend
      ? safeStorage.getSelectedStorageBackend()
      : "os-keychain";
  const available =
    !!safeStorage?.isEncryptionAvailable?.() && backend !== "basic_text";
  storageStatus = {
    encrypted: available,
    backend: available ? backend : "unavailable",
  };
  return available
    ? {
        encrypt: (plain) => safeStorage.encryptString(plain),
        decrypt: (cipher) => safeStorage.decryptString(cipher),
      }
    : null;
}

function registerCompositorShortcut(accelerator) {
  shortcutConflict = false;
  if (!isLinux || !process.env.HYPRLAND_INSTANCE_SIGNATURE || !desktopCommand)
    return false;
  const parts = accelerator.split("+");
  const key = parts.pop();
  const masks = {
    CommandOrControl: 4,
    CmdOrCtrl: 4,
    Control: 4,
    Ctrl: 4,
    Alt: 8,
    Option: 8,
    Shift: 1,
    Super: 64,
    Meta: 64,
  };
  if (
    !/^(?:[A-Za-z0-9]|F(?:[1-9]|1[0-2]))$/.test(key) ||
    parts.some((p) => !masks[p])
  )
    return false;
  const mask = parts.reduce((value, p) => value | masks[p], 0);
  const description = "Ghost Notes global new note";
  try {
    const binds = JSON.parse(
      execFileSync("hyprctl", ["binds", "-j"], {
        encoding: "utf8",
        timeout: 2500,
      }),
    );
    const matches = binds.filter(
      (b) =>
        b.modmask === mask && String(b.key).toUpperCase() === key.toUpperCase(),
    );
    if (matches.some((b) => b.description !== description)) {
      shortcutConflict = true;
      return false;
    }
    if (matches.some((b) => b.description === description)) {
      compositorBinding = accelerator;
      return true;
    }
    const mods = [
      [4, "CTRL"],
      [8, "ALT"],
      [1, "SHIFT"],
      [64, "SUPER"],
    ]
      .filter(([m]) => mask & m)
      .map(([, n]) => n);
    const keys = [...mods, key.toUpperCase()].join(" + ");
    const lua = `if ghost_notes_shortcut then ghost_notes_shortcut:unbind() end; ghost_notes_shortcut = hl.bind(${JSON.stringify(keys)}, hl.dsp.exec_cmd(${JSON.stringify(desktopCommand)}), { description = ${JSON.stringify(description)} })`;
    const result = execFileSync("hyprctl", ["eval", lua], {
      encoding: "utf8",
      timeout: 2500,
    });
    if (/error:/i.test(result)) return false;
    compositorBinding = accelerator;
    return true;
  } catch {
    return false;
  }
}

function unregisterCompositorShortcut() {
  if (!compositorBinding) return;
  try {
    execFileSync(
      "hyprctl",
      [
        "eval",
        "if ghost_notes_shortcut then ghost_notes_shortcut:unbind(); ghost_notes_shortcut = nil end",
      ],
      { timeout: 2500, stdio: "ignore" },
    );
  } catch {
    /* The compositor may already have shut down. */
  }
  compositorBinding = null;
}

function setShortcutStatus(value) {
  shortcutStatus = value;
}

function runtimeStatus() {
  return {
    platform: isLinux ? "linux" : isMac ? "macos" : "windows",
    backend: isLinux ? linuxBackend : null,
    capture: {
      mode: isLinux
        ? compositorMask
          ? "compositor-mask"
          : "unsupported"
        : "os-content-protection",
      message: captureExclusionCaveat(),
    },
    storage: { ...storageStatus },
    globalShortcut: shortcutStatus,
  };
}

function installLinuxDesktop({ home, electronPath, hyprland = false }) {
  if (!isLinux) throw new Error("This setup command is for Linux only.");
  const config = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  const data = process.env.XDG_DATA_HOME || path.join(home, ".local", "share");
  const hyprConfig = path.join(config, "hypr", "hyprland.lua");
  if (hyprland && !fs.existsSync(hyprConfig)) {
    throw new Error(
      "Hyprland Lua configuration was not found. See LINUX.md for other desktops and older Hyprland versions.",
    );
  }
  const bin = path.join(home, ".local", "bin");
  const applications = path.join(data, "applications");
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(applications, { recursive: true });
  const quote = (value) => "'" + value.replace(/'/g, "'\\''") + "'";
  const launcher = path.join(bin, "ghost-notes");
  fs.writeFileSync(
    launcher,
    `#!/bin/sh\nexec ${quote(electronPath)} ${quote(__dirname)} --ozone-platform=x11 --class=com.invisiblenotes.app "$@"\n`,
    { mode: 0o755 },
  );
  fs.chmodSync(launcher, 0o755);
  // Desktop Exec is not a shell command; quote its path separately.
  const exec =
    '"' +
    launcher.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/%/g, "%%") +
    '"';
  const desktop = path.join(applications, DESKTOP_ID);
  fs.writeFileSync(
    desktop,
    `[Desktop Entry]\nType=Application\nName=Ghost Notes (Linux)\nComment=Local notes with desktop-dependent capture protection\nExec=${exec}\nIcon=${path.join(__dirname, "build", "icon.png")}\nTerminal=false\nCategories=Office;Utility;\nStartupWMClass=com.invisiblenotes.app\nActions=NewNote;\n\n[Desktop Action NewNote]\nName=New Note\nExec=${exec} --new-note\n`,
  );
  if (hyprland) {
    const rules = path.join(config, "hypr", "ghost-notes.lua");
    const source = fs.readFileSync(
      path.join(__dirname, "integrations", "hyprland.lua"),
    );
    if (fs.existsSync(rules) && !fs.readFileSync(rules).equals(source)) {
      fs.copyFileSync(rules, rules + `.backup-${Date.now()}`);
    }
    fs.writeFileSync(rules, source);
    const original = fs.readFileSync(hyprConfig, "utf8");
    const line =
      'dofile((os.getenv("XDG_CONFIG_HOME") or (os.getenv("HOME") .. "/.config")) .. "/hypr/ghost-notes.lua")';
    if (!original.includes(line)) {
      fs.copyFileSync(hyprConfig, hyprConfig + `.backup-${Date.now()}`);
      fs.appendFileSync(
        hyprConfig,
        "\n-- Ghost Notes desktop integration\n" + line + "\n",
      );
    }
  }
  return { launcher, desktop, hyprland };
}

function hideDockIconIfMac(app) {
  if (isMac && app.dock) app.dock.hide();
}

function isCommandOrControlPressed(input) {
  return isMac
    ? !!input.meta && !input.control
    : !!input.control && !input.meta;
}

const MAC_SYMBOLS = {
  CommandOrControl: "⌘",
  CmdOrCtrl: "⌘",
  Command: "⌘",
  Cmd: "⌘",
  Control: "⌃",
  Ctrl: "⌃",
  Alt: "⌥",
  Option: "⌥",
  Shift: "⇧",
};
const MAC_MODIFIER_ORDER = ["⌃", "⌥", "⇧", "⌘"];
const WINDOWS_NAMES = {
  CommandOrControl: "Ctrl",
  CmdOrCtrl: "Ctrl",
  Command: "Ctrl",
  Cmd: "Ctrl",
  Control: "Ctrl",
  Ctrl: "Ctrl",
  Alt: "Alt",
  Option: "Alt",
  Shift: "Shift",
};

function displayKey(part) {
  return part.length === 1 ? part.toUpperCase() : part;
}

function formatAccelerator(accelerator) {
  const parts = String(accelerator || "")
    .split("+")
    .filter(Boolean);
  if (parts.length === 0) return "";
  if (isMac) {
    const symbols = parts.map((part) => MAC_SYMBOLS[part] || displayKey(part));
    const modifiers = symbols
      .filter((symbol) => MAC_MODIFIER_ORDER.includes(symbol))
      .sort(
        (a, b) => MAC_MODIFIER_ORDER.indexOf(a) - MAC_MODIFIER_ORDER.indexOf(b),
      );
    const keys = symbols.filter(
      (symbol) => !MAC_MODIFIER_ORDER.includes(symbol),
    );
    return modifiers.join("") + keys.join("");
  }
  return parts.map((part) => WINDOWS_NAMES[part] || displayKey(part)).join("+");
}

function setPinned(win, pinned) {
  if (pinned) {
    win.setAlwaysOnTop(true, "screen-saver");
    if (isMac)
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreenSpaces: true });
  } else {
    win.setAlwaysOnTop(false);
    if (isMac) win.setVisibleOnAllWorkspaces(false);
  }
}

function captureExclusionCaveat() {
  if (isLinux) {
    return compositorMask
      ? "Hyprland capture masking is requested. Supported compositor capture paths may show a black rectangle. GPU/KMS recorders can still capture notes. Verify your sharing application before use."
      : "Screen-capture exclusion is unavailable on this Linux desktop. Notes may appear in recordings and screen shares.";
  }
  if (isWindows) {
    return "Screen-capture exclusion requires Windows 10 (build 19041) or later. On older Windows versions, notes may be visible to screen recordings.";
  }
  return null;
}

module.exports = {
  isMac,
  isWindows,
  isLinux,
  configureApp,
  launchArguments,
  installLinuxDesktop,
  noteWindowOptions,
  installDesktopIntegration,
  createStorageCodec,
  runtimeStatus,
  setShortcutStatus,
  registerCompositorShortcut,
  unregisterCompositorShortcut,
  hasShortcutConflict: () => shortcutConflict,
  hideDockIconIfMac,
  isCommandOrControlPressed,
  formatAccelerator,
  setPinned,
  captureExclusionCaveat,
};
