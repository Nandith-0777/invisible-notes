const test = require("node:test");
const assert = require("node:assert/strict");
const { metadata } = require("../scripts/release-metadata");

test("one app version produces one release tag for every installer", () => {
  assert.deepEqual(metadata("1.3.0-beta.1", "refs/heads/develop"), {
    version: "1.3.0-beta.1",
    tag: "v1.3.0-beta.1",
    prerelease: true,
  });
  assert.equal(metadata("1.3.0", "refs/tags/v1.3.0").prerelease, false);
});

test("mismatched tags cannot publish installers under another version", () => {
  assert.throws(() => metadata("1.3.0", "refs/tags/v1.2.2"), /must match/);
  assert.throws(() => metadata("bad\nversion"), /Unsupported/);
});
