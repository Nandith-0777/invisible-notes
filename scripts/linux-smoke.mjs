import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const port = Number(process.env.GHOST_NOTES_TEST_PORT || 9341);
const output =
  process.env.GHOST_NOTES_TEST_OUTPUT || "/tmp/ghost-notes-linux-validation";
fs.mkdirSync(output, { recursive: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
async function pages() {
  return (await fetch(`http://127.0.0.1:${port}/json`)).json();
}
async function evaluate(match, expression) {
  const page = (await pages()).find((p) => p.url.includes(match));
  assert.ok(page, `Renderer not found: ${match}`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.addEventListener("open", r, { once: true });
    ws.addEventListener("error", j, { once: true });
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("Renderer request timed out"));
    }, 10000);
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      if (m.result?.exceptionDetails || m.error)
        reject(new Error(JSON.stringify(m)));
      else resolve(m.result?.result?.value);
    });
    ws.send(
      JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: { expression, awaitPromise: true, returnByValue: true },
      }),
    );
  });
}
function hy(expression) {
  return execFileSync("hyprctl", ["dispatch", expression], {
    encoding: "utf8",
  });
}
const first = (await pages()).find((p) => p.url.includes("note.html"));
assert.ok(first);
const id = new URL(first.url).searchParams.get("id");
const note = (expression) => evaluate(`id=${id}`, expression);
const state = () => note(`notes.getState(${JSON.stringify(id)})`);
async function check(name, fn) {
  const data = await fn();
  results.push({ name, result: "passed", data });
  console.log("PASS", name);
  fs.writeFileSync(
    path.join(output, "desktop-results.json"),
    JSON.stringify({ results }, null, 2),
  );
}
await check("runtime", async () => {
  const runtime = await note("notes.runtime()");
  assert.equal(runtime.backend, "x11");
  assert.equal(runtime.platform, "linux");
  return runtime;
});
await check("automatic floating", async () => {
  const clients = JSON.parse(execFileSync("hyprctl", ["clients", "-j"]));
  const windows = clients.filter(
    (c) =>
      c.class === "com.invisiblenotes.app" && c.title === "Ghost Notes Note",
  );
  assert.ok(windows.length);
  assert.ok(windows.every((w) => w.floating && w.xwayland));
  return windows.map((w) => ({ floating: w.floating, xwayland: w.xwayland }));
});
await check("rich-text edit and local state", async () => {
  await note(
    `(()=>{const e=document.querySelector('#text');e.innerHTML='<h2>Linux validation</h2><b>Private test marker 20261029</b><ul><li>Rich text works</li></ul>';e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await wait(600);
  const s = await state();
  assert.ok(s.text.includes("Private test marker 20261029"));
  assert.equal(s.rich, true);
  return { rich: s.rich };
});
await check("color and opacity", async () => {
  await note(
    `document.querySelector('[data-color="green"]').click();document.querySelector('#opacity').value=65;document.querySelector('#opacity').dispatchEvent(new Event('input',{bubbles:true}))`,
  );
  await wait(400);
  const s = await state();
  assert.equal(s.color, "green");
  assert.equal(s.opacity, 0.65);
  return { color: s.color, opacity: s.opacity };
});
await check("font and monospace", async () => {
  const before = await state();
  await note(
    `document.querySelector('#fontUp').click();document.querySelector('#mono').click()`,
  );
  await wait(400);
  const after = await state();
  assert.ok(after.fontSize > before.fontSize);
  assert.notEqual(after.monospace, before.monospace);
  return { fontSize: after.fontSize, monospace: after.monospace };
});
await check("collapse and restore without manual floating", async () => {
  const before = await state();
  await note(`notes.setCollapsed(${JSON.stringify(id)},true)`);
  await wait(300);
  const size = await note(`({width:innerWidth,height:innerHeight})`);
  assert.equal(size.width, 48);
  assert.equal(size.height, 48);
  await note(`notes.setCollapsed(${JSON.stringify(id)},false)`);
  await wait(300);
  assert.equal((await state()).text, before.text);
  return size;
});
await check("image paste", async () => {
  await note(
    `(()=>{const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='),c=>c.charCodeAt(0));const data=new DataTransfer();data.items.add(new File([bytes],'test.png',{type:'image/png'}));document.querySelector('#text').focus();document.querySelector('#text').dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));})()`,
  );
  await wait(900);
  const s = await state();
  assert.ok(s.images.length > 0);
  return { images: s.images.length };
});
await check("pin toggle", async () => {
  const s = await state();
  await note(`document.querySelector('#pin').click()`);
  await wait(200);
  assert.equal((await state()).pinned, !s.pinned);
  await note(`document.querySelector('#pin').click()`);
  return { stateChanged: true };
});
await check("ghost toggle", async () => {
  const s = await state();
  await note(`document.querySelector('#ghost').click()`);
  await wait(300);
  assert.notEqual((await state()).ghost, s.ghost);
  await note(`document.querySelector('#ghost').click()`);
  return {
    stateChanged: true,
    physicalRecovery: "not established by this automation",
  };
});
await check("new note command from another application", async () => {
  const before = (await pages()).filter((p) =>
    p.url.includes("note.html"),
  ).length;
  hy('hl.dsp.focus({ window = "class:org.omarchy.agent" })');
  execFileSync(process.execPath, ["scripts/start.js", "--new-note"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      GHOST_NOTES_DATA_DIR:
        process.env.GHOST_NOTES_DATA_DIR || "/tmp/ghost-notes-linux-test",
    },
    timeout: 15000,
  });
  await wait(500);
  const after = (await pages()).filter((p) =>
    p.url.includes("note.html"),
  ).length;
  assert.ok(after > before);
  return { created: after - before };
});
await check("manager shortcut", async () => {
  hy('hl.dsp.focus({ window = "class:com.invisiblenotes.app" })');
  hy(
    'hl.dsp.send_key_state({ mods = "CTRL SHIFT", key = "M", state = "down", window = "class:com.invisiblenotes.app" })',
  );
  hy(
    'hl.dsp.send_key_state({ mods = "CTRL SHIFT", key = "M", state = "up", window = "class:com.invisiblenotes.app" })',
  );
  await wait(600);
  const snapshot = await evaluate("manager.html", "manager.list()");
  assert.ok(snapshot.notes.some((n) => n.id === id));
  return { notes: snapshot.notes.length };
});
await check("rename, workspace and appearance", async () => {
  await evaluate(
    "manager.html",
    `manager.rename(${JSON.stringify(id)},'Linux validation note');manager.createWorkspace('Linux validation workspace');manager.setTheme('light')`,
  );
  await wait(500);
  const s = await evaluate("manager.html", "manager.list()");
  assert.equal(s.notes.find((n) => n.id === id).title, "Linux validation note");
  assert.ok(s.workspaces.some((w) => w.name === "Linux validation workspace"));
  assert.equal(s.theme, "light");
  await evaluate(
    "manager.html",
    `manager.setWorkspace('ws-default');manager.setTheme('system')`,
  );
  return { renamed: true, workspaceCreated: true, themeChanged: true };
});
await check("manager hide and reopen", async () => {
  await evaluate("manager.html", `manager.hide(${JSON.stringify(id)})`);
  await wait(200);
  assert.equal((await state()).visible, false);
  await evaluate("manager.html", `manager.open(${JSON.stringify(id)})`);
  await wait(300);
  assert.equal((await state()).visible, true);
  return { preserved: true };
});
await check("compositor protection property", async () => {
  const clients = JSON.parse(execFileSync("hyprctl", ["clients", "-j"]));
  const target = clients.find(
    (w) =>
      w.class === "com.invisiblenotes.app" && w.title === "Ghost Notes Note",
  );
  assert.ok(target);
  const prop = execFileSync(
    "hyprctl",
    ["getprop", `address:${target.address}`, "no_screen_share"],
    { encoding: "utf8" },
  ).trim();
  assert.equal(prop, "true");
  return {
    property: prop,
    coverage: "supported compositor capture paths only",
  };
});
fs.writeFileSync(
  path.join(output, "desktop-results.json"),
  JSON.stringify(
    {
      testedAt: new Date().toISOString(),
      profile:
        process.env.GHOST_NOTES_DATA_DIR || "/tmp/ghost-notes-linux-test",
      results,
    },
    null,
    2,
  ),
);
console.log("Saved", path.join(output, "desktop-results.json"));
