// Lo que Carlos pidió el 10-09 para la bandeja de Central, comprobado con su
// sesión: quién registró cada contacto, y el desplegable con la historia del
// cliente para decidir la derivación sin salir de la pantalla.
//
//   BASE=http://localhost:3000 node --env-file=.env.local scripts/_verificar-historia-en-la-bandeja.mjs
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { Client } from "pg";

const BASE = process.env.BASE ?? "https://crm.efameinsa.com";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let ok = 0, mal = 0;
const af = (t, c, d = "") => { if (c) { ok++; console.log(`  ✓ ${t}${d ? " — " + d : ""}`); } else { mal++; console.log(`  ✗ ${t}${d ? " — " + d : ""}`); } };

async function sesion(email) {
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const jar = new Map();
  const ssr = createServerClient(url, anon, { cookies: { getAll: () => [...jar.entries()].map(([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
  await ssr.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  return [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
}

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();
const { rows: [central] } = await pg.query(`select id from perfiles where rol = 'central' and activo order by nombre limit 1`);
const { data: u } = await admin.auth.admin.getUserById(central.id);
const { rows: [cola] } = await pg.query(
  `select count(*) n, count(*) filter (where recibido_por is not null) registrados
     from leads where estado = 'pendiente_triaje' and not es_prueba`);
console.log(`Cola de Central: ${cola.n} contactos, ${cola.registrados} con quién los registró.\n`);

const cookie = await sesion(u.user.email);
const t0 = Date.now();
const h = await (await fetch(`${BASE}/central`, { headers: { cookie } })).text();
af("la bandeja abre", h.length > 10000, `${Date.now() - t0} ms · ${Math.round(h.length / 1024)} KB`);

// 1. Quién registró el contacto, en la tarjeta y no una pantalla después.
af("cada contacto dice quién lo registró",
  (h.match(/lo registró/g) ?? []).length >= Number(cola.registrados),
  `${(h.match(/lo registró/g) ?? []).length} de ${cola.registrados}`);
af("y distingue el que entró solo", Number(cola.n) === Number(cola.registrados) || h.includes("entró solo"),
  Number(cola.n) === Number(cola.registrados) ? "hoy no hay ninguno del formulario web" : "");

// 2. El triangulito con la historia, en los que ya están en el sistema.
const conocidos = (h.match(/Ver la historia de/g) ?? []).length;
af("los clientes conocidos traen el desplegable con su historia", conocidos > 0, `${conocidos} desplegables`);
if (conocidos > 0) {
  af("…que dice qué se le cotizó", h.includes("Lo que se le cotizó") || h.includes("nadie le hizo gestión"));
  af("…quién habló con él", h.includes("Quién habló con él") || h.includes("nadie le hizo gestión"));
  af("…y qué quedó agendado, que es lo que decide si se redirige",
    h.includes("Lo que quedó agendado") || h.includes("nadie le hizo gestión"));
  af("…con la salida a la ficha completa", h.includes("Abrir la ficha completa"));
}

console.log(`\n${ok} bien · ${mal} mal`);
await pg.end();
process.exit(mal ? 1 : 0);
