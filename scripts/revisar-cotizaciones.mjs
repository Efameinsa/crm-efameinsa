// ============================================================
// CRM EFAMEINSA · Repasar las cotizaciones de los últimos días
// ============================================================
// Orden de Darwin (29-08): «revisar las cotizaciones generadas desde hace 5
// días y asegúrate que no tengan errores». Quedó como script porque el repaso
// hay que poder repetirlo: el catálogo, los precios y la plantilla se mueven
// todas las semanas.
//
// Mira DOS cosas y las mira de verdad, no de a suposiciones:
//
//  1. LOS DATOS de cada cotización — cliente, condiciones, precios, totales,
//     equipos de baja, cotizaciones repetidas.
//  2. EL PDF QUE RECIBE EL CLIENTE — se baja de producción con una sesión real
//     de gerencia y se lee con pdfjs: que no se cuele texto que no es de la
//     ficha, que cada ítem tenga su ficha impresa, que el total y la fecha del
//     papel sean los de la base.
//
// Lo que NO mira acá es la maquetación (márgenes, imágenes, texto fuera de su
// casilla): eso ya lo hace `auditar-ficha-cotizacion.mjs`, que corre sobre los
// mismos PDF y se le pasan con:
//     npx tsx scripts/auditar-ficha-cotizacion.mjs <carpeta>/*.pdf
//
// No escribe una sola fila: baja PDF y lee.
//
// Uso:
//   node --env-file=.env.local scripts/revisar-cotizaciones.mjs [días] [carpeta]
//   BASE=http://localhost:3100 node --env-file=.env.local scripts/revisar-cotizaciones.mjs 5

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { Client } from "pg";
import { writeFileSync, mkdirSync } from "node:fs";

const DIAS = Number(process.argv[2] ?? 5);
const CARPETA = process.argv[3] ?? "scripts/data/repaso-cotizaciones";
const BASE = process.env.BASE ?? "https://crm.efameinsa.com";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const n = (v) => Number(v ?? 0);
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
/** «28 de agosto de 2026», que es como firma el PDF. */
const enCastellano = (iso) => {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
};
const hallazgos = [];
const anotar = (nivel, codigo, quien, texto) => hallazgos.push({ nivel, codigo: codigo ?? "(borrador)", quien, texto });

// ── Los datos ───────────────────────────────────────────────────────────────
const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();
const { rows: cots } = await bd.query(
  `select c.id, c.codigo, c.serie::text as serie, c.correlativo, c.estado::text as estado,
          c.subtotal, c.total, c.moneda::text as moneda, c.vigencia_dias, c.condiciones,
          c.tiempo_entrega, c.garantia, c.forma_pago, c.cliente_snapshot, c.enviada_at,
          p.nombre as comercial,
          to_char(c.created_at at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI') as creada,
          -- El día en Lima en crudo: el nombre del mes se arma en español acá
          -- abajo. Postgres lo escribe con el idioma del servidor y devolvía
          -- «24 de August de 2026», que hacía fallar a las 73 de una.
          to_char(c.created_at at time zone 'America/Lima', 'YYYY-MM-DD') as dia_lima_iso
     from cotizaciones c left join perfiles p on p.id = c.creada_por
    where c.created_at >= now() - ($1 || ' days')::interval
    order by c.created_at`,
  [String(DIAS)],
);
const { rows: items } = await bd.query(
  `select ci.cotizacion_id, ci.producto_id, ci.cantidad, ci.precio_unitario, ci.precio_lista,
          ci.subtotal, ci.requiere_aprobacion, ci.aprobado, ci.descripcion,
          pr.sku, pr.nombre as producto, pr.activo, pr.foto_path is not null as con_foto,
          pr.updated_at > c.created_at as seguia_vigente,
          coalesce(jsonb_array_length(pr.ficha->'bloques'), 0)
            + coalesce(jsonb_array_length(pr.ficha->'caracteristicas'), 0) as lineas_ficha
     from cotizacion_items ci
     join cotizaciones c on c.id = ci.cotizacion_id
     left join productos pr on pr.id = ci.producto_id
    where c.created_at >= now() - ($1 || ' days')::interval`,
  [String(DIAS)],
);
await bd.end();

