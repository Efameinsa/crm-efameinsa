// Datos de PRÁCTICA para probar el módulo de almacén de punta a punta (0246).
// Todo nace con es_prueba = true: solo lo ven las cuentas de práctica
// (practica.almacen@, practica.postventa@ y central0@). Se puede correr las
// veces que haga falta: borra lo que sembró antes (etiqueta [PRUEBA ALMACÉN])
// y lo vuelve a crear con las fechas de hoy.
//   node --env-file=.env.local scripts/datos-prueba-almacen.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const TAG = "[PRUEBA ALMACÉN]";
const CLAVE_ALM0 = "Almacen-Practica-2026";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();
const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const dia = (n) => new Date(new Date(hoy + "T12:00:00-05:00").getTime() + n * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Lima" });

// ── 1. La cuenta de práctica del almacén ─────────────────────────────────
const { data: lista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
let u = lista.users.find((x) => x.email === "practica.almacen@efameinsa.com");
if (!u) {
  const r = await admin.auth.admin.createUser({ email: "practica.almacen@efameinsa.com", password: CLAVE_ALM0, email_confirm: true });
  if (r.error) throw r.error;
  u = r.data.user;
} else {
  await admin.auth.admin.updateUserById(u.id, { password: CLAVE_ALM0 });
}
await pg.query(
  `insert into perfiles (id, nombre, rol, codigo_comercial, activo, es_almacen, es_prueba, meta_mensual)
   values ($1, 'Almacén (práctica)', 'comercial', 'ALM0', true, true, true, 0)
   on conflict (id) do update set nombre = excluded.nombre, es_almacen = true, es_prueba = true, activo = true, codigo_comercial = 'ALM0'`,
  [u.id],
);
const ALM0 = u.id;
const { rows: [pv0] } = await pg.query("select id from perfiles where codigo_comercial = 'PV0'");
const { rows: [central0] } = await pg.query("select id from perfiles where nombre = 'Central (práctica)'");
console.log("cuenta practica.almacen@efameinsa.com lista (ALM0)");

// ── 2. Limpieza de la siembra anterior ───────────────────────────────────
await pg.query("update equipos_instalados set servicio_id = null where servicio_id in (select id from servicios_postventa where observaciones like $1)", [`%${TAG}%`]);
await pg.query("update atenciones set servicio_id = null where servicio_id in (select id from servicios_postventa where observaciones like $1)", [`%${TAG}%`]);
await pg.query("delete from atenciones where es_prueba and detalle like $1", [`%${TAG}%`]);
await pg.query("delete from visitas_planta where es_prueba and motivo like $1", [`%${TAG}%`]);
await pg.query("delete from servicios_postventa where observaciones like $1", [`%${TAG}%`]);
await pg.query("delete from informes_cierre where es_prueba and codigo like 'PRUEBA-91%'");
await pg.query("delete from notificaciones where tipo = 'almacen' and user_id in ($1, $2, $3)", [ALM0, pv0.id, central0.id]);

// ── 3. Cierres de práctica (clonados del 903) y sus pedidos ──────────────
const { rows: cuentas } = await pg.query(
  "select id, razon_social, num_doc, direccion, departamento from cuentas where razon_social in ('AGROEXPORT PRUEBA VALLE S.A.C.','CLINICA PRUEBA SAN MARTIN S.A.C.','HOTEL PRUEBA MIRAFLORES E.I.R.L.','LAVANDERIA PRUEBA EL SOL E.I.R.L.','HOSPEDAJE PRUEBA COSTA AZUL S.A.C.','COLEGIO PRUEBA LOS ALAMOS S.A.C.')",
);
const cuenta = (n) => cuentas.find((c) => c.razon_social.startsWith(n));

const { rows: colsInf } = await pg.query("select column_name from information_schema.columns where table_name = 'informes_cierre' and is_generated = 'NEVER' order by ordinal_position");
const COLS_INF = colsInf.map((c) => `"${c.column_name}"`).join(", ");

const fotos = readdirSync(join(process.cwd(), "public", "productos")).filter((f) => /^(cal|lav|sec|uw|ut|ti)/i.test(f) && /\.(jpg|png)$/i.test(f)).slice(0, 8);
async function subirFotos(servicioId, etiquetas) {
  const salida = [];
  for (let i = 0; i < etiquetas.length; i++) {
    const archivo = fotos[i % fotos.length];
    const path = `pedidos/${servicioId}/almacen/${etiquetas[i]}-prueba-${archivo}`;
    const buf = readFileSync(join(process.cwd(), "public", "productos", archivo));
    const { error } = await admin.storage.from("adjuntos").upload(path, buf, { contentType: archivo.endsWith(".png") ? "image/png" : "image/jpeg", upsert: true });
    if (error) throw error;
    salida.push({ path, nombre: archivo, tipo: archivo.endsWith(".png") ? "image/png" : "image/jpeg", etiqueta: etiquetas[i] });
  }
  return salida;
}

const PEDIDOS = [
  { n: 911, cta: "AGROEXPORT", equipo: "LAVADORA INDUSTRIAL UNIMAC UW065 30 KG · SERIE PRB-911", tipo: "equipo", estado: "por_probar" },
  { n: 912, cta: "CLINICA", equipo: "SECADORA SEMI INDUSTRIAL LG TITAN LIGHT 15 KG · SERIE PRB-912", tipo: "equipo", estado: "hoy_por_confirmar" },
  { n: 913, cta: "HOTEL PRUEBA", equipo: "LAVADORA SEMI INDUSTRIAL LG TITAN MAX 17 KG · SERIE PRB-913", tipo: "equipo", estado: "atrasado_listo" },
  { n: 914, cta: "LAVANDERIA PRUEBA EL SOL", equipo: "CALANDRIA UNIMAC FC2700/500 · SERIE PRB-914", tipo: "equipo", estado: "salio_sin_guia" },
  { n: 915, cta: "HOSPEDAJE", equipo: "SECADORA INDUSTRIAL UNIMAC UT075 34 KG · SERIE PRB-915", tipo: "equipo", estado: "con_guia_sin_verificar" },
  { n: 916, cta: "COLEGIO", equipo: "KIT DE RODAMIENTOS Y SELLO P/ LAVADORA TITAN C + 04 AMORTIGUADORES", tipo: "repuesto", estado: "repuesto_planta" },
];

for (const p of PEDIDOS) {
  const c = cuenta(p.cta);
  const codigo = `PRUEBA-${p.n}-2026`;
  const { rows: [inf] } = await pg.query(
    `insert into informes_cierre (${COLS_INF})
       select ${COLS_INF} from (select (jsonb_populate_record(null::informes_cierre, to_jsonb(i) || jsonb_build_object(
         'id', gen_random_uuid(), 'correlativo', $1::int, 'codigo', $2::text, 'cuenta_id', $3::uuid,
         'cliente_nombre', $4::text, 'cliente_doc', $5::text, 'cliente_direccion', $6::text, 'venta_id', null, 'oportunidad_id', null, 'cotizacion_id', null,
         'fecha', $7::date, 'emitido_at', now(), 'anulado_at', null, 'adjuntos', '[]'::jsonb,
         'items', jsonb_build_array(jsonb_build_object('bloque','venta','tipo', $8::text,'descripcion', $9::text,'cantidad',1,'precio_unitario', 1000)),
         'entrega_lugar', $6::text, 'entrega_direccion', $6::text, 'asunto', $10::text))).*
       from informes_cierre i where i.id = '7aa78d04-611b-4449-af21-79d1f685d922') nuevo
     returning id`,
    [p.n, codigo, c.id, c.razon_social, c.num_doc, c.direccion, dia(-10), p.tipo === "repuesto" ? "repuesto" : "equipo", p.equipo, `${TAG} ${p.estado}`],
  );
  const provincia = !["Lima", "Callao", null].includes(c.departamento);
  const { rows: [s] } = await pg.query(
    `insert into servicios_postventa (informe_cierre_id, cuenta_id, cliente_texto, fecha_confirmacion, ubicacion, equipo, tipo_servicio, observaciones,
       monto, moneda, modalidad, direccion_entrega, origen, es_prueba, tipo_pedido, entrega_en, con_instalacion,
       pedido_ejecutado_at, pedido_ejecutado_por, liquidacion_at, liquidacion_por, numero_pedido_erp, aprobado_at, aprobado_por, responsable_id,
       pago_confirmado_at, pago_confirmado_por, monto_pagado, pct_antes_despacho)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 1000, 'USD', $9, $5, 'crm', true, $10, $11, $12,
       now() - interval '3 days', $13, now() - interval '3 days', $13, $14, now() - interval '2 days', $15, $15,
       now() - interval '2 days', $13, 1000, 100)
     returning id`,
    [inf.id, c.id, `${c.num_doc} - ${c.razon_social}`, dia(-10), c.direccion, p.equipo, p.tipo === "repuesto" ? "REPUESTO" : "ENTREGA DE EQUIPO",
     `${TAG} ${p.estado}. Pedido sembrado para practicar el circuito del almacén.`, provincia ? "provincia" : "lima",
     p.tipo, p.tipo === "repuesto" ? "planta" : null, p.tipo === "repuesto" ? false : null, central0.id, `PED-PRB-${p.n}`, pv0.id],
  );
  const id = s.id;
  const set = async (campos) => {
    const claves = Object.keys(campos);
    await pg.query(`update servicios_postventa set ${claves.map((k, i) => `${k} = $${i + 2}`).join(", ")} where id = $1`, [id, ...claves.map((k) => campos[k])]);
  };
  switch (p.estado) {
    case "por_probar":
      await set({ prueba_solicitada_at: new Date(Date.now() - 36e5).toISOString(), plano_enviado_at: new Date().toISOString() });
      break;
    case "hoy_por_confirmar":
      await set({ prueba_solicitada_at: new Date(Date.now() - 2 * 864e5).toISOString(), prueba_lista_at: new Date(Date.now() - 864e5).toISOString(), prueba_lista_por: ALM0, prueba_embalaje: "SI", protocolo_prueba_ref: "PROT-PRB-912",
        plano_enviado_at: new Date().toISOString(), direccion_verificada_at: new Date().toISOString(), direccion_verificada_con: "Sra. Rosa (recepción)",
        apertura_despacho_at: new Date().toISOString(), apertura_despacho_por: pv0.id, fecha_despacho: hoy, despacho_nota: "Llevar en la camioneta a las 3 pm; recibe recepción" });
      break;
    case "atrasado_listo":
      await set({ prueba_solicitada_at: new Date(Date.now() - 5 * 864e5).toISOString(), prueba_lista_at: new Date(Date.now() - 4 * 864e5).toISOString(), prueba_lista_por: ALM0, prueba_embalaje: "SI", protocolo_prueba_ref: "PROT-PRB-913",
        plano_enviado_at: new Date().toISOString(), direccion_verificada_at: new Date().toISOString(), direccion_verificada_con: "Sr. Luis (administrador)",
        apertura_despacho_at: new Date(Date.now() - 3 * 864e5).toISOString(), apertura_despacho_por: pv0.id, fecha_despacho: dia(-2), almacen_listo_at: new Date(Date.now() - 3 * 864e5).toISOString(), almacen_listo_por: ALM0, almacen_listo_nota: "Montacarga listo; el cliente no confirmó" });
      break;
    case "salio_sin_guia": {
      const f = await subirFotos(id, ["frente", "lateral_izq", "lateral_der", "posterior", "arriba"]);
      await set({ prueba_solicitada_at: new Date(Date.now() - 6 * 864e5).toISOString(), prueba_lista_at: new Date(Date.now() - 5 * 864e5).toISOString(), prueba_lista_por: ALM0, prueba_embalaje: "SI", protocolo_prueba_ref: "PROT-PRB-914",
        plano_enviado_at: new Date().toISOString(), direccion_verificada_at: new Date().toISOString(), direccion_verificada_con: "Sra. Carmen",
        apertura_despacho_at: new Date(Date.now() - 2 * 864e5).toISOString(), apertura_despacho_por: pv0.id, fecha_despacho: dia(-1), almacen_listo_at: new Date(Date.now() - 2 * 864e5).toISOString(), almacen_listo_por: ALM0,
        despachado_at: new Date(Date.now() - 864e5).toISOString(), salida_fotos: JSON.stringify(f), salida_nota: "Salió ayer 4 pm en la camioneta; va a la agencia Shalom de Cusco" });
      break;
    }
    case "con_guia_sin_verificar": {
      const f = await subirFotos(id, ["frente", "lateral_izq", "posterior"]);
      const g = await subirFotos(id, ["guia", "maquina"]);
      await set({ prueba_solicitada_at: new Date(Date.now() - 8 * 864e5).toISOString(), prueba_lista_at: new Date(Date.now() - 7 * 864e5).toISOString(), prueba_lista_por: ALM0, prueba_embalaje: "SI", protocolo_prueba_ref: "PROT-PRB-915",
        plano_enviado_at: new Date().toISOString(), direccion_verificada_at: new Date().toISOString(), direccion_verificada_con: "Sr. Manuel",
        apertura_despacho_at: new Date(Date.now() - 4 * 864e5).toISOString(), apertura_despacho_por: pv0.id, fecha_despacho: dia(-3), almacen_listo_at: new Date(Date.now() - 4 * 864e5).toISOString(), almacen_listo_por: ALM0,
        despachado_at: new Date(Date.now() - 3 * 864e5).toISOString(), salida_fotos: JSON.stringify(f),
        agencia_at: new Date(Date.now() - 2 * 864e5).toISOString(), agencia_por: ALM0, agencia_fotos: JSON.stringify(g), transportista: "Marvisur", guia: "T001-00915", recibe_nombre: "Agencia Marvisur · Piura" });
      break;
    }
    case "repuesto_planta":
      await set({ prueba_solicitada_at: new Date(Date.now() - 864e5).toISOString(), prueba_lista_at: new Date().toISOString(), prueba_lista_por: ALM0, prueba_embalaje: "SI", protocolo_prueba_ref: "REP-PRB-916", fecha_despacho: hoy, despacho_nota: "El cliente pasa a recoger hoy después de las 2 pm" });
      break;
  }
  console.log(`pedido ${codigo} · ${c.razon_social} · ${p.estado}`);
}

// ── 4. Atenciones programadas (la puesta en marcha se engancha sola al 912) ─
const AT = [
  { cta: "CLINICA", tipo: "puesta_en_marcha", cuando: `${hoy}T15:00:00-05:00`, tecnico: "Yony Capulian", equipo: "SECADORA LG TITAN LIGHT 15 KG · SERIE PRB-912", detalle: `${TAG} Puesta en marcha de la secadora que sale hoy. Llevar regulador y manómetro.` },
  { cta: "HOTEL PRUEBA", tipo: "problema_tecnico", cuando: `${hoy}T11:00:00-05:00`, tecnico: "Cristian Dolorier", equipo: "LAVADORA LG TITAN MAX 17 KG · SERIE 501KWLR47664", detalle: `${TAG} Vibra en el centrifugado; revisar amortiguadores. Llevar 4 amortiguadores 383EER3001J.` },
  { cta: "AGROEXPORT", tipo: "solicitud_mantenimiento", cuando: `${dia(1)}T09:00:00-05:00`, tecnico: "Yony Capulian", equipo: "LAVADORA UNIMAC UW065 · SERIE 210906", detalle: `${TAG} Mantenimiento preventivo en el cliente (Ica). Preparar kit de limpieza y grasa.` },
  { cta: "HOSPEDAJE", tipo: "puesta_en_marcha", cuando: `${dia(2)}T10:00:00-05:00`, tecnico: "Cristian Dolorier", equipo: "SECADORA INDUSTRIAL UNIMAC UT075 · SERIE PRB-915", detalle: `${TAG} Puesta en marcha por videollamada (Piura). Pedir al cliente foto de los puntos de gas, agua y energía.` },
  { cta: "LAVANDERIA PRUEBA EL SOL", tipo: "solicitud_mantenimiento", cuando: `${hoy}T16:30:00-05:00`, tecnico: "Yony Capulian", equipo: "LAVADORA LG TITAN C 15 KG · SERIE 702KWMK52491", detalle: `${TAG} Mantenimiento correctivo EN PLANTA: la máquina está en el área de pruebas. Cambio de 4 amortiguadores, 5 abrazaderas y kit de rodamientos.` },
  { cta: "COLEGIO", tipo: "solicitud_repuesto", cuando: `${dia(1)}T14:00:00-05:00`, tecnico: "Yony Capulian", equipo: "LAVADORA LG TITAN C 15 KG", detalle: `${TAG} Instalación del kit de rodamientos que el cliente recoge hoy. Coordinar herramienta de extracción.` },
  { cta: "HOTEL PRUEBA", tipo: "problema_tecnico", cuando: `${dia(3)}T10:00:00-05:00`, tecnico: "Cristian Dolorier", equipo: "SECADORA LG TITAN LIGHT 15 KG · SERIE 602KWUC2X486", detalle: `${TAG} Código de error dE: puerta. Llevar sensor de puerta y abrazadera.` },
];
for (const a of AT) {
  const c = cuenta(a.cta);
  await pg.query(
    `insert into atenciones (cuenta_id, cliente_texto, equipo_texto, tipo, etapa, programada_at, tecnico, detalle, es_prueba, recibido_por, solicitado_at, registrado_at, tomada_at, tomada_por, asignado_a, en_garantia, clasificacion)
     values ($1, $2, $3, $4, 'planificacion', $5, $6, $7, true, $8, now() - interval '1 day', now() - interval '1 day', now() - interval '20 hours', $9, $9, $10, $11)`,
    [c.id, c.razon_social, a.equipo, a.tipo, a.cuando, a.tecnico, a.detalle, central0.id, pv0.id, a.tipo !== "solicitud_mantenimiento", a.tipo === "solicitud_mantenimiento" ? "preventivo" : a.tipo === "problema_tecnico" ? "garantia" : null],
  );
  console.log(`atención ${a.tipo} · ${c.razon_social} · ${a.cuando.slice(0, 16)}`);
}

// ── 5. Visitas a planta ──────────────────────────────────────────────────
// Las visitas siguen el capítulo 1 de Catherine: quién viene y con quién (DNI de
// todos), qué máquina viene a ver (quitar film), lavandería, TV, Infocorp; y lo
// que Central ya marcó en cada una para que se vea el circuito a medio camino.
const VIS = [
  { cta: "COLEGIO", persona: "Juan Pérez Quispe", dni: "44556677", fecha: hoy, hora: "14:30", motivo: `${TAG} Viene a recoger el kit de rodamientos y amortiguadores (pedido PRUEBA-916).`, showroom: false, marcas: { impreso_at: true } },
  { cta: "AGROEXPORT", persona: "María Torres Huamán", dni: "40306173", fecha: dia(1), hora: "10:00", motivo: `${TAG} Prospecto viene a ver equipos LG para nuevo proyecto de lavandería.`, showroom: true, tv: true, infocorp: true, cot: "PRUEBA_741-26",
    acomp: [{ nombre: "Carlos Torres Huamán", dni: "40306174" }, { nombre: "Rosa Quispe de Torres", dni: "09876543" }], equipo: "LG Titan Max 17 kg del showroom", film: true, marcas: { impreso_at: true, infocorp_enviado_at: true } },
  { cta: "HOTEL PRUEBA", persona: "Luis Mendoza Ríos", dni: "10293847", fecha: hoy, hora: "09:30", motivo: `${TAG} Viene a ver la calandria antes de decidir; trae al administrador.`, showroom: true, tv: true, cot: "PRUEBA_744-26",
    acomp: [{ nombre: "Ana Lucía Paredes", dni: "45678901" }], equipo: "Calandria UniMac FC2700/500", film: true, marcas: { impreso_at: true, showroom_listo_at: true, film_retirado_at: true, tv_listo_at: true, llego_at: true } },
  { cta: "CLINICA", persona: "Dra. Patricia Salas", dni: "07654321", fecha: hoy, hora: "12:00", motivo: `${TAG} Viene a pagar el saldo y coordinar la puesta en marcha de la secadora (pedido PRUEBA-912).`, showroom: false, infocorp: false, marcas: { impreso_at: true } },
  { cta: "LAVANDERIA PRUEBA EL SOL", persona: "Jorge Ccalloquispe", dni: "70325622", fecha: dia(2), hora: "11:00", motivo: `${TAG} Prospecto de Cusco; viene a conocer la planta y ver secadoras a gas.`, showroom: true, tv: true, infocorp: true, equipo: "Secadora LG Titan Light 15 kg GLP", film: true, marcas: {} },
  { cta: "HOSPEDAJE", persona: "Sr. Manuel Castro", dni: "02468135", fecha: dia(-1), hora: "16:00", motivo: `${TAG} Vino a recoger su guía y a ver el embalaje de la secadora.`, showroom: false, marcas: { impreso_at: true, llego_at: true, reembalado_at: true }, pasada: true },
];
for (const v of VIS) {
  const c = cuenta(v.cta);
  const { rows: [ins] } = await pg.query(
    `insert into visitas_planta (cuenta_id, empresa, ruc, persona, dni, motivo, fecha, hora, registrado_por, es_prueba, showroom, prender_tv, infocorp, cotizacion_ref, acompanantes, equipo_a_ver, quitar_film)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11, $12, $13, $14, $15, $16) returning id`,
    [c.id, c.razon_social, c.num_doc, v.persona, v.dni, v.motivo, v.fecha, v.hora, pv0.id, Boolean(v.showroom), Boolean(v.tv), Boolean(v.infocorp), v.cot ?? null, JSON.stringify(v.acomp ?? []), v.equipo ?? null, Boolean(v.film)],
  );
  const marcas = Object.entries(v.marcas ?? {}).filter(([, on]) => on).map(([k]) => k);
  if (marcas.length) {
    await pg.query(`update visitas_planta set ${marcas.map((k, i) => `${k} = now() - interval '${(marcas.length - i) * 10} minutes'`).join(", ")}, impreso_por = case when $2 then $3 else impreso_por end where id = $1`, [ins.id, marcas.includes("impreso_at"), central0.id]);
  }
  console.log(`visita ${v.fecha} ${v.hora} · ${v.persona}${v.acomp ? ` (+${v.acomp.length})` : ""}`);
}

// ── 6. La campanita del almacén de práctica, con lo que le tocaría ───────
const { rows: [p911] } = await pg.query("select id from servicios_postventa where observaciones like $1", [`%${TAG} por_probar%`]);
const { rows: [p912] } = await pg.query("select id from servicios_postventa where observaciones like $1", [`%${TAG} hoy_por_confirmar%`]);
await pg.query("select crear_notificacion($1, null, 'almacen', $2, $3, $4)", [ALM0, "Probar y embalar · AGROEXPORT PRUEBA VALLE S.A.C.", "LAVADORA INDUSTRIAL UNIMAC UW065 30 KG. Postventa pide la prueba; al terminar, suba el protocolo y márquelo.", `/almacen/pedidos/${p911.id}`]);
await pg.query("select crear_notificacion($1, null, 'almacen', $2, $3, $4)", [ALM0, `Despacho programado para el ${hoy} · CLINICA PRUEBA SAN MARTIN S.A.C.`, "SECADORA LG TITAN LIGHT 15 KG · Llevar en la camioneta a las 3 pm. Confirme en su pedido cuando esté listo.", `/almacen/pedidos/${p912.id}`]);
await pg.query("select crear_notificacion($1, null, 'almacen', $2, $3, $4)", [ALM0, `Visita a planta el ${hoy} 14:30 · COLEGIO PRUEBA LOS ALAMOS S.A.C.`, "Juan Pérez Quispe (DNI 44556677). Viene a recoger el kit de rodamientos.", "/almacen/visitas"]);

await pg.end();
console.log(`\nListo. Entrar como practica.almacen@efameinsa.com / ${CLAVE_ALM0}`);
console.log("Postventa de práctica: practica.postventa@efameinsa.com · Central de práctica: central0@efameinsa.com");
