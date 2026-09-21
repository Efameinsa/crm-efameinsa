/**
 * Baja una ruta del CRM con la sesión de cualquier cuenta y la guarda en un archivo.
 * Sirve para los PDF (reportes, cierres), que el pantallazo no puede abrir.
 *
 * Uso: COMO=postventa@efameinsa.com RUTA="/api/reportes/diario?fecha=2026-09-21" SALIDA=Downloads/x.pdf node --env-file=.env.local scripts/_bajar-como.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE ?? "https://crm.efameinsa.com";
const RUTA = process.env.RUTA ?? "/";
const COMO = process.env.COMO ?? "lesly@efameinsa.com";
const SALIDA = process.env.SALIDA ?? "scripts/data/_bajado.bin";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let link = null;
for (let i = 0; i < 8 && !link; i++) {
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email: COMO });
  if (data?.properties) link = data;
  else await new Promise((r) => setTimeout(r, 4000));
}
const jar = new Map();
const ssr = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  cookies: {
    getAll: () => [...jar.entries()].map(([n, v]) => ({ name: n, value: v })),
    setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)),
  },
});
const { error } = await ssr.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
if (error) { console.error("no se pudo abrir sesión:", error.message); process.exit(1); }

const cookie = [...jar.entries()].map(([n, v]) => `${n}=${v}`).join("; ");
const r = await fetch(`${BASE}${RUTA}`, { headers: { cookie } });
const cuerpo = Buffer.from(await r.arrayBuffer());
writeFileSync(SALIDA, cuerpo);
console.log(r.status, r.headers.get("content-type"), cuerpo.length, "bytes →", SALIDA);
