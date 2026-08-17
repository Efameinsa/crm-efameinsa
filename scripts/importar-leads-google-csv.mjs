// Importa los "Informe del formulario de cliente potencial" que se descargan
// desde Google Ads (Campañas → Recursos → formulario → Descargar leads).
// Rescata los leads ANTERIORES a la conexión del webhook: Google solo deja
// bajar los últimos 30 días, pero como marketing venía descargando el reporte
// periódicamente, la UNIÓN de todas esas descargas cubre muchos más meses.
// De aquí en adelante los leads entran solos por /api/webhooks/google-leads —
// esto es un rescate puntual, no un proceso recurrente.
//
// Acepta un archivo o carpetas enteras (recorre .csv, .xlsx y .xls), y maneja
// los DOS formatos que exporta Google Ads según la configuración regional:
//   A) separado por comas,       UTF-8,        fecha "2026-08-10 09:47"
//   B) separado por punto y coma, Windows-1252, fecha "1/06/2026 11:42"
//
// Deduplicación por GCLID (único por clic): re-correr el script no duplica
// nada, y también compara contra los leads que ya entraron por el webhook.
//
// Uso:
//   node --env-file=.env.local scripts/importar-leads-google-csv.mjs \
//     --ruta "C:/carpeta1" --ruta "C:/carpeta2" [--estado historico] [--aplicar]

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";

const args = process.argv.slice(2);
const rutas = args.reduce((acc, a, i) => (a === "--ruta" || a === "--archivo" ? [...acc, args[i + 1]] : acc), []);
const iEstado = args.indexOf("--estado");
const estado = iEstado !== -1 ? args[iEstado + 1] : "historico";
const aplicar = args.includes("--aplicar");

const ESTADOS_VALIDOS = ["historico", "pendiente_triaje", "descartado"];
if (rutas.length === 0) {
  console.error('Falta --ruta "<archivo o carpeta>" (se puede repetir)');
  process.exit(1);
}
if (!ESTADOS_VALIDOS.includes(estado)) {
  console.error(`--estado debe ser uno de: ${ESTADOS_VALIDOS.join(", ")}`);
  process.exit(1);
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function leerTexto(ruta) {
  const buf = readFileSync(ruta);
  const utf8 = buf.toString("utf8");
  // El caracter de reemplazo delata que no era UTF-8 (export regional en Windows-1252).
  return utf8.includes("\uFFFD") ? buf.toString("latin1") : utf8;
}

function parsearDelimitado(texto, delim) {
  const filas = [];
  let campo = "";
  let fila = [];
  let enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else enComillas = false;
      } else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === delim) {
      fila.push(campo);
      campo = "";
    } else if (c === "\n") {
      fila.push(campo);
      if (fila.some((x) => x.trim())) filas.push(fila);
      fila = [];
      campo = "";
    } else if (c !== "\r") campo += c;
  }
  if (campo || fila.length) {
    fila.push(campo);
    if (fila.some((x) => x.trim())) filas.push(fila);
  }
  return filas;
}

function parsearArchivo(ruta) {
  const low = ruta.toLowerCase();
  if (low.endsWith(".xlsx") || low.endsWith(".xls")) {
    const wb = XLSX.readFile(ruta);
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
  }
  if (low.endsWith(".csv")) {
    const txt = leerTexto(ruta);
    const primera = txt.split(/\r?\n/)[0] ?? "";
    const comas = (primera.match(/,/g) || []).length;
    const puntoComas = (primera.match(/;/g) || []).length;
    return parsearDelimitado(txt, puntoComas > comas ? ";" : ",");
  }
  return null;
}

// Normaliza los dos formatos de fecha a ISO con offset de Lima (GMT-05:00,
// como declara la propia cabecera del reporte).
function aISO(v) {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4].padStart(2, "0")}:${m[5]}:00-05:00`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T${m[4].padStart(2, "0")}:${m[5]}:00-05:00`;
  return null;
}

function listarArchivos(ruta) {
  try {
    if (statSync(ruta).isDirectory()) {
      return readdirSync(ruta)
        .map((n) => join(ruta, n))
        .filter((p) => /\.(csv|xlsx|xls)$/i.test(p));
    }
    return [ruta];
  } catch {
    console.error(`  ⚠ no accesible: ${ruta}`);
    return [];
  }
}

