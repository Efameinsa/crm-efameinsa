// ============================================================
// CRM EFAMEINSA · Una cuenta nueva del área de postventa
// ============================================================
// Carlos, 10-09: «van a entrar dos hasta tres personas para postventa […]
// tienen que ofrecer y fidelizar al cliente». Cada una con su cuenta del área,
// como PV (Rubí) y PV1 (Ariana): una cuenta por área, nunca mezcladas.
//
// LO QUE CREA: el usuario en auth y su perfil PVn con `es_postventa`, que es
// lo que abre las pantallas del área. Sin cartera, sin expedientes: eso llega
// por Central o por lo que ella misma tome. `solo_preventivo` queda en falso
// —ve el área entera, como Rubí—; se enciende con un UPDATE si gerencia decide
// que esa persona solo vende (como Ariana).
//
// EL CORREO postventa2@efameinsa.com YA ESTABA TOMADO por la cuenta de
// PRÁCTICA (PV0, es_prueba), creada el 27-08 como banco de pruebas y usada
// ayer a las 18:42. No se convierte esa cuenta en real —su trabajo no cuenta
// en ningún reporte y ese es justamente su valor—: se le cambia el correo a
// practica.postventa@efameinsa.com (la contraseña no cambia) y postventa2 queda
// libre para la persona de verdad.
//
//   node --env-file=.env.local scripts/crear-cuenta-postventa.mjs --correo postventa2@efameinsa.com --codigo PV2 --nombre "Postventa 2"
//   … --aplicar
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const APLICAR = process.argv.includes("--aplicar");
const CORREO = (arg("correo") ?? "").toLowerCase();
const CODIGO = arg("codigo");
const NOMBRE = arg("nombre");
const CORREO_PRACTICA = "practica.postventa@efameinsa.com";
if (!CORREO || !CODIGO || !NOMBRE) { console.error("Faltan --correo, --codigo o --nombre"); process.exit(1); }

const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { data: lista } = await auth.auth.admin.listUsers({ page: 1, perPage: 1000 });
const ocupa = lista.users.find((u) => u.email?.toLowerCase() === CORREO);
const { rows: [codigoOcupado] } = await bd.query(`select nombre from perfiles where codigo_comercial = $1`, [CODIGO]);
if (codigoOcupado) { console.error(`El código ${CODIGO} ya es de ${codigoOcupado.nombre}`); process.exit(1); }

let liberar = null;
if (ocupa) {
  const { rows: [p] } = await bd.query(`select codigo_comercial, nombre, es_prueba from perfiles where id = $1`, [ocupa.id]);
  if (!p?.es_prueba) { console.error(`${CORREO} ya es la cuenta REAL de ${p?.nombre ?? "alguien"} (${p?.codigo_comercial}). No se toca.`); process.exit(1); }
  liberar = { id: ocupa.id, ...p };
  console.log(`${CORREO} está tomado por la cuenta de práctica ${p.codigo_comercial} («${p.nombre}»): pasa a ${CORREO_PRACTICA}.`);
}
console.log(`Se crea ${CORREO} → ${CODIGO} · ${NOMBRE} (es_postventa, ve el área entera).`);

if (!APLICAR) { console.log("\n(ensayo: no se tocó nada — para hacerlo, --aplicar)"); await bd.end(); process.exit(0); }

if (liberar) {
  const { error } = await auth.auth.admin.updateUserById(liberar.id, { email: CORREO_PRACTICA, email_confirm: true });
  if (error) throw error;
  console.log(`✓ La cuenta de práctica ahora entra con ${CORREO_PRACTICA} (misma contraseña).`);
}

const clave = `Efa-${randomBytes(4).toString("hex")}`;
const { data, error } = await auth.auth.admin.createUser({ email: CORREO, password: clave, email_confirm: true, user_metadata: { nombre: NOMBRE } });
if (error) throw error;
await bd.query(
  `insert into perfiles (id, nombre, rol, codigo_comercial, cargo, activo, es_postventa, es_prueba, solo_preventivo, meta_mensual)
   values ($1, $2, 'comercial', $3, 'Postventa', true, true, false, false, 0)`,
  [data.user.id, NOMBRE, CODIGO],
);

// Se comprueba que entra de verdad, no que se creó.
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const prueba = await anon.auth.signInWithPassword({ email: CORREO, password: clave });
console.log(prueba.error ? `✗ NO entra: ${prueba.error.message}` : "✓ Entra con la contraseña.");

console.log(`\n  Usuario: ${CORREO}\n  Clave:   ${clave}\n  Código:  ${CODIGO}`);
await bd.end();
