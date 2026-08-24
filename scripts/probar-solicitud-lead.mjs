// Verifica que la solicitud del prospecto —lo que pidió— se vea en las tres
// pantallas donde hace falta: la bandeja de Central, el diálogo de asignación y
// la ficha del comercial. El dato siempre estuvo en leads.mensaje; lo que no
// existía era mostrarlo (pedido de Brenda, 24-08).
//
// Uso: node --env-file=.env.local scripts/probar-solicitud-lead.mjs [url]

import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL } = process.env;
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const bd = new Client({ connectionString: DATABASE_URL, ssl:{rejectUnauthorized:false} }); await bd.connect();
const URL_APP = process.argv[2] ?? "http://localhost:3000";
let fallas=0; const ok=(b,t,e="")=>{console.log(`${b?"✓":"✗"} ${t}${e?` — ${e}`:""}`); if(!b)fallas++;};

async function sesion(filtro) {
  const { data: p } = await admin.from("perfiles").select("id, nombre").match(filtro).single();
  const { data: u } = await admin.auth.admin.getUserById(p.id);
  let enl=null;
  for(let i=1;i<=4&&!enl;i++){ const r=await admin.auth.admin.generateLink({type:"magiclink",email:u.user.email});
    enl=r.data?.properties?r.data:null; if(!enl) await new Promise(x=>setTimeout(x,i*15000)); }
  if(!enl) return null;
  const anon = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
  const { data: s } = await anon.auth.verifyOtp({ token_hash: enl.properties.hashed_token, type:"magiclink" });
  const ref = new URL(NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const v = "base64-"+Buffer.from(JSON.stringify(s.session)).toString("base64");
  const t = v.match(/.{1,3180}/g);
  return { nombre: p.nombre, cookie: t.length===1?`sb-${ref}-auth-token=${t[0]}`:t.map((x,i)=>`sb-${ref}-auth-token.${i}=${x}`).join("; ") };
}
const pedir = async (ruta, cookie) => {
  const r = await fetch(`${URL_APP}${ruta}`, { headers:{cookie} });
  return { status:r.status, html:(await r.text()).replace(/<!--\s*-->/g,"") };
};

// --- CENTRAL ---
const c = await sesion({ rol: "central" });
if (!c) { console.error("rate limit de Supabase; reintentar"); process.exit(1); }
console.log(`Sesión Central: ${c.nombre}\n`);
const band = await pedir("/central", c.cookie);
ok(band.status===200, "la bandeja de Central carga");
ok(band.html.includes("Qué solicita"), "cada lead muestra QUÉ SOLICITA");
ok(band.html.includes("Equipos de Lavandería"), "se ve la campaña de origen del lead", "de los leads de Google Ads");
// El id de formulario NO se pinta, pero el mensaje crudo sí viaja como prop
// del diálogo de asignación, que es componente de cliente. Así que no sirve
// buscar su ausencia en el HTML: se comprueba que lo que SÍ se pinta son las
// etiquetas legibles.
ok(band.html.includes("Ciudad") && band.html.includes("Campaña"),
   "el mensaje se despliega en etiquetas legibles (Ciudad, Campaña)");
const cap = await pedir("/central/captura", c.cookie);
ok(cap.status===200 && cap.html.includes("¿Qué solicita?"), "el formulario de captura pregunta qué solicita");
ok(cap.html.includes("lo primero que ve el comercial"), "el formulario explica para qué sirve ese campo");

// --- COMERCIAL: una oportunidad que venga de un lead con mensaje ---
const { rows } = await bd.query(
  `select o.id, p.codigo_comercial from oportunidades o
     join leads l on l.id = o.lead_id join perfiles p on p.id = o.comercial_id
    where l.mensaje is not null and o.comercial_id is not null limit 1`);
if (!rows.length) { ok(false, "no hay oportunidad con lead+mensaje para probar"); }
else {
  const com = await sesion({ codigo_comercial: rows[0].codigo_comercial });
  const fic = await pedir(`/comercial/oportunidades/${rows[0].id}`, com.cookie);
  ok(fic.status===200, `la ficha carga con sesión de ${com.nombre}`);
  ok(fic.html.includes("Solicitud del prospecto"), "el comercial ve la solicitud del prospecto");
  ok(fic.html.includes("Entró por"), "y por qué canal entró");
}
await bd.end();
console.log(fallas===0 ? "\n✓ Todo verificado" : `\n✗ ${fallas} fallaron`);
process.exit(fallas===0?0:1);
