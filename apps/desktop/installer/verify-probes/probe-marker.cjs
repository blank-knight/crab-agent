// verify-package gate3 probe: marker count in asar entry
// usage: node probe-marker.js <desktopRoot> <asarPath>
const a = require(process.argv[2] + "/../../node_modules/@electron/asar/lib/asar.js");
const fs = require("fs");
try {
  const pj = JSON.parse(a.extractFile(process.argv[3], "package.json"));
  const entry = pj.main || "dist/electron-main.cjs";
  const buf = a.extractFile(process.argv[3], entry);
  const s = buf.toString("utf8");
  const n = (s.match(/QIJI_ENV_FALLBACK/g) || []).length;
  console.log("MARK=" + n + " ENTRY=" + entry);
} catch (e) { console.log("ERR=" + e.message); }
