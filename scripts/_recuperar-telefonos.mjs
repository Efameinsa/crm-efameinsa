// Recupera teléfonos para las fichas que no tienen ninguno (17-09-2026, pedido
// de Santos por Ariana: «en su cartera tiene 4219 clientes pero muchos no
// tienen teléfono»). Cruza cinco fuentes que nunca se unieron a las fichas:
// los registros históricos de Central (leads), las cotizaciones históricas
// cargadas, y los tres JSON del import del Excel (oportunidades, ventas COTIZ
// y cotizaciones). Empareja por RUC/DNI (fuerte) o por nombre normalizado
// exacto (mismo criterio que nombre_normalizado de la base). Lo que no
// coincide de ninguna de las dos formas NO se toca.
//
// Uso: node --env-file=.env.local scripts/_recuperar-telefonos.mjs           (solo mide)
//      APLICAR=1 node --env-file=.env.local scripts/_recuperar-telefonos.mjs (crea contactos y une leads)
import { Client } from "pg";
import { readFileSync, writeFileSync } from "node:fs";

const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const TILDES = { Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ü: "U", Ñ: "N" };
const norm = (s) => String(s ?? "").toUpperCase().replace(/[ÁÉÍÓÚÜÑ]/g, (c) => TILDES[c]).replace(/[^A-Z0-9]+/g, " ").trim();
const tel = (s) => { let d = String(s ?? "").replace(/\D/g, ""); if (d.length > 9 && d.startsWith("51")) d = d.slice(2); return d.replace(/^0+/, ""); }; // sin el 0 del prefijo: 062513322 y 62513322 son el mismo
// Un teléfono que sirve: celular de 9 (empieza en 9) o fijo de 7 (Lima) o con prefijo.
const telSirve = (d) => /^9\d{8}$/.test(d) || /^\d{7}$/.test(d) || /^[1-8]\d{6,8}$/.test(d);
const partirTels = (s) => [...new Set(String(s ?? "").split(/[\/,;|]|\s-\s|\s{2,}|\by\b/i).map(tel).filter(telSirve))];

// ── las fichas sin teléfono ───────────────────────────────────────────────
const { rows: cuentas } = await db.query(`
  select cu.id, cu.razon_social, cu.num_doc, nombre_normalizado(cu.razon_social) nn, p.codigo_comercial
  from cuentas cu left join perfiles p on p.id = cu.comercial_id
  where not exists (select 1 from contactos c where c.cuenta_id = cu.id and coalesce(c.telefono, '') <> '')
    and cu.razon_social <> '(sin razón social)'`);
const porDoc = new Map(), porNombre = new Map();
for (const c of cuentas) {
  if (c.num_doc) porDoc.set(c.num_doc, c);
  if (c.nn.length >= 6) porNombre.set(c.nn, c);
}
console.log(`fichas sin teléfono: ${cuentas.length}`);

// ── candidatos ───────────────────────────────────────────────────────────
const cand = [];
const agregar = (doc, nombre, tels, extra) => {
  if (!tels.length) return;
  const cd = doc ? porDoc.get(String(doc).replace(/\D/g, "")) : null;
  const cn = porNombre.get(norm(nombre));
  const c = cd ?? cn;
  if (!c) return;
  for (const t of tels) cand.push({ cuenta: c, telefono: t, nivel: cd ? "doc" : "nombre", ...extra });
};
// 1. registros históricos de Central
const { rows: leads } = await db.query(`select id, codigo, num_doc, razon_social, nombre_contacto, telefono, email, recibido_at from leads where coalesce(telefono, '') <> '' and cuenta_id is null`);
for (const l of leads) agregar(l.num_doc, l.razon_social, partirTels(l.telefono), { nombre: l.nombre_contacto, email: l.email, fuente: `registro de Central ${l.codigo}`, fecha: l.recibido_at, leadId: l.id });
// 2. cotizaciones históricas cargadas en la base
const { rows: cot } = await db.query(`select codigo, cliente, telefono, atencion, correo, fecha from cotizaciones_historicas where coalesce(telefono, '') <> ''`);
for (const h of cot) agregar(null, h.cliente, partirTels(h.telefono), { nombre: h.atencion, email: h.correo, fuente: `cotización ${h.codigo}`, fecha: h.fecha });
// 3-5. los JSON del import del Excel
const leer = (f) => { const j = JSON.parse(readFileSync(`scripts/data/${f}.json`, "utf8")); return Array.isArray(j) ? j : (j.filas || j.data || Object.values(j)[0]); };
for (const x of leer("oportunidades-historicas")) agregar(x.doc, x.razon, [...new Set([...partirTels(x.telefono), ...partirTels(x.telCel), ...partirTels(x.telFijo)])], { nombre: x.contacto, cargo: x.cargo, email: x.email, fuente: `Excel del comercial ${x.comercial ?? ""} (${x.hoja ?? "oportunidades"})`, fecha: x.fechaEstado });
for (const x of leer("ventas-historicas-COTIZ-v2")) agregar(x.numDoc, x.razon, [...new Set([...partirTels(x.telCel), ...partirTels(x.telFijo)])], { nombre: x.contacto, email: x.email, fuente: `Excel COTIZ ${x.comercialCarpeta ?? ""} ${x.ppto ?? ""}`.trim(), fecha: x.fEstado });
for (const x of leer("cotizaciones-historicas")) agregar(null, x.cliente, partirTels(x.telefono), { nombre: x.atencion, email: x.correo, fuente: `cotización ${x.serie ?? ""}${x.correlativo ?? ""}-${String(x.anio ?? "").slice(-2)}`, fecha: x.fecha });

