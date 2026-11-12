const fs = require("node:fs");
const { version } = require("../package.json");

function metadata(appVersion, ref = "") {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/.test(appVersion))
    throw new Error("Unsupported release version");
  const tag = `v${appVersion}`;
  if (ref.startsWith("refs/tags/") && ref !== `refs/tags/${tag}`)
    throw new Error(`Release tag must match package.json: ${tag}`);
  return { version: appVersion, tag, prerelease: appVersion.includes("-") };
}

if (require.main === module) {
  const result = metadata(version, process.env.GITHUB_REF);
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(result)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(""),
    );
  console.log(JSON.stringify(result));
}

module.exports = { metadata };
