import { copyFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const outDir = new URL("../out/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
let copies = 0;

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    if (name.startsWith("__next.")) {
      for (const file of filesUnder(full)) {
        const flat = `${name}.${relative(full, file).split(sep).join(".")}`;
        copyFileSync(file, join(dir, flat));
        copies += 1;
      }
    } else {
      walk(full);
    }
  }
}

walk(outDir);
writeFileSync(join(outDir, ".nojekyll"), "");
