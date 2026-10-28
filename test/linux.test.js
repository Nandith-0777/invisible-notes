const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { NoteStore } = require("../store");

function platformFor(platform, overrides = {}, env = {}) {
  const context = {
    module: { exports: {} },
    require: (name) => overrides[name] || require(name),
    process: { platform, env, execPath: "/test/electron" },
    __dirname: path.resolve(__dirname, ".."),
    console: { warn() {} },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../platform.js"), "utf8"),
    context,
  );
  return context.module.exports;
}

function fakeApp(initial = {}) {
  const switches = new Map(Object.entries(initial));
  return {
    switches,
    setDesktopName(value) {
      this.desktopName = value;
    },
    commandLine: {
      hasSwitch: (key) => switches.has(key),
      getSwitchValue: (key) => switches.get(key) || "",
      appendSwitch: (key, value) => switches.set(key, value),
    },
  };
}

test("Linux defaults to XWayland for positioning and enables portal support", () => {
  const platform = platformFor("linux");
  const app = fakeApp({ "enable-features": "ExistingFeature" });
  platform.configureApp(app, { DISPLAY: ":0", WAYLAND_DISPLAY: "wayland-1" });
  assert.equal(app.desktopName, "com.invisiblenotes.app.desktop");
  assert.equal(app.switches.get("ozone-platform"), "x11");
  assert.equal(app.switches.get("password-store"), "gnome-libsecret");
  assert.ok(app.switches.get("enable-features").includes("ExistingFeature"));
  assert.ok(
    app.switches.get("enable-features").includes("GlobalShortcutsPortal"),
  );
});

test("explicit backend, keychain and feature choices are preserved", () => {
  const platform = platformFor("linux");
  const app = fakeApp({
    "ozone-platform": "wayland",
    "password-store": "kwallet6",
  });
  platform.configureApp(app, { DISPLAY: ":0" });
  assert.equal(platform.runtimeStatus().backend, "wayland");
  assert.equal(app.switches.get("password-store"), "kwallet6");
});

test("non-Linux initialization does not change desktop switches", () => {
  for (const os of ["darwin", "win32"]) {
    const p = platformFor(os);
    const app = fakeApp();
    p.configureApp(app, {});
    assert.equal(app.switches.size, 0);
    assert.deepEqual(Object.keys(p.noteWindowOptions()), []);
  }
});

test("KDE keeps automatic KWallet selection", () => {
  const app = fakeApp();
  platformFor("linux").configureApp(app, {
    XDG_CURRENT_DESKTOP: "KDE",
    DISPLAY: ":0",
  });
  assert.equal(app.switches.has("password-store"), false);
});

test("basic_text is never presented as OS-backed encryption", () => {
  const p = platformFor("linux");
  const codec = p.createStorageCodec({
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => "basic_text",
  });
  assert.equal(codec, null);
  assert.equal(p.runtimeStatus().storage.encrypted, false);
});

test("Linux keychain codec encrypts and decrypts through safeStorage", () => {
  const p = platformFor("linux");
  const codec = p.createStorageCodec({
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => "gnome_libsecret",
    encryptString: (value) => Buffer.from("encrypted:" + value),
    decryptString: (value) => value.toString().slice(10),
  });
  assert.equal(codec.decrypt(codec.encrypt("private")), "private");
  assert.equal(p.runtimeStatus().storage.backend, "gnome_libsecret");
});

test("unsupported Linux capture paths are reported honestly", () => {
  const p = platformFor("linux");
  assert.equal(p.runtimeStatus().capture.mode, "unsupported");
  assert.match(p.captureExclusionCaveat(), /may appear/);
});

test("Linux note identity is stable and uses utility window semantics", () => {
  const p = platformFor("linux");
  assert.equal(p.noteWindowOptions().title, "Ghost Notes Note");
  assert.equal(p.noteWindowOptions().type, "utility");
  const lua = fs.readFileSync(
    path.join(__dirname, "../integrations/hyprland.lua"),
    "utf8",
  );
  assert.match(lua, /initial_title = "\^Ghost Notes Note\$"/);
});

