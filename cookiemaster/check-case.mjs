// check-case.mjs
// Usage : node check-case.mjs
// Compare chaque import relatif du dossier src/ avec la casse réelle du fichier sur disque.
import { readdirSync, statSync, existsSync, readFileSync } from "fs";
import { join, dirname, resolve, extname } from "path";

const SRC = "src";
const EXTS = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"];

function walk(dir) {
  let out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(walk(full));
    else out.push(full);
  }
  return out;
}

function realCaseOnDisk(p) {
  // Reconstruit le vrai nom (casse exacte) tel qu'il existe sur le disque, dossier par dossier.
  const parts = p.split("/");
  let current = ".";
  let real = [];
  for (const part of parts) {
    if (!existsSync(current)) return null;
    const entries = readdirSync(current);
    const match = entries.find(e => e.toLowerCase() === part.toLowerCase());
    if (!match) return null;
    real.push(match);
    current = join(current, match);
  }
  return real.join("/");
}

const files = walk(SRC).filter(f => /\.(tsx?|jsx?)$/.test(f));
const importRe = /from\s+['"](\.[^'"]+)['"]/g;
let issues = 0;

for (const file of files) {
  const content = readFileSync(file, "utf8");
  let m;
  while ((m = importRe.exec(content))) {
    const spec = m[1];
    const baseDir = dirname(file);
    let candidate = resolve(baseDir, spec).replace(process.cwd() + "/", "");

    let found = null;
    for (const ext of ["", ...EXTS]) {
      const tryPath = candidate + ext;
      if (existsSync(tryPath)) { found = tryPath; break; }
    }
    if (!found) continue; // fichier introuvable même sans check casse, autre souci

    const real = realCaseOnDisk(found);
    if (real && real !== found) {
      console.log(`❌ ${file}\n   import "${spec}"\n   attendu (casse réelle): ${real}\n   résolu comme:           ${found}\n`);
      issues++;
    }
  }
}

console.log(issues === 0 ? "✅ Aucun problème de casse détecté." : `⚠️  ${issues} import(s) à corriger.`);