const porCot = new Map();
for (const i of items) porCot.set(i.cotizacion_id, [...(porCot.get(i.cotizacion_id) ?? []), i]);

const correlativos = new Map();
for (const c of cots) {
  const suyos = porCot.get(c.id) ?? [];
  const cliente = c.cliente_snapshot ?? {};
  const salio = c.estado !== "borrador";
  const quien = c.comercial;

  if (c.correlativo != null) {
    const clave = `${c.serie}·${c.correlativo}`;
    if (correlativos.has(clave)) anotar("GRAVE", c.codigo, quien, `correlativo repetido con ${correlativos.get(clave)}`);
    else correlativos.set(clave, c.codigo);
  }

  if (suyos.length === 0) anotar("GRAVE", c.codigo, quien, "no tiene ni un ítem");
  const razon = String(cliente.razon_social ?? "").trim();
  if (!razon) anotar("GRAVE", c.codigo, quien, "sale sin nombre de cliente");
  if (/\d{8,}\s*-/.test(razon))
    anotar("aviso", c.codigo, quien, `el documento está escrito dentro del nombre del cliente: «${razon.slice(0, 45)}»`);

  // Plata: que la suma cierre y que el papel no prometa un número distinto.
  const suma = suyos.reduce((a, i) => a + n(i.cantidad) * n(i.precio_unitario), 0);
  if (Math.abs(suma - n(c.subtotal)) > 0.02)
    anotar("GRAVE", c.codigo, quien, `el subtotal guardado (${n(c.subtotal)}) no es la suma de los ítems (${suma.toFixed(2)})`);
  if (n(c.total) + 0.02 < n(c.subtotal))
    anotar("GRAVE", c.codigo, quien, `el total (${n(c.total)}) es menor que el subtotal (${n(c.subtotal)})`);

  if (!String(c.forma_pago ?? "").trim() && !/pago/i.test(String(c.condiciones ?? "")))
    anotar("aviso", c.codigo, quien, "sin forma de pago");
  if (!c.vigencia_dias) anotar("aviso", c.codigo, quien, "sin días de vigencia");
  if (salio && !c.enviada_at) anotar("aviso", c.codigo, quien, "figura enviada pero sin fecha de envío");

  for (const i of suyos) {
    const que = i.sku ?? i.producto ?? i.descripcion?.slice(0, 30) ?? "(ítem sin producto)";
    if (!i.producto_id && !i.descripcion) anotar("GRAVE", c.codigo, quien, "un ítem sin producto y sin descripción");
    if (n(i.cantidad) <= 0) anotar("GRAVE", c.codigo, quien, `${que}: cantidad ${i.cantidad}`);
    if (n(i.precio_unitario) <= 0) anotar("GRAVE", c.codigo, quien, `${que}: precio ${i.precio_unitario}`);
    if (i.subtotal != null && Math.abs(n(i.subtotal) - n(i.cantidad) * n(i.precio_unitario)) > 0.02)
      anotar("GRAVE", c.codigo, quien, `${que}: el subtotal del ítem no es cantidad × precio`);
    // Regla de gerencia: por debajo de lista, aprueba gerencia. Que quede en un
    // borrador es el sistema haciendo su trabajo; que haya SALIDO, no.
    if (i.requiere_aprobacion && !i.aprobado)
      anotar(salio ? "GRAVE" : "info", c.codigo, quien,
        `${que}: ${n(i.precio_unitario)} por debajo de la lista (${n(i.precio_lista)}) sin aprobar${salio ? " Y SE ENVIÓ" : " (quedó en borrador)"}`);
    // Un equipo dado de baja DESPUÉS no es un error de la cotización, pero hay
    // que saberlo antes de cerrarla: ese código ya no está en el maestro.
    if (i.producto_id && i.activo === false)
      anotar("info", c.codigo, quien,
        `${que}: el equipo se dio de baja del catálogo ${i.seguia_vigente ? "DESPUÉS de cotizarlo" : "ANTES de cotizarlo"}`);
    if (i.producto_id && !i.con_foto) anotar("aviso", c.codigo, quien, `${que}: el equipo no tiene foto en el catálogo`);
    if (i.producto_id && n(i.lineas_ficha) === 0) anotar("aviso", c.codigo, quien, `${que}: el equipo no tiene ficha técnica`);
  }
}

