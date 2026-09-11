// Cuánto tarda cada pantalla del CRM en producción, con la sesión de quien la
// usa. Dos pasadas: la primera incluye el arranque en frío de Vercel.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { Client } from "pg";

const BASE = process.env.BASE ?? "https://crm.efameinsa.com";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();

async function correoDe(cond) {
  const { rows: [p] } = await pg.query(`select id from perfiles where ${cond} and activo limit 1`);
  if (!p) return null;
  const { data } = await admin.auth.admin.getUserById(p.id);
  return data.user.email;
}
async function sesion(email) {
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const jar = new Map();
  const ssr = createServerClient(url, anon, { cookies: { getAll: () => [...jar.entries()].map(([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
  await ssr.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  return [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
}

const QUIENES = {
  central: await correoDe("rol = 'central'"),
  comercial: await correoDe("codigo_comercial = 'C5'"),
  postventa: "postventa@efameinsa.com",
  gerencia: "gerencia@efameinsa-crm.local",
  operaciones: await correoDe("es_operaciones"),
};

const PANTALLAS = [
  ["central", "/central"],
  ["central", "/central/derivados"],
  ["central", "/central/presupuestos"],
  ["comercial", "/comercial"],
  ["comercial", "/comercial/oportunidades"],
  ["comercial", "/comercial/cartera"],
  ["comercial", "/comercial/cotizaciones"],
  ["comercial", "/comercial/agenda"],
  ["postventa", "/postventa"],
  ["postventa", "/postventa/control"],
  ["postventa", "/postventa/equipos"],
  ["postventa", "/comercial/ruta"],
  ["postventa", "/comercial/parque?todos=1"],
  ["gerencia", "/gerencia"],
  ["gerencia", "/gerencia/supervision"],
  ["gerencia", "/gerencia/clientes"],
  ["gerencia", "/gerencia/finanzas"],
  ["operaciones", "/operaciones/catalogo"],
];

const cookies = {};
for (const [rol, correo] of Object.entries(QUIENES)) if (correo) cookies[rol] = await sesion(correo);

const filas = [];
for (const [rol, ruta] of PANTALLAS) {
  const cookie = cookies[rol];
  if (!cookie) continue;
  const tiempos = [];
  let kb = 0;
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const r = await fetch(`${BASE}${ruta}`, { headers: { cookie } });
    const h = await r.text();
    tiempos.push(Date.now() - t0);
    kb = Math.round(h.length / 1024);
  }
  filas.push({ quien: rol, pantalla: ruta.slice(0, 34), frio: tiempos[0], tibio: Math.min(tiempos[1], tiempos[2]), KB: kb });
}
filas.sort((a, b) => b.tibio - a.tibio);
console.table(filas);
await pg.end();