test("encrypted notes are preserved if the keychain is unavailable", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ghost-locked-"));
  try {
    const file = path.join(dir, "notes.json");
    const raw = Buffer.from("v10encrypted-note-content");
    fs.writeFileSync(file, raw);
    assert.throws(() => new NoteStore(dir), /Unlock the desktop keychain/);
    assert.deepEqual(fs.readFileSync(file), raw);
    assert.equal(fs.existsSync(file + ".corrupt"), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("failed decryption does not silently reset an encrypted store", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ghost-decrypt-"));
  try {
    const file = path.join(dir, "notes.json");
    fs.writeFileSync(file, Buffer.from([0, 1, 2, 3]));
    assert.throws(
      () =>
        new NoteStore(dir, {
          codec: {
            decrypt() {
              throw new Error("keychain locked");
            },
            encrypt() {},
          },
        }),
      /could not be decrypted/,
    );
    assert.deepEqual(fs.readFileSync(file), Buffer.from([0, 1, 2, 3]));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("encryption failure is reported through onWriteError instead of crashing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ghost-encrypt-"));
  let failed = false;
  const store = new NoteStore(dir, {
    codec: {
      encrypt() {
        throw new Error("keychain unavailable");
      },
      decrypt() {},
    },
    onWriteError: () => {
      failed = true;
    },
  });
  try {
    store.create({ text: "retain in memory" });
    assert.doesNotThrow(() => store.flush());
    assert.equal(failed, true);
    assert.equal(store.all()[0].text, "retain in memory");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("launch arguments choose X11 before Electron starts", () => {
  const p = platformFor("linux");
  const args = p.launchArguments(["--new-note"], { DISPLAY: ":0" });
  assert.ok(args.includes("--ozone-platform=x11"));
  assert.ok(args.includes("--new-note"));
  const explicit = p.launchArguments(["--ozone-platform=wayland"], {
    DISPLAY: ":0",
  });
  assert.equal(
    explicit.filter((arg) => arg.startsWith("--ozone-platform=")).length,
    1,
  );
});

test("desktop setup is idempotent and keeps a backup of the Hyprland config", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ghost-install-"));
  const config = path.join(home, ".config");
  fs.mkdirSync(path.join(config, "hypr"), { recursive: true });
  const main = path.join(config, "hypr", "hyprland.lua");
  fs.writeFileSync(main, "-- existing user settings\n");
  const p = platformFor("linux");
  try {
    p.installLinuxDesktop({
      home,
      electronPath: "/opt/Some App/electron",
      hyprland: true,
    });
    p.installLinuxDesktop({
      home,
      electronPath: "/opt/Some App/electron",
      hyprland: true,
    });
    const text = fs.readFileSync(main, "utf8");
    assert.equal(text.split("dofile(").length - 1, 1);
    assert.ok(text.startsWith("-- existing user settings"));
    assert.ok(
      fs
        .readdirSync(path.dirname(main))
        .some((name) => name.includes(".backup-")),
    );
    assert.match(
      fs.readFileSync(path.join(home, ".local/bin/ghost-notes"), "utf8"),
      /'\/opt\/Some App\/electron'/,
    );
    assert.ok(
      fs.existsSync(
        path.join(
          home,
          ".local/share/applications/com.invisiblenotes.app.desktop",
        ),
      ),
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("compositor shortcut conflicts are reported without taking over bindings", () => {
  const calls = [];
  const p = platformFor(
    "linux",
    {
      "node:child_process": {
        execFileSync(command, args) {
          calls.push(args[0]);
          if (args[0] === "binds")
            return JSON.stringify([
              { modmask: 13, key: "N", description: "Existing user shortcut" },
            ]);
          throw new Error("must not change compositor bindings");
        },
      },
    },
    { HYPRLAND_INSTANCE_SIGNATURE: "test-session" },
  );
  const app = fakeApp();
  app.getAppPath = () => "/test/ghost-notes";
  app.isPackaged = false;
  p.configureApp(app, { DISPLAY: ":0" });
  assert.equal(p.registerCompositorShortcut("Ctrl+Alt+Shift+N"), false);
  assert.equal(p.hasShortcutConflict(), true);
  assert.deepEqual(calls, ["binds"]);
});
