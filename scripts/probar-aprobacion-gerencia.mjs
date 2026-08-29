// Quién puede resolver un precio bajo lista, y quién no.
//
// POR QUÉ EXISTE: el 29-08 el ingeniero no pudo rechazar un precio por debajo
// de lo óptimo — le salía «Solo gerencia aprueba precios bajo lista»— y había
// que averiguar si el permiso estaba mal o si el clic salía de otra sesión.
// De paso apareció que el control dejaba pasar a quien no tiene perfil.
//
// CÓMO PRUEBA SIN ESCRIBIR: se llama a `resolver_aprobacion_cotizacion` con los
// dos arreglos VACÍOS sobre una cotización que tiene al menos un equipo por
// decidir. Con esa forma, la función revienta en «faltan equipos por decidir»
// ANTES de tocar una sola fila. Si la cotización no tuviera equipos por
// decidir, la llamada SÍ escribiría: por eso se comprueba antes y, si no,
// no se prueba nada.
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let fallas = 0;
const check = (b, t) => {
  console.log(`${b ? "  ✓" : "  ✗ FALLA:"} ${t}`);
  if (!b) fallas++;
};

async function sesion(correo) {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: correo });
  if (error) throw error;
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error: e2 } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (e2) throw e2;
  return c;
}

// Una cotización esperando decisión, con al menos un equipo por decidir.
const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();
const { rows } = await bd.query(
  `select c.id, count(*) filter (where ci.requiere_aprobacion) por_decidir
     from cotizaciones c
     join cotizacion_items ci on ci.cotizacion_id = c.id
    where c.estado_aprobacion = 'pendiente_gerencia'
    group by c.id
   having count(*) filter (where ci.requiere_aprobacion) > 0
    limit 1`,
);
await bd.end();

if (rows.length === 0) {
  console.log("No hay ninguna cotización pendiente con equipos por decidir: no se puede probar sin escribir.");
  process.exit(0);
}
const cotizacion = rows[0].id;
console.log(`Cotización de prueba: ${cotizacion} · ${rows[0].por_decidir} equipo(s) por decidir\n`);

const sonda = (cliente) =>
  cliente.rpc("resolver_aprobacion_cotizacion", {
    p_cotizacion_id: cotizacion,
    p_aprobados: [],
    p_rechazados: [],
    p_nota: null,
  });

// «Faltan N equipo(s)» = pasó el control de gerencia y se detuvo antes de
// escribir. Es la señal de que la cuenta SÍ puede resolver.
const paso = (r) => /Faltan \d+ equipo/i.test(r.error?.message ?? "");

console.log("LAS DOS CUENTAS DE GERENCIA RESUELVEN");
for (const correo of ["kycabrejos@efameinsa.com", "crcabrejos@efameinsa.com"]) {
  const r = await sonda(await sesion(correo));
  check(paso(r), `${correo} pasa el control (${r.error?.message ?? r.data})`);
}

console.log("\nQUIEN NO ES GERENCIA NO RESUELVE, Y EL AVISO LE DICE POR QUÉ");
const comercial = await sonda(await sesion("comercial1@efameinsa.com"));
const msj = comercial.error?.message ?? "";
check(!paso(comercial), `un comercial es rechazado (${msj})`);
// Después de la migración 0127 el aviso dice con qué cuenta se está entrando.
check(
  /esta sesión es de|entre con la cuenta de gerencia/i.test(msj),
  "el aviso dice con qué cuenta está entrando y qué hacer",
);

console.log("\nSIN SESIÓN NO SE APRUEBA NADA");
const anonimo = await sonda(createClient(url, anon, { auth: { persistSession: false } }));
check(
  !paso(anonimo),
  `una llamada sin sesión es rechazada (${anonimo.error?.message ?? anonimo.data})`,
);

console.log(fallas === 0 ? "\nTODO VERDE\n" : `\n${fallas} FALLA(S)\n`);
process.exit(fallas ? 1 : 0);
