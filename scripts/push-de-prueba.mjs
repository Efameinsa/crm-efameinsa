// Dispara una notificación push de prueba a las suscripciones de UNA cuenta,
// para verificar el circuito completo (PWA instalada → campanada) máquina por
// máquina. No escribe nada en la base: solo envía.
//
// Uso: node --env-file=.env.local scripts/push-de-prueba.mjs postventa@efameinsa.com
import { Client } from "pg";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const correo = process.argv[2];
if (!correo) {
  console.error("Uso: node --env-file=.env.local scripts/push-de-prueba.mjs <correo>");
  process.exit(1);
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
const usuario = data.users.find((u) => u.email === correo);
if (!usuario) {
  console.error(`No existe la cuenta ${correo}`);
  process.exit(1);
}

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();
const { rows } = await pg.query(`select endpoint, claves from push_suscripciones where user_id = $1`, [usuario.id]);
console.log(`${correo}: ${rows.length} suscripción(es) registrada(s)`);

let ok = 0;
for (const s of rows) {
  try {
    await webpush.sendNotification(
      { endpoint: s.endpoint, keys: s.claves },
      JSON.stringify({
        title: "🔔 Prueba de notificaciones",
        body: `Si está leyendo esto, la campanada de ${correo} funciona en este equipo. — ${new Date().toLocaleTimeString("es-PE")}`,
        url: "/",
      }),
    );
    ok++;
    console.log(` ✓ enviada a …${s.endpoint.slice(-24)}`);
  } catch (e) {
    console.log(` ✗ …${s.endpoint.slice(-24)}: ${e.statusCode ?? ""} ${e.body?.slice(0, 60) ?? e.message}`);
  }
}
console.log(`\n${ok} de ${rows.length} entregadas al servicio de push.`);
await pg.end();