// Dos cotizaciones con el mismo cliente y el mismo contenido: o es la misma
// oferta en las dos razones sociales, o se quemó un correlativo de más.
const huellas = new Map();
for (const c of cots) {
  const suyos = (porCot.get(c.id) ?? []).map((i) => `${i.sku ?? i.producto}×${i.cantidad}@${i.precio_unitario}`).sort();
  if (suyos.length === 0) continue;
  const huella = `${(c.cliente_snapshot ?? {}).razon_social}|${suyos.join("|")}`;
  huellas.set(huella, [...(huellas.get(huella) ?? []), c]);
}
for (const [, cs] of huellas) {
  if (cs.length < 2) continue;
  const series = new Set(cs.map((c) => c.serie));
  anotar(
    "aviso",
    cs.map((c) => c.codigo ?? "borrador").join(" / "),
    cs[0].comercial,
    `misma oferta a «${(cs[0].cliente_snapshot ?? {}).razon_social}» repetida ${cs.length} veces` +
      (series.size > 1 ? " (una por razón social, puede ser a propósito)" : " en la MISMA serie"),
  );
}

// ── El PDF que recibe el cliente ────────────────────────────────────────────
mkdirSync(CARPETA, { recursive: true });
const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: "soypuromarketing@gmail.com" });
if (error) throw error;
const jar = new Map();
const ssr = createServerClient(url, anon, {
  cookies: {
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)),
  },
});
const { error: e2 } = await ssr.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
if (e2) throw e2;
const cookie = [...jar.entries()].map(([nn, v]) => `${nn}=${encodeURIComponent(v)}`).join("; ");

const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const RESTOS_WORD = /INCLUDEPICTURE|MERGEFORMAT|HYPERLINK\s+"|AppData|\.docx?\b|C:\\/i;
const BASURA = /undefined|NaN|\[object Object\]|Invalid Date/;
const ETIQUETA = /\b(Nuevo )?Modelo 20\d\d\b/;

