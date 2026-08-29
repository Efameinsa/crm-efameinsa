// Qué devuelve «Lo que derivé» ENTRANDO CON LA CUENTA DE CENTRAL.
//
// No cambia su contraseña: pide un enlace mágico con la clave de servicio, lo
// canjea por una sesión y consulta la API igual que lo hace la pantalla. Es la
// única forma de comprobar el camino completo —sesión, políticas y filtros— sin
// suplantar nada ni tocar su cuenta.
//
// Uso: node --env-file=.env.local scripts/_ver-como-central.mjs [texto a buscar]
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const buscado = (process.argv[2] ?? "PRO-09048").toUpperCase();

const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();
const { rows: perfil } = await bd.query(
  "select id, nombre from perfiles where rol = 'central' and not es_prueba limit 1",
);
const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: usuarios } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const usuario = usuarios.users.find((u) => u.id === perfil[0].id);
if (!usuario?.email) {
  console.error("No encontré el correo de Central.");
  process.exit(1);
}
console.log(`Entrando como ${perfil[0].nombre} (${usuario.email})\n`);

const { data: enlace, error: errEnlace } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: usuario.email,
});
if (errEnlace) {
  console.error("No se pudo generar el enlace:", errEnlace.message);
  process.exit(1);
}

const verificacion = await fetch(
  `${url}/auth/v1/verify?token=${enlace.properties.hashed_token}&type=magiclink`,
  { headers: { apikey: anon }, redirect: "manual" },
);
const destino = verificacion.headers.get("location") ?? "";
const token = new URL(destino.replace("#", "?")).searchParams.get("access_token");
if (!token) {
  console.error("No se pudo canjear la sesión.");
  process.exit(1);
}

const comoElla = createClient(url, anon, {
  global: { headers: { Authorization: `Bearer ${token}` } },
  auth: { autoRefreshToken: false, persistSession: false },
});

// Lo mismo que pide la pantalla: derivados del período, sin filtro de comercial.
const hoy = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
const iso = (d) => d.toISOString().slice(0, 10);
const desde = new Date(hoy);
desde.setDate(desde.getDate() - 30);

const { data, error } = await comoElla
  .from("leads")
  .select("id, codigo, nombre_contacto, asignado_at, es_prueba, estado")
  .eq("estado", "asignado")
  .gte("asignado_at", `${iso(desde)}T00:00:00-05:00`)
  .lte("asignado_at", `${iso(hoy)}T23:59:59-05:00`)
  .order("asignado_at", { ascending: false })
  .limit(400);

if (error) {
  console.error("La consulta falló:", error.message);
  process.exit(1);
}
console.log(`«Lo que derivé» (últimos 30 días) le devuelve ${data.length} contactos.`);
console.log("Los seis primeros:");
console.table(
  data.slice(0, 6).map((l) => ({ codigo: l.codigo, contacto: l.nombre_contacto?.slice(0, 34), practica: l.es_prueba })),
);
const encontrado = data.find((l) => (l.codigo ?? "").toUpperCase() === buscado);
console.log(
  encontrado
    ? `\n✓ ${buscado} SÍ está en la lista que recibe Central (posición ${data.indexOf(encontrado) + 1}).`
    : `\n✗ ${buscado} NO está en la lista que recibe Central.`,
);
await bd.end();
