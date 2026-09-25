// ============================================================
// CRM EFAMEINSA · La cuenta de Facturación (0306)
// ============================================================
// Reunión 25-09 11:44, gerencia: «¿qué sería, un usuario más? Facturación 1»;
// «similar a Finanzas: ve el expediente, pero no puede editar nada más que
// subir la información de factura».
//
// LO QUE CREA:
//   · facturacion1@efameinsa.com → perfil «Facturación 1», rol `facturacion`.
//   · facturacion_test@efameinsa.com → la cuenta de la propuesta de navegación
//     que la espeja en solo lectura (como las otras nueve _test: rol
//     `finanzas` sin permisos propios, `es_prueba`, `espejo_de`).
// Si una ya existe, no se toca. La clave se imprime una sola vez.
//
//   node --env-file=.env.local scripts/crear-cuenta-facturacion.mjs            (ensayo)
//   node --env-file=.env.local scripts/crear-cuenta-facturacion.mjs --aplicar
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const REAL = { correo: "facturacion1@efameinsa.com", nombre: "Facturación 1", cargo: "Facturación" };
const PRUEBA = { correo: "facturacion_test@efameinsa.com", nombre: "Propuesta · Facturación 1" };

const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { data: lista } = await auth.auth.admin.listUsers({ page: 1, perPage: 1000 });
const existe = (correo) => lista.users.find((u) => u.email?.toLowerCase() === correo);

async function crear(correo, nombre) {
  const clave = `Efa-${randomBytes(4).toString("hex")}`;
  const { data, error } = await auth.auth.admin.createUser({ email: correo, password: clave, email_confirm: true, user_metadata: { nombre } });
  if (error) throw error;
  return { id: data.user.id, clave };
}

async function entra(correo, clave) {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const r = await anon.auth.signInWithPassword({ email: correo, password: clave });
  return r.error ? `✗ NO entra: ${r.error.message}` : "✓ entra con la contraseña";
}

let real = existe(REAL.correo);
console.log(real ? `${REAL.correo} ya existe: no se toca.` : `Se crea ${REAL.correo} → «${REAL.nombre}», rol facturacion.`);
const prueba = existe(PRUEBA.correo);
console.log(prueba ? `${PRUEBA.correo} ya existe: no se toca.` : `Se crea ${PRUEBA.correo}, espejo de ${REAL.correo}.`);
if (!APLICAR) {
  console.log("\n(ensayo: no se tocó nada — para hacerlo, --aplicar)");
  await bd.end();
  process.exit(0);
}

const salida = [];
if (!real) {
  const r = await crear(REAL.correo, REAL.nombre);
  await bd.query(
    `insert into perfiles (id, nombre, rol, cargo, activo, es_prueba, meta_mensual) values ($1, $2, 'facturacion', $3, true, false, 0)`,
    [r.id, REAL.nombre, REAL.cargo],
  );
  real = { id: r.id };
  salida.push(`${REAL.correo}\t${r.clave}\t${await entra(REAL.correo, r.clave)}`);
}
if (!prueba) {
  const r = await crear(PRUEBA.correo, PRUEBA.nombre);
  await bd.query(
    `insert into perfiles (id, nombre, rol, activo, es_prueba, espejo_de, meta_mensual) values ($1, $2, 'finanzas', true, true, $3, 0)`,
    [r.id, PRUEBA.nombre, real.id],
  );
  salida.push(`${PRUEBA.correo}\t${r.clave}\t${await entra(PRUEBA.correo, r.clave)}\t(espejo de ${REAL.nombre})`);
}
console.log(`\n${salida.join("\n")}`);
await bd.end();
