// Central corrige los datos del contacto desde la bandeja (0224): con la
// sesión REAL de Central sobre un contacto de práctica, y las tres puertas
// cerradas (comercial, contacto ya derivado, datos iguales).
//   node --env-file=.env.local scripts/_verificar-datos-del-contacto.mjs
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let ok = 0, mal = 0;
const af = (t, c, d = "") => { if (c) { ok++; console.log(`  ✓ ${t}${d ? " — " + d : ""}`); } else { mal++; console.log(`  ✗ ${t}${d ? " — " + d : ""}`); } };

async function como(email) {
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const jar = new Map();
  const ssr = createServerClient(url, anon, { cookies: { getAll: () => [...jar.entries()].map(([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
  await ssr.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  return ssr;
}

// Un contacto de práctica como el de Central: nombre equivocado, sin teléfono.
const { data: lead } = await admin.from("leads").insert({
  canal: "llamada", area_destino: "comercial", estado: "pendiente_triaje", es_prueba: true,
  nombre_contacto: "Topitop", razon_social: null, telefono: null, email: null, num_doc: null,
  mensaje: "Verificación 0224: lavadora de 20 kg", recibido_por: null,
}).select("id, codigo").single();
console.log(`Contacto de práctica ${lead.codigo}`);

try {
  const central = await como("central@efameinsa.com");
  const c5 = await como("comercial5@efameinsa.com");

  console.log("\nPuertas cerradas:");
  let r = await c5.rpc("corregir_datos_lead", { p_lead_id: lead.id, p_nombre: "Carlos" });
  af("un comercial no corrige los datos", Boolean(r.error), r.error?.message);
  r = await central.rpc("corregir_datos_lead", { p_lead_id: lead.id, p_nombre: "Topitop" });
  af("sin cambios, avisa que no hay nada que corregir", /nada que corregir/.test(r.error?.message ?? ""), r.error?.message);
  r = await central.rpc("corregir_datos_lead", { p_lead_id: lead.id, p_nombre: "Carlos", p_num_doc: "123" });
  af("un documento que no es DNI ni RUC se rechaza", /DNI|RUC/.test(r.error?.message ?? ""), r.error?.message);
  r = await central.rpc("corregir_datos_lead", { p_lead_id: lead.id, p_nombre: "Carlos", p_email: "sin-arroba" });
  af("un correo sin forma de correo se rechaza", /correo/.test(r.error?.message ?? ""), r.error?.message);

  console.log("\nCentral corrige:");
  r = await central.rpc("corregir_datos_lead", {
    p_lead_id: lead.id, p_nombre: "Carlos Quispe", p_razon_social: "TOPITOP S.A.",
    p_telefono: "987 654 321", p_email: "Compras@Topitop.pe", p_num_doc: "20100047056",
  });
  af("guarda nombre, empresa, teléfono, correo y documento", !r.error, r.error?.message);
  const { data: d } = await admin.from("leads").select("nombre_contacto, razon_social, telefono, telefono_normalizado, email, num_doc, datos_originales, datos_editados_at").eq("id", lead.id).single();
  af("el nombre ya dice Carlos Quispe", d.nombre_contacto === "Carlos Quispe", d.nombre_contacto);
  af("la empresa, el teléfono y el documento quedaron", d.razon_social === "TOPITOP S.A." && d.telefono === "987 654 321" && d.num_doc === "20100047056");
  af("el correo se guarda en minúsculas", d.email === "compras@topitop.pe", d.email);
  af("el teléfono normalizado sirve para el cruce de duplicados", d.telefono_normalizado === "987654321", d.telefono_normalizado);
  af("lo que entró quedó guardado", d.datos_originales?.nombre_contacto === "Topitop" && d.datos_originales?.telefono === null, JSON.stringify(d.datos_originales));
  af("con fecha", Boolean(d.datos_editados_at));

  r = await central.rpc("corregir_datos_lead", { p_lead_id: lead.id, p_nombre: "Carlos Quispe Huamán", p_razon_social: "TOPITOP S.A.", p_telefono: "987 654 321", p_email: "compras@topitop.pe", p_num_doc: "20100047056" });
  const { data: d2 } = await admin.from("leads").select("nombre_contacto, datos_originales").eq("id", lead.id).single();
  af("una segunda corrección conserva el original de la primera", !r.error && d2.datos_originales?.nombre_contacto === "Topitop", d2.nombre_contacto);

  console.log("\nDerivado, ya no:");
  await admin.from("leads").update({ estado: "descartado" }).eq("id", lead.id);
  r = await central.rpc("corregir_datos_lead", { p_lead_id: lead.id, p_nombre: "Otro" });
  af("fuera de la bandeja no se corrige y dice por qué", /ficha del cliente/.test(r.error?.message ?? ""), r.error?.message);
} finally {
  await admin.from("leads").delete().eq("id", lead.id);
  console.log(`\nContacto de práctica borrado.`);
}
console.log(`\n${ok} bien · ${mal} mal`);
process.exit(mal ? 1 : 0);
