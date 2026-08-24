// Verifica las dos flexibilidades que pidió el área comercial el 24-08
// (migración 0062), y sobre todo que NO hayan roto la regla que las motiva:
//
//   · un BORRADOR se puede corregir antes de enviarlo
//   · se puede cotizar un equipo que todavía no está en el catálogo
//   · una cotización YA ENVIADA sigue siendo intocable — que es lo que evita
//     que el mismo número le llegue al cliente con dos precios distintos
//
// Trabaja sobre una cotización de prueba SIN correlativo ni código, así que no
// gasta numeración real, y la borra al terminar.
//
// Uso: node --env-file=.env.local scripts/probar-editar-cotizacion.mjs

import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL } = process.env;
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const bd = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

let fallas = 0;
const ok = (b, t, e = "") => { console.log(`${b ? "✓" : "✗"} ${t}${e ? ` — ${e}` : ""}`); if (!b) fallas++; };

// Sesión real del comercial dueño (la función exige auth.uid(); con pg directo
// la rechaza, y eso está bien).
const { data: perfil } = await admin.from("perfiles").select("id, nombre").ilike("codigo_comercial", "C5").single();
const { data: usuario } = await admin.auth.admin.getUserById(perfil.id);
let enlace = null;
for (let i = 1; i <= 4 && !enlace; i++) {
  const r = await admin.auth.admin.generateLink({ type: "magiclink", email: usuario.user.email });
  enlace = r.data?.properties ? r.data : null;
  if (!enlace) await new Promise((x) => setTimeout(x, i * 15000));
}
if (!enlace) { console.error("rate limit de Supabase; reintentar en un rato."); process.exit(1); }
const anon = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: sesion } = await anon.auth.verifyOtp({ token_hash: enlace.properties.hashed_token, type: "magiclink" });
const comercial = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  global: { headers: { Authorization: `Bearer ${sesion.session.access_token}` } },
});

const { rows: op } = await bd.query(
  `select id from oportunidades where comercial_id = $1 and updated_at < now() - interval '12 hours' limit 1`,
  [perfil.id],
);
const { rows: prod } = await bd.query(`select id from productos where activo limit 1`);
const { rows: creada } = await bd.query(
  `insert into cotizaciones (oportunidad_id, serie, cliente_snapshot, creada_por, subtotal, total, estado)
   values ($1,'EFAMEINSA','{}'::jsonb,$2,1000,1000,'borrador') returning id`,
  [op[0].id, perfil.id],
);
const id = creada[0].id;
await bd.query(
  `insert into cotizacion_items (cotizacion_id, producto_id, cantidad, precio_unitario, bajo_lista) values ($1,$2,1,1000,false)`,
  [id, prod[0].id],
);
console.log(`Cotización de prueba (sin número, no gasta correlativo) · ${perfil.nombre}\n`);

const items = [
  { producto_id: prod[0].id, cantidad: 2, precio_unitario: 1000 },
  { producto_id: null, descripcion: "SECADORA ELECTRICA PRIMUS FDE (fuera de catálogo)", cantidad: 1, precio_unitario: 2500 },
];

