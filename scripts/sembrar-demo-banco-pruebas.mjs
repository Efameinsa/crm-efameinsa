// Completa el banco de pruebas (0088) para la demo de gerencia del 31-08:
// fotos de producto en tres informes de ejemplo y cuatro atenciones de la
// pista técnica en etapas distintas. SOLO toca filas es_prueba = true — el
// mundo que únicamente ven las cuentas de práctica; los datos reales ni se
// leen. Idempotente: borra sus propias atenciones (marcadas) antes de crear.
//
// Uso: node --env-file=.env.local scripts/sembrar-demo-banco-pruebas.mjs
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MARCA = "[demo 31-08]";
const PRACTICA = "9169903f-1b7a-46cf-9cb7-4a1891a5b02e"; // Postventa (práctica)
const CARPETA_FOTOS = process.argv[2] ?? "C:/Users/diseno/AppData/Local/Temp/claude/C--Users-diseno--local-bin/a59d097c-9ac5-4e22-9846-e993bb1193ec/scratchpad/fotos-demo";

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── 1 · Las fotos de producto al bucket, bajo un prefijo claramente de prueba ──
const FOTOS = [
  { local: "primus/image1.jpeg", path: "pruebas/informes/lavadora-primus.jpeg", nombre: "Equipo instalado (ejemplo).jpeg" },
  { local: "Secadora_Giant_C+_El/image1.jpeg", path: "pruebas/informes/secadora-giant-1.jpeg", nombre: "Vista frontal (ejemplo).jpeg" },
  { local: "Secadora_Giant_C+_El/image2.jpeg", path: "pruebas/informes/secadora-giant-2.jpeg", nombre: "Equipo operando (ejemplo).jpeg" },
];
for (const f of FOTOS) {
  const cuerpo = readFileSync(join(CARPETA_FOTOS, f.local));
  const { error } = await admin.storage.from("adjuntos").upload(f.path, cuerpo, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`subiendo ${f.path}: ${error.message}`);
  f.tamano = cuerpo.length;
  console.log(` ✓ foto subida: ${f.path} (${Math.round(cuerpo.length / 1024)} KB)`);
}
const foto = (i) => ({ path: FOTOS[i].path, nombre: FOTOS[i].nombre, tipo: "image/jpeg", tamano: FOTOS[i].tamano });

// ── 2 · Tres informes de ejemplo reciben sus fotos ──
// 901 = puesta en marcha de la LAVADORA PRIMUS · 902 = SECADORA GIANT ·
// 908 = evaluación de la SECADORA LG. Solo si son es_prueba.
const asignaciones = [
  { correlativo: 901, fotos: [foto(0)] },
  { correlativo: 902, fotos: [foto(1), foto(2)] },
  { correlativo: 908, fotos: [foto(2)] },
];
for (const a of asignaciones) {
  const r = await pg.query(
    `update informes_servicio set fotos = $1::jsonb, ciclos = coalesce(ciclos, 120)
     where correlativo = $2 and anio = 2026 and es_prueba returning id`,
    [JSON.stringify(a.fotos), a.correlativo],
  );
  console.log(` ${r.rowCount ? "✓" : "✗"} informe ${a.correlativo}-2026: ${a.fotos.length} foto(s)`);
}

// ── 3 · Cuatro atenciones de ejemplo, una por momento del flujo ──
await pg.query(`delete from atenciones where es_prueba and detalle like '%' || $1`, [MARCA]);

const cuenta = async (nombre) =>
  (await pg.query(`select id, razon_social from cuentas where razon_social like $1 || '%' limit 1`, [nombre])).rows[0];
const equipo = async (serie) =>
  (await pg.query(`select id, modelo_texto from equipos_instalados where serie = $1 and es_prueba`, [serie])).rows[0];

const hotel = await cuenta("HOTEL PRUEBA MIRAFLORES");
const lavanderia = await cuenta("LAVANDERIA PRUEBA ANDINA");
const textil = await cuenta("TEXTIL PRUEBA DEL SUR");
const clinica = await cuenta("CLINICA PRUEBA SAN MARTIN");
const eq219 = await equipo("PRB-2400219");
const eq320 = await equipo("PRB-2400320");
const eq421 = await equipo("PRB-2400421");

const ahora = Date.now();
const h = (n) => new Date(ahora - n * 36e5).toISOString();
const manana10 = new Date(ahora + 864e5);
manana10.setHours(10, 0, 0, 0);