async function main() {
  const porGclid = new Map();
  let archivosOk = 0;
  let filasVistas = 0;

  for (const ruta of rutas) {
    for (const archivo of listarArchivos(ruta)) {
      let filas;
      try {
        filas = parsearArchivo(archivo);
      } catch {
        continue;
      }
      if (!filas || filas.length < 2) continue;

      const cab = filas[0].map((h) => String(h).trim());
      const iG = cab.findIndex((h) => h.toUpperCase().includes("GCLID"));
      const iC = cab.findIndex((h) => h.toLowerCase().includes("nombre de la campa"));
      const iN = cab.findIndex((h) => h.toLowerCase().includes("nombre completo"));
      const iE = cab.findIndex((h) => h.toLowerCase().includes("correo"));
      const iT = cab.findIndex((h) => {
        const x = h.toLowerCase();
        return x.includes("tel") && !x.includes("verific");
      });
      const iCi = cab.findIndex((h) => h.toLowerCase().trim() === "ciudad");
      if (iG === -1 || iN === -1) continue;
      archivosOk++;

      for (const f of filas.slice(1)) {
        const gclid = String(f[iG] ?? "").trim();
        // Un GCLID real es una cadena larga; esto descarta filas mal formadas.
        if (!gclid || gclid.length < 20) continue;
        filasVistas++;
        if (porGclid.has(gclid)) continue;
        porGclid.set(gclid, {
          fechaISO: aISO(f[0]),
          campania: String(f[iC] ?? "").trim(),
          nombre: String(f[iN] ?? "").trim(),
          email: String(f[iE] ?? "").trim(),
          telefono: String(f[iT] ?? "").trim(),
          ciudad: iCi >= 0 ? String(f[iCi] ?? "").trim() : "",
        });
      }
    }
  }

  // Nombre de campaña → campaign_id (vienen del mismo Google Ads que
  // sincroniza `campanias`, así que calzan por nombre exacto).
  const { data: campanias } = await admin.from("campanias").select("campaign_id, nombre").eq("plataforma", "google");
  const idPorNombre = new Map((campanias ?? []).map((c) => [c.nombre.trim().toLowerCase(), c.campaign_id]));

  const { data: existentes } = await admin.from("leads").select("gclid").not("gclid", "is", null);
  const yaEnBase = new Set((existentes ?? []).map((l) => l.gclid));

  const aInsertar = [];
  const sinCampania = new Set();
  let omitidosExistentes = 0;
  let omitidosSinDatos = 0;

  for (const [gclid, v] of porGclid) {
    if (yaEnBase.has(gclid)) {
      omitidosExistentes++;
      continue;
    }
    if (!v.nombre && !v.telefono && !v.email) {
      omitidosSinDatos++;
      continue;
    }
    const campaignId = idPorNombre.get(v.campania.toLowerCase()) ?? null;
    if (!campaignId && v.campania) sinCampania.add(v.campania);

    const partes = [];
    if (v.ciudad) partes.push(`Ciudad: ${v.ciudad}`);
    if (v.campania) partes.push(`Campaña: ${v.campania}`);
    partes.push("Histórico importado de Google Ads (gestionado antes del CRM)");

    aInsertar.push({
      canal: "formulario_web",
      area_destino: "comercial",
      estado,
      nombre_contacto: v.nombre || "Sin nombre",
      telefono: v.telefono || null,
      email: v.email || null,
      mensaje: partes.join(" · "),
      fuente: "google_ads",
      gclid,
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: campaignId,
      lead_externo_id: `gads-csv:${gclid}`,
      recibido_at: v.fechaISO ?? new Date().toISOString(),
      recibido_por: null,
    });
  }

  const conFecha = aInsertar.filter((l) => l.recibido_at).map((l) => l.recibido_at).sort();
  console.log(`Archivos leídos: ${archivosOk}`);
  console.log(`Filas con GCLID (con repeticiones entre descargas): ${filasVistas}`);
  console.log(`Leads únicos encontrados: ${porGclid.size}`);
  console.log(`Ya estaban en la base: ${omitidosExistentes} · sin datos de contacto: ${omitidosSinDatos}`);
  console.log(`A IMPORTAR: ${aInsertar.length}  (estado: ${estado})`);
  if (conFecha.length) console.log(`Rango: ${conFecha[0].slice(0, 10)} → ${conFecha[conFecha.length - 1].slice(0, 10)}`);
  if (sinCampania.size) {
    console.log(`\n⚠ Campañas sin equivalente en la base (quedarán sin atribución):`);
    for (const c of sinCampania) console.log(`   - "${c}"`);
  }

  if (!aplicar) {
    console.log("\n(SIMULACIÓN — no se insertó nada. Agregue --aplicar para ejecutar.)");
    if (aInsertar[0]) console.log("\nPrimera fila de ejemplo:", JSON.stringify(aInsertar[0], null, 2));
    return;
  }

  let insertados = 0;
  for (let i = 0; i < aInsertar.length; i += 100) {
    const lote = aInsertar.slice(i, i + 100);
    const { error, data } = await admin.from("leads").insert(lote).select("id");
    if (error) {
      console.error(`\n✗ Error en el lote ${Math.floor(i / 100) + 1}: ${error.message}`);
      process.exit(1);
    }
    insertados += data.length;
    process.stdout.write(`\r  importados: ${insertados}/${aInsertar.length}`);
  }
  console.log(`\n\n✓ ${insertados} leads históricos importados.`);
}

main().catch((err) => {
  console.error("\n✗ Error importando:\n", err.message);
  process.exit(1);
});