try {
  // ── BORRADOR: se corrige ──────────────────────────────────────────────────
  const { error: eEdit } = await comercial.rpc("editar_cotizacion", {
    p_cotizacion_id: id,
    p_items: items,
    p_condiciones: "Condiciones corregidas",
    p_vigencia_dias: 20,
  });
  ok(!eEdit, "el comercial puede corregir su BORRADOR", eEdit?.message ?? "");

  const { rows: d } = await bd.query(`select subtotal, condiciones, vigencia_dias from cotizaciones where id=$1`, [id]);
  const { rows: it } = await bd.query(`select producto_id, descripcion from cotizacion_items where cotizacion_id=$1`, [id]);
  ok(Number(d[0].subtotal) === 4500, "el subtotal se recalcula solo", `${d[0].subtotal}`);
  ok(d[0].condiciones === "Condiciones corregidas" && d[0].vigencia_dias === 20, "condiciones y vigencia se actualizan");
  ok(
    it.some((x) => x.producto_id === null && /PRIMUS FDE/.test(x.descripcion ?? "")),
    "acepta un equipo FUERA DE CATÁLOGO (mientras se termina de cargar el inventario)",
  );

  // ── La interfaz ofrece las dos cosas ─────────────────────────────────────
  const URL_APP = process.argv[2] ?? "http://localhost:3000";
  const ref2 = new URL(NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const val = "base64-" + Buffer.from(JSON.stringify(sesion.session)).toString("base64");
  const tro = val.match(/.{1,3180}/g);
  const cookie = tro.length === 1 ? `sb-${ref2}-auth-token=${tro[0]}` : tro.map((x, i) => `sb-${ref2}-auth-token.${i}=${x}`).join("; ");
  const { rows: opCot } = await bd.query(`select oportunidad_id from cotizaciones where id=$1`, [id]);
  const htmlFicha = await fetch(`${URL_APP}/comercial/oportunidades/${opCot[0].oportunidad_id}`, { headers: { cookie } })
    .then((r) => r.text())
    .then((t) => t.replace(/<!--s*-->/g, ""));
  ok(htmlFicha.includes("¿No está en el catálogo?"), "el cotizador ofrece agregar un equipo a mano");
  ok(htmlFicha.includes("Corregir"), "los borradores muestran el botón Corregir");
  const htmlEdit = await fetch(`${URL_APP}/comercial/oportunidades/${opCot[0].oportunidad_id}?editar=${id}`, { headers: { cookie } })
    .then((r) => r.text())
    .then((t) => t.replace(/<!--s*-->/g, ""));
  ok(htmlEdit.includes("Corrigiendo la cotización"), "con ?editar el cotizador entra en modo corrección");
  ok(htmlEdit.includes("Guardar cambios"), "  · y el botón dice Guardar cambios");

  // ── Un ítem tiene que decir algo ─────────────────────────────────────────
  try {
    await bd.query(`insert into cotizacion_items (cotizacion_id, cantidad, precio_unitario, bajo_lista) values ($1,1,10,false)`, [id]);
    ok(false, "un ítem sin producto NI descripción se rechaza");
  } catch (e) {
    ok(/item_identificable/.test(e.message), "un ítem sin producto NI descripción se rechaza");
  }

  // ── ENVIADA: intocable, que es el punto de la regla ──────────────────────
  // Existe una regla previa: una cotización pendiente de aprobación no se
  // puede enviar (constraint enviada_requiere_aprobacion). Se aprueba primero,
  // que es lo que haría gerencia, y recién ahí se envía.
  await bd.query(`update cotizaciones set estado_aprobacion='auto_aprobada' where id=$1`, [id]);
  await bd.query(`update cotizaciones set estado='enviada', enviada_at=now() where id=$1`, [id]);
  const { error: eEnv } = await comercial.rpc("editar_cotizacion", { p_cotizacion_id: id, p_items: items });
  ok(/ya salió al cliente/.test(eEnv?.message ?? ""), "una cotización ENVIADA ya no se edita", eEnv?.message?.slice(0, 48) ?? "");

  for (const [sql, texto, patron] of [
    [`update cotizaciones set total = total + 1 where id=$1`, "el trigger bloquea cambiarle el total", /no se modifica/],
    [`update cotizacion_items set precio_unitario = 1 where cotizacion_id=$1`, "el trigger bloquea cambiarle los equipos", /no se modifican/],
  ]) {
    try { await bd.query(sql, [id]); ok(false, texto); }
    catch (e) { ok(patron.test(e.message), texto); }
  }

  // ── La identidad del documento no cambia ni en borrador ──────────────────
  await bd.query(`update cotizaciones set estado='borrador', enviada_at=null where id=$1`, [id]);
  try {
    await bd.query(`update cotizaciones set correlativo = 9999 where id=$1`, [id]);
    ok(false, "el número no se cambia ni en borrador");
  } catch (e) {
    ok(/no se cambian/.test(e.message), "el número no se cambia ni en borrador");
  }
} finally {
  await bd.query(`set session_replication_role = replica`);
  await bd.query(`delete from cotizacion_items where cotizacion_id=$1`, [id]);
  await bd.query(`delete from cotizaciones where id=$1`, [id]);
  await bd.query(`set session_replication_role = default`);
  const { rows: q } = await bd.query(`select count(*) n from cotizaciones where id=$1`, [id]);
  const { rows: k } = await bd.query(`select ultimo from correlativos where clave='EFAMEINSA-2026'`);
  console.log(`\nLimpieza: quedan ${q[0].n} · correlativo intacto en ${k[0].ultimo}`);
  await bd.end();
}

console.log(fallas === 0 ? "\n✓ Todo verificado" : `\n✗ ${fallas} comprobación(es) fallaron`);
process.exit(fallas === 0 ? 0 : 1);
