// Reemplaza los correos de prueba (*@efameinsa-crm.local) por los correos
// reales del equipo (decisión de Darwin, 2026-08-22): ya no hace falta el
// entorno de piloto con correos locales, gerencia y comerciales entran con
// su @efameinsa.com real. Genera contraseñas nuevas y seguras para cada
// cuenta tocada y las escribe en un .txt FUERA del repo (nunca se commitea
// una contraseña en texto plano).
//
// Decisiones confirmadas con Darwin antes de correr esto:
//   · Brenda Taboada: usa Comercial1@ (su código_comercial ACTIVO es C1; C8
//     quedó como código_anterior desde que se pasó todo a la cuenta C1 — el
//     sistema igual resuelve C8 por ese alias en los imports históricos).
//   · Gerencia: se crean 2 cuentas NUEVAS (kycabrejos, crcabrejos). La cuenta
//     genérica "Gerencia Comercial" NO se toca — tiene 22 accesos y 48
//     notificaciones reales, no está vacía como parecía a primera vista.
//     La de Santos Vilcachagua tampoco se toca: ya usa su gmail real.
//   · "Comercial C8" huérfana (código null, 0 cuentas, 0 oportunidades,
//     0 referencias en toda la base — verificado antes de tocarla): se borra.
//   · C9: se deja igual, con su correo local, por ahora.
//   · Post Venta (PV): correo nuevo postventa@efameinsa.com.
//   · admin@efameinsa-crm.local: no se toca, no estaba en el pedido.
//
// Uso: node --env-file=.env.local scripts/actualizar-correos-produccion.mjs [--aplicar]

import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APLICAR = process.argv.includes("--aplicar");
const SALIDA = "C:/Users/diseno/Downloads/credenciales-crm-efameinsa-2026-08-22.txt";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Corran con --env-file=.env.local");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const generarPassword = () => randomBytes(12).toString("base64url"); // 16 caracteres

// Cuentas existentes a las que se les cambia correo + contraseña.
const ACTUALIZAR = [
  { id: "92b31f1a-09d4-4937-9cff-aa905694afe8", nombreActual: "Central", emailNuevo: "central@efameinsa.com" },
  { id: "e03cde25-7d86-4e21-8abb-08c21a279ed4", nombreActual: "Brenda Taboada (C1, alias C8)", emailNuevo: "comercial1@efameinsa.com" },
  { id: "368bda76-ffbe-4e05-a1da-f77f323cd8c9", nombreActual: "Comercial C2", emailNuevo: "comercial2@efameinsa.com" },
  { id: "57e02e58-5423-4c7b-9fb1-857e6a2c8f35", nombreActual: "Comercial C3", emailNuevo: "comercial3@efameinsa.com" },
  { id: "eaf777d9-280f-4d71-98c1-b98db80bf3d7", nombreActual: "Comercial C4", emailNuevo: "comercial4@efameinsa.com" },
  { id: "4379b0d4-1d15-419a-9090-a22686f5eef8", nombreActual: "Katerine Tello (C5)", emailNuevo: "comercial5@efameinsa.com" },
  { id: "4d16b185-13d4-487c-b84c-4511e7ad3533", nombreActual: "Post Venta", emailNuevo: "postventa@efameinsa.com" },
];

// Cuentas nuevas de gerencia.
const CREAR = [
  { email: "kycabrejos@efameinsa.com", nombre: "K.Y. Cabrejos", rol: "gerencia" },
  { email: "crcabrejos@efameinsa.com", nombre: "C.R. Cabrejos", rol: "gerencia" },
];

// Cuenta huérfana a borrar (verificado sin referencias en ninguna tabla).
const BORRAR_ID = "414e8a52-19ed-4740-ad25-0b0efc320949"; // "Comercial C8", código null, 0 cuentas/0 oportunidades

async function main() {
  const credenciales = [];

  console.log(APLICAR ? "=== APLICANDO ===\n" : "=== DRY-RUN (sin --aplicar, no se escribe nada) ===\n");

  for (const c of ACTUALIZAR) {
    const password = generarPassword();
    console.log(`${APLICAR ? "Actualizando" : "[dry-run] actualizaría"}: ${c.nombreActual} -> ${c.emailNuevo}`);
    if (APLICAR) {
      const { error } = await admin.auth.admin.updateUserById(c.id, {
        email: c.emailNuevo,
        password,
        email_confirm: true,
      });
      if (error) throw new Error(`${c.emailNuevo}: ${error.message}`);
    }
    credenciales.push({ rol: c.nombreActual, email: c.emailNuevo, password });
  }

  for (const c of CREAR) {
    console.log(`${APLICAR ? "Creando" : "[dry-run] crearía"}: ${c.email} (${c.rol})`);
    const password = generarPassword();
    if (APLICAR) {
      const { data, error } = await admin.auth.admin.createUser({
        email: c.email,
        password,
        email_confirm: true,
      });
      if (error) throw new Error(`${c.email}: ${error.message}`);
      const { error: errorPerfil } = await admin.from("perfiles").upsert({
        id: data.user.id,
        nombre: c.nombre,
        rol: c.rol,
        codigo_comercial: null,
      });
      if (errorPerfil) throw new Error(`perfil ${c.email}: ${errorPerfil.message}`);
    }
    credenciales.push({ rol: `gerencia (${c.nombre})`, email: c.email, password });
  }

  console.log(`${APLICAR ? "Borrando" : "[dry-run] borraría"}: Comercial C8 huérfana (${BORRAR_ID})`);
  if (APLICAR) {
    const { error } = await admin.auth.admin.deleteUser(BORRAR_ID);
    if (error) throw new Error(`borrar C8 huérfana: ${error.message}`);
  }

  const contenido =
    `CREDENCIALES CRM EFAMEINSA — generadas ${new Date().toISOString().slice(0, 10)}\n` +
    `Reemplazan los correos de prueba (*@efameinsa-crm.local). Guardar en un lugar seguro y borrar este\n` +
    `archivo una vez repartidas — quedan en texto plano.\n\n` +
    credenciales.map((c) => `${c.rol.padEnd(28)} ${c.email.padEnd(30)} ${c.password}`).join("\n") +
    `\n\nSin cambios (ya tenían correo real o se dejan igual por ahora):\n` +
    `  gerencia (Santos Vilcachagua)   soypuromarketing@gmail.com   (no se tocó)\n` +
    `  gerencia (genérica, en uso)     gerencia@efameinsa-crm.local (no se tocó — tiene accesos reales)\n` +
    `  comercial C9                    c9@efameinsa-crm.local       (se deja igual por ahora)\n` +
    `  admin                           admin@efameinsa-crm.local    (no estaba en el pedido)\n`;

  if (APLICAR) {
    writeFileSync(SALIDA, contenido);
    console.log(`\n✓ Escrito en ${SALIDA}`);
  } else {
    console.log("\n--- contenido que se escribiría ---\n" + contenido);
  }
}

main().catch((e) => {
  console.error("\n✗ Error:", e.message);
  process.exit(1);
});
