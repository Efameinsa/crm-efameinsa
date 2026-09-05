// La otra mitad de la guardia: que lo anulado no cuente, TAMBIÉN en la base.
//
// Ya existe `src/lib/ventas-anuladas.test.ts`: recorre el código y exige que
// toda consulta a `ventas` filtre las anuladas o declare por escrito que no.
// Está verde desde hace semanas y hace bien su trabajo — pero SOLO LEE
// TYPESCRIPT, y las métricas no se calculan en TypeScript. Se calculan en
// funciones y en una vista de PostgreSQL, donde esa prueba no llega.
//
// El 05-09 eso costó caro: un cierre anulado de Katerine siguió sumando en su
// semana, en el tablero de gerencia y en la supervisión diaria, porque la
// vista `v_ventas_detalle` y tres funciones no filtraban (migración 0174).
//
// Este script cierra el hueco. Lee el catálogo VIVO —no las migraciones, que
// pueden haber quedado atrás porque las funciones se parchan en caliente— y
// exige lo mismo que la prueba de TypeScript: quien lee `ventas` filtra
// `anulada_at`, quien lee `informes_cierre` filtra `anulado_at`, o está acá
// abajo con su razón escrita.
//
// Uso:  npm run db:auditar-anuladas
// Devuelve código 1 si aparece algo sin justificar, para poder encadenarlo.

import pg from "pg";

// Quien NO filtra, y por qué está bien que no lo haga.
const JUSTIFICADAS = new Map([
  ["siguiente_correlativo_informe",
    "TIENE que ver los anulados: salta esos números para no reutilizarlos (regla de la casa: anular, no borrar)."],
  ["emitir_informe",
    "Comprueba que el correlativo no choque con otro informe, anulado incluido. Actúa sobre UN informe por su id."],
  ["corregir_informe_emitido",
    "Corrige UN informe y su venta, buscados por id. No cuenta nada."],
  ["liberar_pedido_postventa",
    "Trabaja sobre UN informe por su id."],
  ["agregar_adjuntos_cierre_sellado",
    "Agrega adjuntos a UN informe por su id."],
  ["atar_informe_a_venta",
    "Disparador: ata UN informe recién creado a su venta."],
  ["registrar_venta",
    "Escribe la venta; no la cuenta."],
  ["anular_cierre",
    "Es la función que anula. Necesita ver lo anulado."],
  ["grupo_economico",
    "Envoltorio de grupo_economico_def, que sí filtra desde la 0174. Solo aplica la RLS de quien pregunta."],
  ["resumen_gerencia",
    "Las métricas salen de v_ventas_detalle, que filtra desde la 0174. Lo que queda sin filtrar son contadores " +
    "de SALUD DE LOS DATOS sobre la tabla entera —ventas_sin_serie, ventas_historicas_total, ventas_crm_total—: " +
    "cuentan filas cargadas, no desempeño de nadie. PENDIENTE de confirmar con gerencia si esos tres deben " +
    "descontar las anuladas."],
]);

const bd = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();
const q = async (s, p = []) => (await bd.query(s, p)).rows;

const funciones = await q(`
  select p.proname nombre, pg_get_functiondef(p.oid) cuerpo
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f', 'p')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
   order by p.proname`);

const vistas = await q(`
  select table_name nombre, pg_get_viewdef(('public.' || table_name)::regclass, true) cuerpo
    from information_schema.views where table_schema = 'public' order by table_name`);

const objetos = [
  ...funciones.map((o) => ({ ...o, tipo: "función" })),
  ...vistas.map((o) => ({ ...o, tipo: "vista" })),
];

const sinJustificar = [];
const justificadas = [];

for (const o of objetos) {
  const faltas = [];
  if (/\bventas\b/.test(o.cuerpo) && !/anulada_at/.test(o.cuerpo)) faltas.push("ventas sin anulada_at");
  if (/\binformes_cierre\b/.test(o.cuerpo) && !/anulado_at/.test(o.cuerpo)) faltas.push("informes_cierre sin anulado_at");
  if (faltas.length === 0) continue;
  (JUSTIFICADAS.has(o.nombre) ? justificadas : sinJustificar).push({ ...o, faltas });
}

console.log(`Revisadas ${funciones.length} funciones y ${vistas.length} vistas del catálogo vivo.\n`);

if (justificadas.length) {
  console.log(`No filtran, y está bien (${justificadas.length}):`);
  for (const o of justificadas) console.log(`  · ${o.nombre} — ${JUSTIFICADAS.get(o.nombre)}`);
  console.log();
}

if (sinJustificar.length === 0) {
  console.log("✓ Ninguna función ni vista cuenta lo anulado sin declararlo.");
  await bd.end();
  process.exit(0);
}

console.log(`✗ ${sinJustificar.length} SIN JUSTIFICAR — estas contarían lo anulado:`);
for (const o of sinJustificar) console.log(`  · ${o.tipo} ${o.nombre}: ${o.faltas.join(" · ")}`);
console.log(
  "\nQué hacer: si cuenta para una métrica, agregar el filtro en una migración nueva\n" +
  "(parchando la definición viva con replace, nunca copiando el cuerpo).\n" +
  "Si de verdad tiene que ver lo anulado, agregarla a JUSTIFICADAS en este archivo\n" +
  "con la razón escrita.",
);
await bd.end();
process.exit(1);
