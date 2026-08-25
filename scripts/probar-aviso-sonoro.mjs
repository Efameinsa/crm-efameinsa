// ============================================================
// CRM EFAMEINSA · Disparar un aviso para oír el pitido y ver la ventanita
// ============================================================
// Inserta una notificación real para una persona. La campana del CRM está
// suscrita a esa tabla por realtime, así que en la sesión que tenga abierta esa
// persona suena el pitido y sale la ventana emergente, exactamente igual que
// cuando le derivan un lead de verdad.
//
// Sirve para probar el aviso sin tener que fabricar un lead ni mover números.
// El aviso queda en su campana como cualquier otro y se puede marcar leído.
//
// Uso:
//   node --env-file=.env.local scripts/probar-aviso-sonoro.mjs              (a C0)
//   node --env-file=.env.local scripts/probar-aviso-sonoro.mjs C5           (a otro código)
//   node --env-file=.env.local scripts/probar-aviso-sonoro.mjs C0 aprobada  (otro tipo)

import { Client } from "pg";

const CODIGO = (process.argv[2] ?? "C0").toUpperCase();
const CLASE = (process.argv[3] ?? "lead").toLowerCase();

// Los mismos tipos que emite el sistema: así se prueba el aviso REAL, con su
// encabezado, su color y su botón, y no una versión de mentira.
const AVISOS = {
  lead: {
    tipo: "lead_asignado",
    titulo: "Cliente de prueba — PRUEBA DEL SISTEMA",
    cuerpo: "Entró por WhatsApp. Este aviso es una prueba: no hay un cliente esperando.",
    url: "/comercial",
  },
  aprobada: {
    tipo: "cotizacion_aprobada",
    titulo: "Prueba: cotización aprobada",
    cuerpo: "Este aviso es una prueba del sonido. No hay ninguna cotización esperando.",
    url: "/comercial/oportunidades",
  },
  rechazada: {
    tipo: "cotizacion_rechazada",
    titulo: "Prueba: cotización devuelta",
    cuerpo: "Este aviso es una prueba del sonido. No hay ninguna cotización devuelta.",
    url: "/comercial/oportunidades",
  },
  ingreso: {
    tipo: "lead_registrado",
    titulo: "Cliente de prueba — PRUEBA DEL SISTEMA",
    cuerpo: "Este aviso es una prueba del sonido para Central.",
    url: "/central",
  },
};

const aviso = AVISOS[CLASE];
if (!aviso) {
  console.error(`Clase desconocida: ${CLASE}. Opciones: ${Object.keys(AVISOS).join(", ")}`);
  process.exit(1);
}

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: perfil } = await bd.query(
  `select id, nombre, rol, es_prueba from perfiles where codigo_comercial = $1 limit 1`,
  [CODIGO],
);
if (perfil.length === 0) {
  console.error(`No existe ningún perfil con código ${CODIGO}.`);
  await bd.end();
  process.exit(1);
}
const p = perfil[0];

const { rows } = await bd.query(
  `insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
   values ($1, $2, $3, $4, $5)
   returning id, to_char(created_at at time zone 'America/Lima', 'HH24:MI:SS') t`,
  [p.id, aviso.tipo, aviso.titulo, aviso.cuerpo, aviso.url],
);

console.log(`Aviso enviado a ${p.nombre} (${CODIGO})${p.es_prueba ? " · cuenta de práctica" : ""}`);
console.log(`  tipo   : ${aviso.tipo}`);
console.log(`  hora   : ${rows[0].t}`);
console.log(`  id     : ${rows[0].id}`);
console.log(`\nEn la sesión de ${CODIGO} debería sonar el pitido y salir la ventanita.`);
console.log("Si no suena: recargar la página (para tomar la versión nueva) y hacer un clic");
console.log("en cualquier parte — el navegador no autoriza audio hasta el primer gesto.");

await bd.end();
