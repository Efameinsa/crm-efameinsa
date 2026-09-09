// La tira del circuito: que el riel exista, se llene hasta donde toca y que el
// paso actual esté marcado. Se prueba sobre una atención DE PRÁCTICA y se la
// devuelve a su etapa.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
const BASE = process.env.BASE ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let ok = 0, mal = 0;
const afirmar = (t, c) => { if (c) { ok++; console.log(`  ✓ ${t}`); } else { mal++; console.log(`  ✗ ${t}`); } };
let link = null;
for (let i = 0; i < 8 && !link; i++) {
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email: "postventa2@efameinsa.com" });
  if (data?.properties) link = data; else await new Promise((r) => setTimeout(r, 4000));
}
const jar = new Map();
const ssr = createServerClient(url, anon, { cookies: { getAll: () => [...jar.entries()].map(([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
await ssr.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
const cookie = [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");

const { data: a } = await admin.from("atenciones").select("id, etapa").eq("es_prueba", true).is("cerrado_at", null).order("id").limit(1).maybeSingle();
if (!a) { console.log("  (sin atención de práctica)"); process.exit(0); }
const original = a.etapa;

for (const etapa of ["registro", "atencion", "cierre"]) {
  await admin.from("atenciones").update({ etapa }).eq("id", a.id);
  const html = await (await fetch(`${BASE}/postventa/atenciones/${a.id}`, { headers: { cookie } })).text();
  const avance = html.match(/--avance:\s*([0-9.]+)/)?.[1];
  // Se cuenta por el ENVOLTORIO —el que lleva el halo— porque la medalla de
  // adentro también marca data-actual, para el latido del dibujo.
  const actuales = (html.match(/data-actual="true" class="halo-atencion/g) ?? []).length;
  console.log(`  etapa «${etapa}» → avance ${avance ?? "?"} · pasos marcados como actual: ${actuales}`);
  afirmar(`en «${etapa}» el riel trae su avance`, avance !== undefined);
  afirmar(`en «${etapa}» hay EXACTAMENTE un paso marcado como el que toca`, actuales === 1);
}
const html = await (await fetch(`${BASE}/postventa/atenciones/${a.id}`, { headers: { cookie } })).text();
afirmar("la tira lleva la clase del riel", html.includes("pista-atencion"));
afirmar("y cada paso su turno de entrada", /--turno/.test(html));
// Santos, 09-09: «pon imágenes con animación y abajo el concepto». Las ocho
// medallas con su dibujo, y el nombre del paso DEBAJO del círculo.
afirmar("las ocho casillas traen su medalla", (html.match(/medalla-atencion/g) ?? []).length === 8);
afirmar("y cada medalla su dibujo", (html.match(/medalla-atencion[^]{0,900}?<svg/g) ?? []).length === 8);
// Las dos primeras las sella Central al derivar, no el área: la tira lo dice
// para que postventa no crea que ya registró algo (Carlos, 09-09).
// Solo las que Central alcanzó a sellar: la atención de práctica no tiene
// `registrado_at`, así que esperar «2» a ciegas haría fallar una prueba sana.
const { data: sellosCentral } = await admin.from("atenciones")
  .select("solicitado_at, registrado_at").eq("id", a.id).maybeSingle();
const cuantasDeCentral = [sellosCentral?.solicitado_at, sellosCentral?.registrado_at].filter(Boolean).length;
afirmar(`la tira dice que lo de Central es de Central (${cuantasDeCentral} sellada/s)`,
  (html.match(/Central ·/g) ?? []).length === cuantasDeCentral);
// El puntito de la esquina era lo que el `overflow` recortaba; ya no está.
afirmar("el pulso ya no cuelga de la esquina", !/-right-1 -top-1/.test(html));
// El riel no debe verse POR DENTRO del círculo: la medalla va opaca.
afirmar("las medallas tapan el riel", !/medalla-atencion[^"]*bg-\[#1E7F4F\]\/10/.test(html));

await admin.from("atenciones").update({ etapa: original }).eq("id", a.id);
const { data: fin } = await admin.from("atenciones").select("etapa").eq("id", a.id).maybeSingle();
afirmar(`la atención de práctica volvió a «${original}»`, fin.etapa === original);
console.log(`\n${ok} ok, ${mal} mal.`);
process.exit(mal ? 1 : 0);