// ── consolidar por ficha: teléfonos distintos, el más reciente primero ─────
const fechaMs = (f) => (f ? new Date(f).getTime() || 0 : 0);
const porCuenta = new Map();
for (const c of cand) {
  const m = porCuenta.get(c.cuenta.id) ?? new Map();
  porCuenta.set(c.cuenta.id, m);
  const prev = m.get(c.telefono);
  const mejor = !prev || (c.nivel === "doc" && prev.nivel !== "doc") || (c.nivel === prev.nivel && fechaMs(c.fecha) > fechaMs(prev.fecha)) || (!prev.nombre && c.nombre);
  const leadIds = new Set(prev?.leadIds ?? []);
  if (c.leadId) leadIds.add(c.leadId);
  m.set(c.telefono, { ...(mejor ? c : prev), leadIds });
}
const plan = [];
for (const m of porCuenta.values()) {
  const tels = [...m.values()].sort((a, b) => (a.nivel === b.nivel ? fechaMs(b.fecha) - fechaMs(a.fecha) : a.nivel === "doc" ? -1 : 1)).slice(0, 3);
  plan.push({ cuenta: tels[0].cuenta, tels });
}
const porNivel = { doc: 0, nombre: 0 };
const porComercial = {};
for (const p of plan) {
  porNivel[p.tels[0].nivel]++;
  porComercial[p.cuenta.codigo_comercial] = (porComercial[p.cuenta.codigo_comercial] ?? 0) + 1;
}
console.log(`fichas recuperables: ${plan.length} (por RUC/DNI ${porNivel.doc}, por nombre exacto ${porNivel.nombre})`);
console.log("por comercial:", JSON.stringify(porComercial));
console.log("\nmuestra:");
for (const p of plan.slice(0, 12)) console.log(` ${p.cuenta.codigo_comercial} · ${p.cuenta.razon_social} → ${p.tels.map((t) => `${t.telefono} (${t.nombre || "sin nombre"}, ${t.fuente}, ${t.nivel})`).join(" | ")}`);
writeFileSync(process.env.SALIDA ?? "scripts/data/_plan-telefonos.json", JSON.stringify(plan.map((p) => ({ cuenta_id: p.cuenta.id, razon_social: p.cuenta.razon_social, comercial: p.cuenta.codigo_comercial, tels: p.tels.map(({ cuenta: _c, leadIds, ...t }) => ({ ...t, leadIds: [...leadIds] })) })), null, 1));

if (process.env.APLICAR !== "1") {
  console.log("\n(sin aplicar: APLICAR=1 para crear los contactos)");
  await db.end();
  process.exit(0);
}

// ── aplicar ──────────────────────────────────────────────────────────────
const ES_EMPRESA = /S\.?A\.?C?\b|E\.?I\.?R\.?L|S\.?R\.?L|LTDA|SOCIEDAD|EMPRESA|ASOCIACION|COOPERATIVA|MUNICIPALIDAD|HOTEL|HOSTAL|CLINICA|LAVANDERIA|INVERSIONES|CORPORACION|COMPA[ÑN]IA|\bCIA\b|UNIVERSIDAD|INSTITUTO|COLEGIO|MINERA|CONSORCIO|GRUPO|SERVICIOS|INDUSTRIA/i;
let contactos = 0, unidos = 0;
await db.query("begin");
for (const p of plan) {
  const esPersona = !ES_EMPRESA.test(p.cuenta.razon_social);
  for (let i = 0; i < p.tels.length; i++) {
    const t = p.tels[i];
    const nombre = (t.nombre && String(t.nombre).trim()) || (esPersona ? p.cuenta.razon_social : "Contacto");
    const cargo = `${t.cargo ? String(t.cargo).trim() + " · " : ""}Recuperado el 17-09-2026 de ${t.fuente}${t.nivel === "nombre" ? " (coincide por nombre, confirmar)" : ""}`.slice(0, 200);
    await db.query(`insert into contactos (cuenta_id, nombre, telefono, email, cargo, es_principal) values ($1, $2, $3, $4, $5, $6)`, [p.cuenta.id, nombre.slice(0, 120), t.telefono, (t.email && String(t.email).trim().slice(0, 120)) || null, cargo, i === 0]);
    contactos++;
    const ids = [...t.leadIds];
    if (ids.length) {
      const r = await db.query(`update leads set cuenta_id = $1 where id = any($2::uuid[]) and cuenta_id is null`, [p.cuenta.id, ids]);
      unidos += r.rowCount;
    }
  }
}
await db.query("commit");
console.log(`\naplicado: ${contactos} contactos en ${plan.length} fichas; ${unidos} registros de Central unidos a su ficha`);
await db.end();
