// ============================================================
// CRM EFAMEINSA · La cuenta de POSTVENTA y su agenda
// ============================================================
// Reunión del 25-08 10:10: «atendemos urgente postventa, está esperando para
// que le deriven y comience a hacer sus cuestiones». Carlos definió cómo entra:
// «le das el acceso a la parte comercial, o sea, como si fuera un comercial».
//
// Este script hace tres cosas:
//   1. Deja lista la cuenta `postventa@efameinsa.com` (código PV) con
//      contraseña nueva y marcada como postventa, para que su trabajo no entre
//      en los indicadores de venta de los comerciales.
//   2. Carga su agenda real desde `R:\COPIA CRM POST VENTA\RESUMEN AGENDA DE
//      POST VENTA 25-08-2026.xlsx`, que es el documento con el que trabajan hoy.
//   3. Carga sus informes de soporte técnico de la misma planilla.
//
// POR QUÉ SE CARGA EL EXCEL Y NO SE EMPIEZA DE CERO. Si entra y su pantalla
// está vacía, no puede trabajar: su agenda son despachos y puestas en marcha ya
// comprometidos con clientes, con fechas que ya corren. Se sube lo que tienen.
//
// LO QUE NO HACE: cotizar. Carlos fue explícito — «para cotizar necesitamos la
// ficha [de repuestos] y todavía no ha sido subida», así que por ahora postventa
// sigue cotizando a mano, fuera del sistema.
//
// Es idempotente: vuelve a correrlo y no duplica filas (las reconoce por
// cliente + equipo + fecha).
//
// Uso: node --env-file=.env.local scripts/crear-postventa.mjs [--aplicar]

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import xlsx from "xlsx";

const APLICAR = process.argv.includes("--aplicar");
const AGENDA = "R:/COPIA CRM POST VENTA/RESUMEN AGENDA DE POST VENTA 25-08-2026.xlsx";
const CORREO = "postventa@efameinsa.com";
const NOMBRE = "Post Venta";
const CODIGO = "PV";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey || !process.env.DATABASE_URL) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o DATABASE_URL.");
  process.exit(1);
}

