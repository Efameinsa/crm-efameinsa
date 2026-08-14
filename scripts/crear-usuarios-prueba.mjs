// Crea las 4 cuentas de prueba del piloto (una por rol) vía el Admin API de
// Supabase Auth y su fila correspondiente en `perfiles`. Imprime las
// contraseñas generadas UNA sola vez — anotarlas, no quedan guardadas en ningún
// archivo. Es idempotente: si el usuario ya existe, solo asegura su `perfil`.
//
// Uso:
//   node --env-file=.env.local scripts/crear-usuarios-prueba.mjs

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Corran con:\n" +
      "  node --env-file=.env.local scripts/crear-usuarios-prueba.mjs",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const USUARIOS = [
  { email: "admin@efameinsa-crm.local", nombre: "Administrador CRM", rol: "admin", codigo_comercial: null },
  { email: "gerencia@efameinsa-crm.local", nombre: "Gerencia Comercial", rol: "gerencia", codigo_comercial: null },
  { email: "central@efameinsa-crm.local", nombre: "Central", rol: "central", codigo_comercial: null },
  { email: "c5@efameinsa-crm.local", nombre: "Katerine Tello", rol: "comercial", codigo_comercial: "C5" },
];

function generarPassword() {
  return randomBytes(9).toString("base64url"); // 12 caracteres, alfanumérico seguro
}

async function buscarUsuarioPorEmail(email) {
  // Admin API no tiene "get by email" directo; se pagina (el piloto tendrá pocos usuarios).
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  return data.users.find((u) => u.email === email) ?? null;
}

async function main() {
  const credenciales = [];

  for (const u of USUARIOS) {
    let user = await buscarUsuarioPorEmail(u.email);
    let password = null;

    if (!user) {
      password = generarPassword();
      const { data, error } = await admin.auth.admin.createUser({
        email: u.email,
        password,
        email_confirm: true,
      });
      if (error) throw error;
      user = data.user;
      console.log(`✓ Usuario creado: ${u.email}`);
    } else {
      console.log(`= Usuario ya existía: ${u.email}`);
    }

    const { error: errorPerfil } = await admin.from("perfiles").upsert({
      id: user.id,
      nombre: u.nombre,
      rol: u.rol,
      codigo_comercial: u.codigo_comercial,
    });
    if (errorPerfil) throw errorPerfil;

    credenciales.push({ email: u.email, rol: u.rol, password: password ?? "(sin cambios — ya existía)" });
  }

  console.log("\n=== Credenciales del piloto (anotar; no se guardan en archivo) ===");
  for (const c of credenciales) {
    console.log(`${c.rol.padEnd(10)} ${c.email.padEnd(28)} ${c.password}`);
  }
}

main().catch((err) => {
  console.error("\n✗ Error creando usuarios de prueba:\n", err.message);
  process.exit(1);
});