console.log(`Bajando ${cots.length} PDF de ${BASE} …`);
for (const c of cots) {
  const nombre = `${c.codigo ?? `borrador-${c.id.slice(0, 8)}`}.pdf`;
  let paginas;
  try {
    const r = await fetch(`${BASE}/api/cotizaciones/${c.id}/pdf`, { headers: { cookie } });
    if (!r.ok) {
      anotar("GRAVE", c.codigo, c.comercial, `el PDF no se genera: HTTP ${r.status}`);
      continue;
    }
    const bytes = new Uint8Array(await r.arrayBuffer());
    writeFileSync(`${CARPETA}/${nombre}`, bytes);
    const doc = await getDocument({ data: bytes, useSystemFonts: true }).promise;
    paginas = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const contenido = await (await doc.getPage(i)).getTextContent();
      paginas.push(contenido.items.map((it) => it.str).join(" ").replace(/\s+/g, " ").trim());
    }
  } catch (e) {
    anotar("GRAVE", c.codigo, c.comercial, `no se pudo leer el PDF: ${e.message}`);
    continue;
  }

  const texto = paginas.join(" ");
  paginas.forEach((p, i) => {
    const limpio = p.replace(/OPEN INVESTMENTS[\s\S]{0,120}?Huachipa|Corporación Efameinsa[\s\S]{0,220}?371-0502/g, "").trim();
    if (limpio.length < 40) anotar("GRAVE", c.codigo, c.comercial, `p${i + 1}: página casi en blanco`);
    if (RESTOS_WORD.test(p)) anotar("GRAVE", c.codigo, c.comercial, `p${i + 1}: se imprimió código o ruta de Word`);
    if (BASURA.test(p)) anotar("GRAVE", c.codigo, c.comercial, `p${i + 1}: se imprimió un valor sin definir`);
    if (ETIQUETA.test(p)) anotar("GRAVE", c.codigo, c.comercial, `p${i + 1}: se coló la etiqueta «Modelo 20xx» de la ficha`);
  });

  // Cada ítem tiene que tener su ficha impresa.
  const fichas = new Set([...texto.matchAll(/ITEM ([IVXLC]+)\.-/g)].map((m) => m[1]));
  const cuantos = (porCot.get(c.id) ?? []).length;
  if (fichas.size !== cuantos)
    anotar("GRAVE", c.codigo, c.comercial, `${cuantos} ítem(s) en la cotización pero ${fichas.size} ficha(s) impresa(s)`);

  // El número que promete el papel y la fecha con la que lo firma.
  const totales = [...texto.matchAll(/TOTAL[^\d]{0,40}([\d,]+\.\d{2})/gi)].map((x) => Number(x[1].replace(/,/g, "")));
  if (!totales.some((v) => Math.abs(v - n(c.total)) < 0.02))
    anotar("GRAVE", c.codigo, c.comercial, `el total impreso (${totales.join(" / ") || "ninguno"}) no es el guardado (${n(c.total)})`);
  const fechaEsperada = enCastellano(c.dia_lima_iso);
  if (!texto.includes(`Lima, ${fechaEsperada}`))
    anotar("GRAVE", c.codigo, c.comercial, `la fecha impresa no es el día de Lima en que se creó (${fechaEsperada})`);

  // Dónde paga el cliente.
  if (!/CUENTA BANCARIA/i.test(texto))
    anotar(c.estado === "borrador" ? "aviso" : "GRAVE", c.codigo, c.comercial,
      `el PDF sale sin números de cuenta (serie ${c.serie})`);
}

// ── El informe ──────────────────────────────────────────────────────────────
const imprimir = (nivel, titulo) => {
  const lista = hallazgos.filter((h) => h.nivel === nivel);
  console.log(`\n═══ ${titulo} (${lista.length}) ═══`);
  if (lista.length === 0) return console.log("  (nada)");
  const porTexto = new Map();
  for (const h of lista) {
    const clave = h.texto.replace(/\d+(\.\d+)?/g, "#");
    porTexto.set(clave, [...(porTexto.get(clave) ?? []), h]);
  }
  for (const [clave, hs] of [...porTexto.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n· ${clave} → ${hs.length}`);
    for (const h of hs.slice(0, 15)) console.log(`    ${h.codigo.padEnd(16)} ${h.quien ?? ""} · ${h.texto}`);
    if (hs.length > 15) console.log(`    … y ${hs.length - 15} más`);
  }
};

console.log(`\n\n${cots.length} cotizaciones de los últimos ${DIAS} días · ${items.length} ítems`);
imprimir("GRAVE", "Lo que hay que corregir");
imprimir("aviso", "Para mirar");
imprimir("info", "Para saber");
console.log(`\nLos PDF quedaron en ${CARPETA}/ — la maquetación se audita con:`);
console.log(`  npx tsx scripts/auditar-ficha-cotizacion.mjs ${CARPETA}/*.pdf`);
process.exit(hallazgos.some((h) => h.nivel === "GRAVE") ? 1 : 0);
