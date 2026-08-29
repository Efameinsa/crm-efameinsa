// La PANTALLA de «Lo que derivé» tal como la sirve producción, entrando con la
// sesión de Central. No alcanza con probar la consulta: si el navegador está
// viendo una versión anterior del sitio, la fila puede estar en la base y no en
// la pantalla. Esto trae el HTML de verdad y busca el contacto dentro.
//
// Uso: node --env-file=.env.local scripts/_ver-pantalla-como-central.mjs [PRO-09048] [url]
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const buscado = process.argv[2] ?? "PRO-09048";
const sitio = process.argv[3] ?? "https://crm.efameinsa.com";

const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();
const { rows: perfil } = await bd.query("select id, nombre from perfiles where rol='central' and not es_prueba limit 1");
await bd.end();

const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: usuarios } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const usuario = usuarios.users.find((u) => u.id === perfil[0].id);
const { data: enlace } = await admin.auth.admin.generateLink({ type: "magiclink", email: usuario.email });

const verificacion = await fetch(`${url}/auth/v1/verify?token=${enlace.properties.hashed_token}&type=magiclink`, {
  headers: { apikey: anon },
  redirect: "manual",
});
const params = new URL((verificacion.headers.get("location") ?? "").replace("#", "?")).searchParams;
const sesion = {
  access_token: params.get("access_token"),
  refresh_token: params.get("refresh_token"),
  expires_at: Number(params.get("expires_at")),
  expires_in: Number(params.get("expires_in")),
  token_type: "bearer",
  user: { id: usuario.id, email: usuario.email },
};

// La cookie que deja @supabase/ssr: el JSON de la sesión en base64.
const ref = new URL(url).hostname.split(".")[0];
const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(sesion)).toString("base64url")}`;

for (const ruta of ["/central/derivados", "/central/derivados?practica=1"]) {
  const r = await fetch(`${sitio}${ruta}`, { headers: { cookie }, redirect: "manual" });
  const html = r.status === 200 ? await r.text() : "";
  const entro = r.status === 200 && !html.includes("Iniciar sesión");
  console.log(`\n${ruta}`);
  console.log(`   respuesta ${r.status}${entro ? "" : "  (no entró: redirige al login)"}`);
  if (entro) {
    console.log(`   ¿aparece ${buscado}? ${html.includes(buscado) ? "SÍ" : "NO"}`);
    console.log(`   ¿dice «Práctica»?  ${html.includes("Práctica") ? "SÍ" : "NO"}`);
    const contactos = html.match(/(\d+) contactos?/)?.[0];
    if (contactos) console.log(`   la pantalla lista ${contactos}`);
  }
}
