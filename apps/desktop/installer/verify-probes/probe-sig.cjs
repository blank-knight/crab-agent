// verify-package gate5 probe: ed25519 signature over sha256-hex string
// usage: node probe-sig.js <setupExe> <sigFile> <publicPem>
const crypto = require("crypto");
const fs = require("fs");
const sha256 = crypto.createHash("sha256").update(fs.readFileSync(process.argv[2])).digest("hex");
const sigB64 = fs.readFileSync(process.argv[3], "utf8").trim();
const pub = fs.readFileSync(process.argv[4], "utf8");
const ok = crypto.verify(null, Buffer.from(sha256, "utf8"), pub, Buffer.from(sigB64, "base64"));
console.log("SIG=" + (ok ? "VALID" : "INVALID"));
