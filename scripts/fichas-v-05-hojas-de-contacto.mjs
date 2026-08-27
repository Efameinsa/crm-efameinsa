// ============================================================
// CRM EFAMEINSA · Paso 5 · Hojas de contacto para mirar las imágenes
// ============================================================
// «Abre cada ficha técnica y tómale una foto a sus imágenes»: esto es eso.
// Arma páginas con TODAS las imágenes de cada ficha, rotuladas con el rol que
// les asignó el paso 4, su tamaño real en píxeles y los puntos por pulgada a
// los que quedarían impresas en su caja del estándar.
//
// Sirve para lo único que ninguna heurística resuelve: ver que la foto del
// equipo sea de verdad el equipo. En agosto aparecieron tres fichas cuya única
// imagen era un pantallazo del navegador (GP100, UC100, FCU500) y solo se
// detectaron mirándolas.
//
// Se dibujan con Edge en modo headless — no hay más navegador en esta máquina
// y es el mismo camino que ya se usa para los documentos de gerencia.
//
// Uso: node scripts/fichas-v-05-hojas-de-contacto.mjs [fichas-por-hoja]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const CLASIFICACION = "scripts/data/fichas-v/clasificacion.json";
const DIR = "scripts/data/fichas-v/hojas";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const POR_HOJA = Number(process.argv[2]) || 8;
// Con códigos sueltos se rehace la hoja de esos nada más: sirve para volver a
// mirar los que quedaron cortados al pie de una hoja.
const SOLO = process.argv.slice(3).map((c) => c.toUpperCase());
const PREFIJO = SOLO.length ? "extra" : "hoja";

let { fichas } = JSON.parse(readFileSync(CLASIFICACION, "utf-8"));
if (SOLO.length) fichas = fichas.filter((f) => SOLO.includes(f.codigo.toUpperCase()));
mkdirSync(DIR, { recursive: true });

const CAJAS = { logo: [27, 14], producto: [54, 96], panel: [35, 32] };

/** Puntos por pulgada a los que se imprimiría dentro de su caja. */
function ppp(img) {
  const caja = CAJAS[img.rol];
  if (!caja || !img.px?.ancho || !img.anchoMm) return null;
  const escala = Math.min(caja[0] / (img.px.ancho || 1), caja[1] / (img.px.alto || 1));
  const anchoImpreso = (img.px.ancho * escala) / 25.4; // pulgadas
  return anchoImpreso > 0 ? Math.round(img.px.ancho / anchoImpreso) : null;
}

const COLOR_ROL = { logo: "#2563eb", producto: "#15803d", panel: "#b45309", descartar: "#991b1b" };

const hojas = [];
for (let i = 0; i < fichas.length; i += POR_HOJA) hojas.push(fichas.slice(i, i + POR_HOJA));

hojas.forEach((grupo, n) => {
  const filas = grupo
    .map((f) => {
      const imgs = f.imagenes
        .map((img, k) => {
          const p = ppp(img);
          const alerta = p !== null && p < 300;
          return `<figure>
            <img src="file:///${resolve(img.archivo).replace(/\\/g, "/")}" />
            <figcaption>
              <b style="color:${COLOR_ROL[img.rol] ?? "#000"}">${k + 1}. ${img.rol}</b>
              <span>${img.px.ancho}×${img.px.alto} px · ${img.anchoMm ?? "?"}×${img.altoMm ?? "?"} mm en el Word</span>
              <span class="${alerta ? "mal" : "bien"}">${p ? `${p} ppp impreso` : "sin medida"}${img.repetida > 1 ? ` · en ${img.repetida} fichas` : ""}</span>
            </figcaption>
          </figure>`;
        })
        .join("");
      return `<section>
        <h2>${f.codigo} <small>${f.marca ?? ""} · ${(f.equipo ?? "").slice(0, 70)}</small></h2>
        <div class="tira">${imgs}</div>
        ${f.avisos.length ? `<p class="avisos">⚠ ${f.avisos.join(" · ")}</p>` : ""}
      </section>`;
    })
    .join("");

  const html = `<!doctype html><meta charset="utf-8">
<style>
  body { font: 13px/1.4 Segoe UI, Arial, sans-serif; margin: 18px; background:#fff; }
  h1 { font-size: 17px; margin: 0 0 14px; }
  section { border-top: 1px solid #ddd; padding: 10px 0; }
  h2 { font-size: 14px; margin: 0 0 8px; }
  h2 small { font-weight: 400; color: #666; }
  .tira { display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; }
  figure { margin: 0; width: 190px; }
  img { max-width: 190px; max-height: 190px; display: block; margin: 0 auto 4px;
        background: #f4f4f4; border: 1px solid #e2e2e2; }
  figcaption { font-size: 11px; text-align: center; }
  figcaption span { display: block; color: #555; }
  .bien { color: #15803d !important; }
  .mal { color: #b91c1c !important; font-weight: 600; }
  .avisos { color: #b45309; font-size: 12px; margin: 6px 0 0; }
</style>
<h1>Fichas técnicas · imágenes ${n * POR_HOJA + 1}–${n * POR_HOJA + grupo.length} de ${fichas.length} fichas</h1>
${filas}`;

  const rutaHtml = `${DIR}/${PREFIJO}-${String(n + 1).padStart(2, "0")}.html`;
  const rutaPng = `${DIR}/${PREFIJO}-${String(n + 1).padStart(2, "0")}.png`;
  writeFileSync(rutaHtml, html);

  if (existsSync(EDGE)) {
    execFileSync(
      EDGE,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        "--window-size=1500,2400",
        `--screenshot=${resolve(rutaPng)}`,
        `file:///${resolve(rutaHtml).replace(/\\/g, "/")}`,
      ],
      { stdio: "ignore", timeout: 120_000 },
    );
  }
  console.log(`  hoja ${n + 1}/${hojas.length}: ${grupo.map((f) => f.codigo).join(", ")}`);
});

console.log(`\n${hojas.length} hojas en ${DIR}`);
