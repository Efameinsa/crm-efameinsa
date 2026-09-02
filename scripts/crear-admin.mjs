// ============================================================
// CRM EFAMEINSA · Cuenta de administrador "admin@efameinsa.com"
// ============================================================
// Pedido de Santos (02-09): un acceso de admin con correo real para poder
// entrar a ver todo el CRM (usuarios, catálogos, productos y las vistas de
// gerencia). Hasta ahora el único admin era admin@efameinsa-crm.local, un
// correo interno del arranque del proyecto.
//
// Sigue el patrón de scripts/crear-usuario-logistica2.mjs: crea el usuario
// en auth (o le pone contraseña nueva si ya existe) y deja el perfil con
// rol 'admin', activo y NO de prueba. La contraseña se genera aquí y se
// imprime una sola vez: no queda guardada en ningún lado.
//
// Uso: node --env-file=.env.local scripts/crear-admin.mjs

import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey || !process.env.DATABASE_URL) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o DATABASE_URL.");
  process.exit(1);
}

const CORREO = "admin@efameinsa.com";
const NOMBRE = "Administrador";

// 20 caracteres, sin los que se confunden al dictarlos (0/O, 1/l/I) y con
// mayúscula, minúscula, número y símbolo garantizados.
function contrasena() {
  const may = "ABCDEFGHJKLMNPQRSTUVWXYZ", min = "abcdefghjkmnpqrstuvwxyz", num = "23456789", sim = "!#$%&*+-=?@";
  const todo = may + min + num + sim;
  const elegir = (s) => s[randomInt(s.length)];
  const base = [elegir(may), elegir(min), elegir(num), elegir(sim)];
  while (base.length < 20) base.push(elegir(todo));
  for (let i = base.length - 1; i > 0; i--) { const j = randomInt(i + 1); [base[i], base[j]] = [base[j], base[i]]; }
  return base.join("");
}

const auth = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { data: existentes } = await auth.auth.admin.listUsers({ page: 1, perPage: 1000 });
let usuario = existentes?.users.find((u) => u.email?.toLowerCase() === CORREO);
const clave = contrasena();

if (usuario) {
  const { error } = await auth.auth.admin.updateUserById(usuario.id, { password: clave });
  if (error) throw error;
  console.log("La cuenta ya existía; se le puso una contraseña nueva.");
} else {
  const { data, error } = await auth.auth.admin.createUser({
    email: CORREO,
    password: clave,
    email_confirm: true,
    user_metadata: { nombre: NOMBRE },
  });
  if (error) throw error;
  usuario = data.user;
  console.log("Cuenta creada en auth.");
}

await bd.query(
  `insert into perfiles (id, nombre, rol, activo, es_prueba)
   values ($1, $2, 'admin', true, false)
   on conflict (id) do update set nombre = excluded.nombre, rol = 'admin', activo = true, es_prueba = false`,
  [usuario.id, NOMBRE],
);

const { rows } = await bd.query(`select id, nombre, rol, activo, es_prueba from perfiles where id = $1`, [usuario.id]);

console.log(`\n${"─".repeat(60)}`);
console.log("  ACCESO DE ADMINISTRADOR LISTO");
console.log(`  URL         : https://crm.efameinsa.com`);
console.log(`  Correo      : ${CORREO}`);
console.log(`  Contraseña  : ${clave}`);
console.log(`  Perfil      : ${rows[0].nombre} · rol ${rows[0].rol} · activo=${rows[0].activo} · es_prueba=${rows[0].es_prueba}`);
console.log(`${"─".repeat(60)}`);
console.log("  La contraseña no queda guardada en ningún lado: anotarla ahora.");

await bd.end();
