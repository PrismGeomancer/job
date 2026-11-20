// The build prompt's leftover check: no ASCII-art engine, mascot or borrowed wording in the code.
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
const cmd = `grep -rniE "ascii|panda|scrap|asciipad|trash|\\btick\\b|\\bclick\\b" --exclude=README.md --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs --exclude=leftovers.mjs . || true`;
const out = execSync(cmd, { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" });
if (out.trim()) { console.log(out); process.exit(1); }
console.log("no leftovers");
