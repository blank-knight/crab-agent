// verify-package gate4 probe: API dual-scan inside asar entry
// usage: node probe-url.js <desktopRoot> <asarPath>
const a = require(process.argv[2] + "/../../node_modules/@electron/asar/lib/asar.js");
try {
  const pj = JSON.parse(a.extractFile(process.argv[3], "package.json"));
  const buf = a.extractFile(process.argv[3], pj.main);
  const s = buf.toString("utf8");
  console.log("T=" + (s.match(/test\.aijiqiren\.vip/g) || []).length +
              " P=" + (s.match(/agent\.aijiqiren\.vip/g) || []).length);
} catch (e) { console.log("T=0 P=0"); }
