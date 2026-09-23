// Busca enlaces internos (href, router.push, redirect, revalidatePath no) que no tienen página.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const APP = "src/app";
const rutas = [];
function recorrer(dir, partes) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      const seg = n.startsWith("(") && n.endsWith(")") ? null : n;
      recorrer(p, seg === null ? partes : [...partes, seg]);
    } else if (/^(page|route)\.(tsx|ts)$/.test(n)) rutas.push(partes);
  }
}
recorrer(APP, []);
const casa = (url) => {
  const seg = url.split("?")[0].split("#")[0].replace(/\/$/, "").split("/").filter(Boolean);
  return rutas.some((r) => {
    let i = 0;
    for (let k = 0; k < r.length; k++) {
      const s = r[k];
      if (s.startsWith("[[...")) return true;
      if (s.startsWith("[...")) return i < seg.length;
      if (i >= seg.length) return false;
      if (!(s.startsWith("[") || s === seg[i])) return false;
      i++;
    }
    return i === seg.length;
  });
};
const archivos = [];
(function todos(d) { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? todos(p) : /\.(tsx|ts)$/.test(n) && !/\.test\./.test(n) && archivos.push(p); } })("src");
const malos = new Map();
for (const f of archivos) {
  const t = readFileSync(f, "utf8");
  const re = /(?:href=\{?|href:\s*|router\.(?:push|replace)\(|redirect\(|url:\s*|Link href=)["'`](\/[a-z0-9\-\/_]*[^"'`]*)["'`]/gi;
  let m;
  while ((m = re.exec(t))) {
    let u = m[1].replace(/\$\{[^}]+\}/g, "X");
    if (/^\/(api|_next|demo)\b/.test(u) && !casa(u)) {}
    if (!casa(u)) {
      const linea = t.slice(0, m.index).split("\n").length;
      const k = u.split("?")[0];
      malos.set(`${f}:${linea}`, u);
    }
  }
}
for (const [d, u] of malos) console.log(u.padEnd(50), d);
console.log(`${malos.size} enlaces sin página (de ${rutas.length} rutas)`);