// Excel guarda las fechas como días desde el 30-12-1899. Las celdas que no son
// fecha ("POR COORDINAR", "MIERCOLES 21-04-26") se dejan pasar: su texto se
// conserva aparte, que es justamente para lo que existen las columnas *_nota.
function fechaDeExcel(v) {
  if (typeof v !== "number" || v < 20000 || v > 60000) return null;
  const ms = Math.round((v - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}
const texto = (v) => {
  const s = String(v ?? "").replace(/\r/g, " ").replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
};
/** "USD 1,002.82" / "$ 15, 694.00" / 4150 → 1002.82 / 15694 / 4150 */
function monto(v) {
  if (typeof v === "number") return v > 0 ? v : null;
  const s = String(v ?? "").replace(/[^\d.,]/g, "").replace(/,/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}
/** El Excel dice "Repuesto", "Venta de equipo", "Garantía 24 meses", "VENTA"… */
function tipoServicio(v) {
  const s = (texto(v) ?? "").toLowerCase();
  if (!s) return "otro";
  if (s.includes("repuesto")) return "Repuesto";
  if (s.includes("garant")) return "Garantía";
  if (s.includes("mantenim")) return "Mantenimiento";
  if (s.includes("venta")) return "Venta de equipo";
  return texto(v);
}

const auth = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

// ── 1. La cuenta ────────────────────────────────────────────────────────────
const { data: existentes } = await auth.auth.admin.listUsers({ page: 1, perPage: 1000 });
let usuario = existentes?.users.find((u) => u.email?.toLowerCase() === CORREO);
const clave = `Postventa-${randomBytes(4).toString("hex")}`;

if (APLICAR) {
  if (usuario) {
    await auth.auth.admin.updateUserById(usuario.id, { password: clave, email_confirm: true });
    console.log("La cuenta ya existía (venía creada sin usarse); se le puso contraseña nueva.");
  } else {
    const { data, error } = await auth.auth.admin.createUser({
      email: CORREO, password: clave, email_confirm: true, user_metadata: { nombre: NOMBRE },
    });
    if (error) throw error;
    usuario = data.user;
    console.log("Cuenta creada.");
  }
  await bd.query(
    `insert into perfiles (id, nombre, rol, codigo_comercial, activo, es_postventa)
     values ($1, $2, 'comercial', $3, true, true)
     on conflict (id) do update set
       nombre = excluded.nombre, rol = 'comercial', codigo_comercial = excluded.codigo_comercial,
       activo = true, es_postventa = true`,
    [usuario.id, NOMBRE, CODIGO],
  );
} else if (!usuario) {
  console.log("La cuenta todavía no existe; se creará al aplicar.");
}
const responsable = usuario?.id ?? null;

// ── 2. La agenda de postventa ───────────────────────────────────────────────
const wb = xlsx.readFile(AGENDA);
const agenda = xlsx.utils.sheet_to_json(wb.Sheets["RESUMEN DE AGENDA DE POST VENTA"], { header: 1, defval: "" });
const filas = [];
for (const f of agenda.slice(1)) {
  const cliente = texto(f[2]);
  const equipo = texto(f[4]);
  if (!cliente && !equipo) continue;
  // La cabecera se repite dentro de la hoja cuando la imprimen por bloques.
  if (String(f[0]).toUpperCase() === "ITEM") continue;
  filas.push({
    cliente_texto: cliente,
    fecha_confirmacion: fechaDeExcel(f[1]),
    ubicacion: texto(f[3]),
    equipo,
    tipo_servicio: tipoServicio(f[5]),
    observaciones: texto(f[6]),
    monto: monto(f[7]),
    forma_pago: texto(f[8]),
    confirmacion_abono: texto(f[9]),
    prueba_embalaje: texto(f[10]),
    fecha_despacho: fechaDeExcel(f[11]),
    despacho_nota: typeof f[11] === "number" ? null : texto(f[11]),
    planos_preinstalacion: texto(f[12]),
    puesta_en_marcha: fechaDeExcel(f[13]),
    puesta_nota: typeof f[13] === "number" ? null : texto(f[13]),
    completado: (texto(f[14]) ?? "").toUpperCase().startsWith("COMPLET"),
    informe: texto(f[15]),
  });
}

// ── 3. Soporte técnico ──────────────────────────────────────────────────────
const sop = xlsx.utils.sheet_to_json(wb.Sheets["SOPORTE TECNICO"], { header: 1, defval: "" });
const soportes = [];
for (const f of sop) {
  if (String(f[0]).toUpperCase() === "ITEM" || !texto(f[1])) continue;
  if (typeof f[0] !== "number") continue;
  soportes.push({
    cliente_texto: texto(f[1]),
    equipo: texto(f[2]),
    detalle: texto(f[3]),
    fecha_ejecutado: fechaDeExcel(f[4]),
    fecha_envio: fechaDeExcel(f[5]),
  });
}

console.log(`\nAgenda de postventa leída : ${filas.length} filas`);
console.log(`  completadas             : ${filas.filter((f) => f.completado).length}`);
console.log(`  pendientes              : ${filas.filter((f) => !f.completado).length}`);
console.log(`  con fecha de despacho   : ${filas.filter((f) => f.fecha_despacho).length}`);
console.log(`  con nota en vez de fecha: ${filas.filter((f) => !f.fecha_despacho && f.despacho_nota).length}`);
const porTipo = {};
for (const f of filas) porTipo[f.tipo_servicio] = (porTipo[f.tipo_servicio] ?? 0) + 1;
console.log("  por tipo de servicio    :", JSON.stringify(porTipo));
console.log(`Informes de soporte       : ${soportes.length} filas`);

if (!APLICAR) {
  console.log("\nNada se ha modificado. Para aplicarlo:");
  console.log("  node --env-file=.env.local scripts/crear-postventa.mjs --aplicar\n");
  await bd.end();
  process.exit(0);
}

// ── 4. Se sube, sin duplicar ────────────────────────────────────────────────
let nuevas = 0;
for (const f of filas) {
  const { rows } = await bd.query(
    `select id from servicios_postventa
      where origen = 'excel'
        and coalesce(cliente_texto,'') = coalesce($1,'')
        and coalesce(equipo,'') = coalesce($2,'')
        and coalesce(fecha_confirmacion, '1900-01-01') = coalesce($3::date, '1900-01-01')`,
    [f.cliente_texto, f.equipo, f.fecha_confirmacion],
  );
  if (rows.length) continue;
  await bd.query(
    `insert into servicios_postventa
       (cliente_texto, fecha_confirmacion, ubicacion, equipo, tipo_servicio, observaciones, monto,
        forma_pago, confirmacion_abono, prueba_embalaje, fecha_despacho, despacho_nota,
        planos_preinstalacion, puesta_en_marcha, puesta_nota, completado, informe, responsable_id, origen)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'excel')`,
    [f.cliente_texto, f.fecha_confirmacion, f.ubicacion, f.equipo, f.tipo_servicio, f.observaciones,
     f.monto, f.forma_pago, f.confirmacion_abono, f.prueba_embalaje, f.fecha_despacho, f.despacho_nota,
     f.planos_preinstalacion, f.puesta_en_marcha, f.puesta_nota, f.completado, f.informe, responsable],
  );
  nuevas++;
}
let nuevosSop = 0;
for (const s of soportes) {
  const { rows } = await bd.query(
    `select id from soporte_tecnico
      where origen = 'excel' and coalesce(cliente_texto,'') = coalesce($1,'')
        and coalesce(equipo,'') = coalesce($2,'')`,
    [s.cliente_texto, s.equipo],
  );
  if (rows.length) continue;
  await bd.query(
    `insert into soporte_tecnico (cliente_texto, equipo, detalle, fecha_ejecutado, fecha_envio, responsable_id, origen)
     values ($1,$2,$3,$4,$5,$6,'excel')`,
    [s.cliente_texto, s.equipo, s.detalle, s.fecha_ejecutado, s.fecha_envio, responsable],
  );
  nuevosSop++;
}

// Cruce contra la cartera. Solo dos filas del Excel traen "RUC - RAZÓN SOCIAL";
// el resto es el nombre a secas, así que se cruza por documento y, si no, por
// razón social EXACTA y solo cuando hay una única cuenta candidata. Un cruce
// aproximado por nombre acá pondría el despacho de un cliente en la ficha de
// otro, y esta pantalla la va a mirar Central para responderle al que llama.
const { rowCount: porDoc } = await bd.query(
  `update servicios_postventa s set cuenta_id = c.id
     from cuentas c
    where s.cuenta_id is null and s.cliente_texto is not null
      and c.num_doc is not null and s.cliente_texto like c.num_doc || '%'`,
);
const { rowCount: porNombre } = await bd.query(
  `update servicios_postventa s set cuenta_id = u.id
     from (
       select upper(btrim(razon_social)) nombre, (array_agg(id))[1] id
         from cuentas group by 1 having count(*) = 1
     ) u
    where s.cuenta_id is null and upper(btrim(s.cliente_texto)) = u.nombre`,
);
const cruzadas = porDoc + porNombre;

console.log(`\n✓ ${nuevas} servicios y ${nuevosSop} informes de soporte cargados.`);
console.log(`✓ ${cruzadas} servicios enlazados a su cliente del CRM por RUC.`);
console.log(`\n  Correo     : ${CORREO}`);
console.log(`  Contraseña : ${clave}`);
console.log(`  Código     : ${CODIGO}\n`);
await bd.end();
