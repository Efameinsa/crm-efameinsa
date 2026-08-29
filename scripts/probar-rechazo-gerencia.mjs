// ¿EL GERENTE PUEDE RECHAZAR DE VERDAD?
//
// El sondeo anterior solo probaba la PUERTA (el control de rol). Esto hace el
// rechazo entero, de punta a punta, como lo hace el botón: se arma una
// cotización de práctica con un precio por debajo de lista, se comprueba que
// queda esperando a gerencia, el gerente la RECHAZA, y después se comprueba en
// la base que quedó rechazada y con el equipo marcado. Lo mismo con aprobar.
//
// NO TOCA NADA REAL: la cotización la crea la cuenta de prácticas (C0) sobre su
// propia oportunidad, y al final se borra —con sus ítems— pase lo que pase.
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const GERENTE = process.env.GERENTE ?? "crcabrejos@efameinsa.com";
const PRACTICA = "comercial0@gmail.com";

let fallas = 0;
const check = (b, t) => {
  console.log(`${b ? "  ✓" : "  ✗ FALLA:"} ${t}`);
  if (!b) fallas++;
};

async function sesion(correo) {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: correo });
  if (error) throw error;
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error: e2 } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (e2) throw e2;
  return c;
}

const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();

const { rows: quien } = await bd.query(
  "select p.id from perfiles p join auth.users u on u.id = p.id where u.email = $1",
  [PRACTICA],
);
const { rows: oportunidades } = await bd.query(
  "select id from oportunidades where comercial_id = $1 and cerrada_at is null order by created_at desc limit 1",
  [quien[0].id],
);
if (oportunidades.length === 0) {
  console.log("La cuenta de prácticas no tiene ninguna oportunidad abierta: no hay dónde cotizar.");
  await bd.end();
  process.exit(1);
}
const oportunidad = oportunidades[0].id;

// Un equipo con precio de lista, para poder cotizarlo POR DEBAJO.
const { rows: precios } = await bd.query(
  "select pp.producto_id, pp.precio from precios_producto pp join productos p on p.id = pp.producto_id where pp.precio > 1000 and p.activo limit 1",
);
const producto = precios[0];
const precioLista = Number(producto.precio);
const precioPedido = Math.round(precioLista * 0.7); // 30 % por debajo: pide aprobación seguro

const creadas = [];
async function limpiar() {
  for (const id of creadas) {
    await bd.query("delete from cotizacion_items where cotizacion_id = $1", [id]);
    await bd.query("delete from cotizaciones where id = $1", [id]);
  }
  console.log(`\n(se borraron ${creadas.length} cotización(es) de práctica)`);
}

async function cotizacionDePrueba(comercial) {
  const { data, error } = await comercial.rpc("crear_cotizacion", {
    p_oportunidad_id: oportunidad,
    p_serie: "EFAMEINSA",
    p_items: [
      {
        producto_id: producto.producto_id,
        cantidad: 1,
        precio_unitario: precioPedido,
        descripcion: "PRUEBA — verificación de rechazo de gerencia",
      },
    ],
    p_condiciones: "PRUEBA interna, se borra sola.",
    p_vigencia_dias: 15,
  });
  if (error) throw new Error(`No se pudo crear la cotización de práctica: ${error.message}`);
  creadas.push(data);
  return data;
}

try {
  const comercial = await sesion(PRACTICA);
  const gerente = await sesion(GERENTE);
  console.log(`Equipo de prueba: lista ${precioLista} · se pide ${precioPedido}\n`);

  // ── RECHAZAR ────────────────────────────────────────────────────────────
  console.log(`EL GERENTE RECHAZA (${GERENTE})`);
  const cotA = await cotizacionDePrueba(comercial);
  const { rows: itemsA } = await bd.query(
    "select id, requiere_aprobacion from cotizacion_items where cotizacion_id = $1",
    [cotA],
  );
  const { rows: estadoA } = await bd.query("select estado, estado_aprobacion from cotizaciones where id = $1", [cotA]);
  check(estadoA[0].estado_aprobacion === "pendiente_gerencia", `queda esperando a gerencia (${estadoA[0].estado_aprobacion})`);
  check(itemsA[0].requiere_aprobacion === true, "el equipo pide aprobación por estar bajo lista");

  const rechazo = await gerente.rpc("resolver_aprobacion_cotizacion", {
    p_cotizacion_id: cotA,
    p_aprobados: [],
    p_rechazados: [itemsA[0].id],
    p_nota: "PRUEBA: se puede bajar hasta X, no más.",
  });
  check(!rechazo.error, `el rechazo se guarda${rechazo.error ? ` — ${rechazo.error.message}` : ""}`);
  check(rechazo.data === "rechazada_gerencia", `devuelve «rechazada_gerencia» (${JSON.stringify(rechazo.data)})`);

  const { rows: despuesA } = await bd.query(
    "select estado_aprobacion, aprobada_por, nota_gerencia from cotizaciones where id = $1",
    [cotA],
  );
  const { rows: itemA2 } = await bd.query("select aprobado from cotizacion_items where id = $1", [itemsA[0].id]);
  check(despuesA[0].estado_aprobacion === "rechazada_gerencia", `en la base queda rechazada (${despuesA[0].estado_aprobacion})`);
  check(itemA2[0].aprobado === false, "el equipo queda marcado como no aprobado");
  check(!!despuesA[0].nota_gerencia, `la nota queda guardada («${despuesA[0].nota_gerencia}»)`);
  check(!!despuesA[0].aprobada_por, "queda registrado quién decidió");

  // ── APROBAR ─────────────────────────────────────────────────────────────
  console.log("\nY TAMBIÉN PUEDE APROBAR");
  const cotB = await cotizacionDePrueba(comercial);
  const { rows: itemsB } = await bd.query("select id from cotizacion_items where cotizacion_id = $1", [cotB]);
  const aprobacion = await gerente.rpc("resolver_aprobacion_cotizacion", {
    p_cotizacion_id: cotB,
    p_aprobados: [itemsB[0].id],
    p_rechazados: [],
    p_nota: null,
  });
  check(!aprobacion.error, `la aprobación se guarda${aprobacion.error ? ` — ${aprobacion.error.message}` : ""}`);
  check(aprobacion.data === "aprobada_gerencia", `devuelve «aprobada_gerencia» (${JSON.stringify(aprobacion.data)})`);

  // ── LA OTRA CUENTA DE GERENCIA ──────────────────────────────────────────
  console.log("\nLA OTRA CUENTA DE GERENCIA HACE LO MISMO (kycabrejos@efameinsa.com)");
  const gerenta = await sesion("kycabrejos@efameinsa.com");
  const cotC = await cotizacionDePrueba(comercial);
  const { rows: itemsC } = await bd.query("select id from cotizacion_items where cotizacion_id = $1", [cotC]);
  const rechazo2 = await gerenta.rpc("resolver_aprobacion_cotizacion", {
    p_cotizacion_id: cotC,
    p_aprobados: [],
    p_rechazados: [itemsC[0].id],
    p_nota: "PRUEBA",
  });
  check(
    !rechazo2.error && rechazo2.data === "rechazada_gerencia",
    `rechaza${rechazo2.error ? ` — ${rechazo2.error.message}` : " correctamente"}`,
  );
} finally {
  await limpiar();
  await bd.end();
}

console.log(fallas === 0 ? "\nTODO VERDE\n" : `\n${fallas} FALLA(S)\n`);
process.exit(fallas ? 1 : 0);
