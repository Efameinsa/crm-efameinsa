// Crea las cuentas de los comerciales del piloto vía el Admin API de Supabase
// Auth y su fila correspondiente en `perfiles`. Imprime las contraseñas
// generadas UNA sola vez — anotarlas, no quedan guardadas en ningún archivo.
// Es idempotente: si el usuario ya existe, solo asegura su `perfil`.
//
// También setea `meta_mensual = 125000` (placeholder) a TODOS los perfiles
// con rol comercial que aún no tengan meta — incluida C5, ya creada por
// scripts/crear-usuarios-prueba.mjs.
//
// Estructura editable: cuando gerencia entregue nombres/correos/metas reales,
// se edita el array COMERCIALES y se vuelve a correr.
//
// Uso:
//   node --env-file=.env.local scripts/crear-comerciales.mjs

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Corran con:\n" +
      "  node --env-file=.env.local scripts/crear-comerciales.mjs",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const META_MENSUAL_PLACEHOLDER = 125000;

// Nombres genéricos "Comercial Cx" a propósito (decisión de Darwin, 17-08-2026):
// el histórico de R:\ mostró que el código cambia de dueño con el tiempo
// (ej. C4: Clemencia Puente 2021-23 → Milagros Carhuamaca 2025 → Ariana
// Flores 2026) y los nombres que se habían puesto de placeholder (C1=Brenda)
// no coincidían con quien aparece hoy en los archivos (C1=Erika Arevalo).
// En vez de perseguir el nombre correcto, el código YA ES el identificador
// estable — quien tenga el código hoy hereda toda la cartera histórica de
// ese código. C5 se deja con su nombre real (Katerine Tello) porque ahí no
// hay ambigüedad: es la misma persona en los 7 años de archivo.
const COMERCIALES = [
  { email: "c1@efameinsa-crm.local", nombre: "Comercial C1", codigo_comercial: "C1" },
  { email: "c2@efameinsa-crm.local", nombre: "Comercial C2", codigo_comercial: "C2" },
  { email: "c3@efameinsa-crm.local", nombre: "Comercial C3", codigo_comercial: "C3" },
  { email: "c4@efameinsa-crm.local", nombre: "Comercial C4", codigo_comercial: "C4" },
  { email: "c8@efameinsa-crm.local", nombre: "Comercial C8", codigo_comercial: "C8" },
  { email: "c9@efameinsa-crm.local", nombre: "Comercial C9", codigo_comercial: "C9" },
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

  for (const c of COMERCIALES) {
    let user = await buscarUsuarioPorEmail(c.email);
    let password = null;

    if (!user) {
      password = generarPassword();
      const { data, error } = await admin.auth.admin.createUser({
        email: c.email,
        password,
        email_confirm: true,
      });
      if (error) throw error;
      user = data.user;
      console.log(`✓ Usuario creado: ${c.email}`);
    } else {
      console.log(`= Usuario ya existía: ${c.email}`);
    }

    const { error: errorPerfil } = await admin.from("perfiles").upsert({
      id: user.id,
      nombre: c.nombre,
      rol: "comercial",
      codigo_comercial: c.codigo_comercial,
      meta_mensual: META_MENSUAL_PLACEHOLDER,
    });
    if (errorPerfil) throw errorPerfil;

    credenciales.push({ email: c.email, password: password ?? "(sin cambios — ya existía)" });
  }

  // Setea la meta placeholder a cualquier otro comercial (ej. C5) que aún no tenga una.
  const { data: sinMeta, error: errorSinMeta } = await admin
    .from("perfiles")
    .update({ meta_mensual: META_MENSUAL_PLACEHOLDER })
    .eq("rol", "comercial")
    .is("meta_mensual", null)
    .select("nombre, codigo_comercial");
  if (errorSinMeta) throw errorSinMeta;
  for (const p of sinMeta ?? []) {
    console.log(`✓ Meta mensual placeholder asignada a ${p.codigo_comercial} (${p.nombre})`);
  }

  console.log("\n=== Credenciales de comerciales creados (anotar; no se guardan en archivo) ===");
  for (const c of credenciales) {
    console.log(`${c.email.padEnd(28)} ${c.password}`);
  }
}

main().catch((err) => {
  console.error("\n✗ Error creando comerciales:\n", err.message);
  process.exit(1);
});
