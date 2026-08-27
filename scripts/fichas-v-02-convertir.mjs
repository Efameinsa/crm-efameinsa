// ============================================================
// CRM EFAMEINSA · Paso 2 · Los .doc viejos, a .docx
// ============================================================
// 45 de las 116 fichas siguen en el formato binario de Word 97. No se pueden
// leer como zip, así que Word las reguarda como .docx en
// `scripts/data/fichas-v/docx/`. Los originales de V:\ NO se tocan.
//
// Un proceso de Word por archivo y con timeout: una ficha con vínculos por
// actualizar o con Vista protegida cuelga la automatización, y si fuera un
// solo proceso se llevaría puestas a todas las demás. Es la misma defensa que
// ya usaba `convertir-fichas-doc.ps1` desde el 22-08.
//
// Uso: node scripts/fichas-v-02-convertir.mjs

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const LISTA = "scripts/data/fichas-v/lista.json";
const DESTINO = "scripts/data/fichas-v/docx";
const TIMEOUT_MS = 90_000;

const datos = JSON.parse(readFileSync(LISTA, "utf-8"));
mkdirSync(DESTINO, { recursive: true });

const pendientes = datos.productos.filter((p) => p.tipo === "DOC");
console.log(`Fichas .doc por convertir: ${pendientes.length}`);

let convertidas = 0;
let reusadas = 0;
const fallidas = [];

for (const p of pendientes) {
  // Ruta ABSOLUTA: Word resuelve un SaveAs2 relativo contra su propia carpeta
  // de documentos, no contra la del script, y ninguna conversión aparecía.
  const salida = resolve(DESTINO, `${p.codigo}.docx`).replace(/\\/g, "/");
  if (existsSync(salida) && statSync(salida).size > 0) {
    p.docx = salida;
    reusadas++;
    continue;
  }
  try {
    execFileSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/convertir-una-ficha.ps1", p.archivo, salida],
      { timeout: TIMEOUT_MS, stdio: "pipe" },
    );
    if (!existsSync(salida)) throw new Error("Word no dejó el archivo");
    p.docx = salida;
    convertidas++;
    console.log(`  ✓ ${p.codigo}`);
  } catch (e) {
    fallidas.push({ codigo: p.codigo, archivo: p.archivo, error: String(e.message ?? e).slice(0, 120) });
    console.log(`  ✗ ${p.codigo}  ${String(e.message ?? e).slice(0, 80)}`);
    try {
      execFileSync("taskkill", ["/F", "/IM", "WINWORD.EXE"], { stdio: "ignore" });
    } catch {
      /* no quedó ningún Word colgado */
    }
  }
}

// Las que ya eran .docx apuntan a su original de V:\, sin copiarlo.
for (const p of datos.productos) if (p.tipo === "DOCX") p.docx = p.archivo;

writeFileSync(LISTA, JSON.stringify(datos, null, 2));
console.log(`\nConvertidas ${convertidas}, reusadas ${reusadas}, fallidas ${fallidas.length}`);
for (const f of fallidas) console.log(`  · ${f.codigo}: ${f.error}`);