const filas = [
  // a. Recién devuelta por Central: aparece en «Mi día» esperando que alguien
  //    la tome y verifique la garantía.
  {
    cuenta: hotel, tipo: "problema_tecnico", etapa: "registro",
    equipoId: eq219?.id, equipoTexto: `SECADORA GIANT C MAX S: PRB-2400219`,
    campos: { solicitado_at: h(1), registrado_at: h(0.5) },
    detalle: `No enciende el panel después de un corte de luz ${MARCA}`,
  },
  // b. Diagnosticada: es la que se puede AGENDAR desde el calendario.
  {
    cuenta: lavanderia, tipo: "solicitud_mantenimiento", etapa: "diagnostico",
    clasificacion: "preventivo", en_garantia: false, asignado_a: PRACTICA,
    equipoId: eq320?.id, equipoTexto: `LAVADORA TITAN MAX S: PRB-2400320`,
    campos: { solicitado_at: h(30), registrado_at: h(28), diagnosticado_at: h(4), garantia_verificada_at: h(28) },
    detalle: `Mantenimiento de las 2.400 horas, cliente pide fecha ${MARCA}`,
  },
  // c. Planificada para mañana a las 10, con técnico: se ve en el calendario.
  {
    cuenta: textil, tipo: "puesta_en_marcha", etapa: "planificacion",
    clasificacion: "garantia", en_garantia: true, asignado_a: PRACTICA, tecnico: "J. Ramos (ejemplo)",
    equipoId: eq421?.id, equipoTexto: `SECADORA UNIMAC UT055 S: PRB-2400421`,
    campos: { solicitado_at: h(50), registrado_at: h(49), diagnosticado_at: h(26), garantia_verificada_at: h(49), programada_at: manana10.toISOString() },
    detalle: `Puesta en marcha del equipo nuevo del segundo piso ${MARCA}`,
  },
  // d. Cerrada con su informe: completa las tarjetas Recibidas/Cerradas.
  {
    cuenta: clinica, tipo: "problema_tecnico", etapa: "cierre",
    clasificacion: "garantia", en_garantia: true, asignado_a: PRACTICA, tecnico: "J. Ramos (ejemplo)",
    resultado: "resuelto", conformidad_nombre: "R. Delgado (ejemplo)",
    campos: {
      solicitado_at: h(120), registrado_at: h(119), diagnosticado_at: h(100), garantia_verificada_at: h(119),
      programada_at: h(80), atendido_at: h(75), pruebas_at: h(74), conformidad_at: h(73), cerrado_at: h(72),
    },
    detalle: `Cambio de sensor de temperatura, cubierto por garantía ${MARCA}`,
  },
];

for (const f of filas) {
  const informe =
    f.etapa === "cierre"
      ? (await pg.query(`select id from informes_servicio where correlativo = 904 and anio = 2026 and es_prueba`)).rows[0]?.id
      : null;
  await pg.query(
    `insert into atenciones (cuenta_id, cliente_texto, equipo_id, equipo_texto, tipo, clasificacion, etapa,
       en_garantia, asignado_a, tecnico, resultado, conformidad_nombre, informe_servicio_id, detalle, es_prueba,
       solicitado_at, registrado_at, diagnosticado_at, garantia_verificada_at, programada_at, atendido_at,
       pruebas_at, conformidad_at, cerrado_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,
       $15,$16,$17,$18,$19,$20,$21,$22,$23)`,
    [
      f.cuenta?.id ?? null, f.cuenta?.razon_social ?? null, f.equipoId ?? null, f.equipoTexto ?? null,
      f.tipo, f.clasificacion ?? null, f.etapa, f.en_garantia ?? null, f.asignado_a ?? null, f.tecnico ?? null,
      f.resultado ?? null, f.conformidad_nombre ?? null, informe, f.detalle,
      f.campos.solicitado_at, f.campos.registrado_at ?? null, f.campos.diagnosticado_at ?? null,
      f.campos.garantia_verificada_at ?? null, f.campos.programada_at ?? null, f.campos.atendido_at ?? null,
      f.campos.pruebas_at ?? null, f.campos.conformidad_at ?? null, f.campos.cerrado_at ?? null,
    ],
  );
  console.log(` ✓ atención de ejemplo: ${f.cuenta?.razon_social} · ${f.tipo} · ${f.etapa}`);
}

const { rows: [resumen] } = await pg.query(
  `select (select count(*) from atenciones where es_prueba) atenciones,
          (select count(*) from informes_servicio where es_prueba and jsonb_array_length(coalesce(fotos,'[]'::jsonb))>0) informes_con_fotos`,
);
console.log(`\nBanco de pruebas: ${resumen.atenciones} atenciones, ${resumen.informes_con_fotos} informes con fotos.`);
await pg.end();
