// Saca de la bandeja de Central los contactos que YA estaban en el sistema,
// marcándolos como repetidos en vez de descartados.
//
// POR QUÉ. El 25-08 Central preguntó qué hacer con los prospectos «que fueron
// anteriormente derivados» — iba a descartarlos uno por uno. El caso que puso
// (Edwar Paul Santillán, sábado 22-08) había entrado DOS veces: por su llamada,
// que ella registró y derivó a C4, y aparte por el formulario de la campaña de
// publicidad. Al cruzar toda la bandeja, 24 de los 43 pendientes estaban igual.
// Marcarlos a mano son 24 confirmaciones; y descartarlos —que es lo único que
// la pantalla ofrecía— habría hecho figurar a la campaña que trajo esos
// clientes como una campaña que trae basura.
//
// QUÉ TOCA Y QUÉ NO. Solo marca lo que cumple LAS TRES condiciones:
//   1. coincide por documento, teléfono o correo con una cuenta existente;
//   2. el nombre del contacto comparte alguna palabra con la razón social de
//      esa cuenta o con el contacto registrado en ella;
//   3. esa cuenta se trabajó dentro de los 4 días en que entró el contacto.
// Todo lo demás se lista para que lo mire una persona. Los dos casos que la
// tercera condición deja fuera son reales y NO son duplicados: clientes
// antiguos que vuelven a escribir (Katya Sarría, de Operador Nacional de
// Hoteles, cliente de C1 desde 2023) — esos hay que derivarlos a su dueño.
// Los contactos de prueba (`es_prueba`) tampoco se tocan.
//
// Uso:
//   node --env-file=.env.local scripts/marcar-duplicados-bandeja.mjs            (solo informa)
//   node --env-file=.env.local scripts/marcar-duplicados-bandeja.mjs --aplicar  (marca)

import { createClient } from "@supabase/supabase-js";

const APLICAR = process.argv.includes("--aplicar");
const DIAS_MISMO_HECHO = 4;

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// supabase-js corta en 1.000 filas sin avisar: con 13.578 contactos y 24.763
// oportunidades, pedir "todo" sin paginar da un cruce silenciosamente falso —
// la primera versión de este cruce reportó "0 de 43" por esto exactamente.
async function todo(tabla, columnas) {
  const filas = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await db.from(tabla).select(columnas).range(i, i + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    filas.push(...data);
    if (data.length < 1000) break;
  }
  return filas;
}

const normTel = (t) => {
  const d = (t ?? "").replace(/\D/g, "");
  return d.length > 9 && d.startsWith("51") ? d.slice(2) : d;
};
const palabras = (s) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 2);

const leads = (await todo("leads", "id, codigo, estado, area_destino, es_prueba, nombre_contacto, telefono, num_doc, email, recibido_at"))
  .filter((l) => l.estado === "pendiente_triaje" && l.area_destino === "comercial" && !l.es_prueba)
  .sort((a, b) => (a.recibido_at < b.recibido_at ? -1 : 1));
const contactos = await todo("contactos", "cuenta_id, nombre, telefono, email");
const cuentas = await todo("cuentas", "id, razon_social, num_doc, tipo_doc, comercial_id");
const perfiles = await todo("perfiles", "id, nombre, codigo_comercial");
const oportunidades = await todo("oportunidades", "cuenta_id, etapa, created_at");

const cuentaPorId = new Map(cuentas.map((c) => [c.id, c]));
const perfilPorId = new Map(perfiles.map((p) => [p.id, p]));
const porTelefono = new Map();
const porCorreo = new Map();
for (const c of contactos) {
  const t = normTel(c.telefono);
  if (t.length >= 8 && !porTelefono.has(t)) porTelefono.set(t, c);
  const e = c.email?.trim().toLowerCase();
  if (e?.includes("@") && !porCorreo.has(e)) porCorreo.set(e, c);
}
const porDoc = new Map();
for (const c of cuentas) {
  if (c.num_doc && c.tipo_doc !== "SIN_DOC" && !porDoc.has(c.num_doc)) porDoc.set(c.num_doc, c);
}
const opsPorCuenta = new Map();
for (const o of oportunidades) {
  const xs = opsPorCuenta.get(o.cuenta_id);
  if (xs) xs.push(o);
  else opsPorCuenta.set(o.cuenta_id, [o]);
}

const repetidos = [];
const revisar = [];
const nuevos = [];

for (const lead of leads) {
  const doc = lead.num_doc?.replace(/\D/g, "") ?? "";
  const tel = normTel(lead.telefono);
  const correo = lead.email?.trim().toLowerCase() ?? "";

  let cuenta = null;
  let contacto = null;
  let motivo = null;
  if (doc.length >= 8 && porDoc.has(doc)) {
    cuenta = porDoc.get(doc);
    motivo = "documento";
  } else if (tel.length >= 8 && porTelefono.has(tel)) {
    contacto = porTelefono.get(tel);
    cuenta = cuentaPorId.get(contacto.cuenta_id);
    motivo = "teléfono";
  } else if (correo.includes("@") && porCorreo.has(correo)) {
    contacto = porCorreo.get(correo);
    cuenta = cuentaPorId.get(contacto.cuenta_id);
    motivo = "correo";
  }
  if (!cuenta) {
    nuevos.push({ lead });
    continue;
  }

  const ops = opsPorCuenta.get(cuenta.id) ?? [];
  const ultima = ops.reduce((a, b) => (!a || b.created_at > a.created_at ? b : a), null);
  const dias = ultima
    ? Math.abs(new Date(lead.recibido_at) - new Date(ultima.created_at)) / 86_400_000
    : Infinity;

  const dellead = palabras(lead.nombre_contacto);
  const deLaCuenta = new Set([...palabras(cuenta.razon_social), ...palabras(contacto?.nombre)]);
  const nombreCoincide = dellead.some((p) => deLaCuenta.has(p));

  const comercial = cuenta.comercial_id ? perfilPorId.get(cuenta.comercial_id) : null;
  const fila = { lead, cuenta, motivo, ultima, dias: Math.round(dias), comercial };

  if (nombreCoincide && dias <= DIAS_MISMO_HECHO) repetidos.push(fila);
  else revisar.push({ ...fila, porque: !nombreCoincide ? "el nombre no coincide" : "la gestión es de otra fecha" });
}

const linea = (f) =>
  `  ${f.lead.codigo}  ${f.lead.recibido_at.slice(0, 10)}  ${(f.lead.nombre_contacto ?? "—").slice(0, 30).padEnd(32)}` +
  `→ ${(f.cuenta.razon_social ?? "").slice(0, 30).padEnd(32)}` +
  `${(f.comercial?.codigo_comercial ?? "sin dueño").padEnd(9)} ` +
  `${f.ultima ? `${f.ultima.etapa} ${f.ultima.created_at.slice(0, 10)}` : "sin gestión"}  (por ${f.motivo})`;

console.log(`\nBandeja de triaje: ${leads.length} contactos pendientes (sin contar los de prueba)\n`);
console.log(`━━ ${repetidos.length} REPETIDOS · ya derivados y trabajados esos mismos días`);
repetidos.forEach((f) => console.log(linea(f)));
console.log(`\n━━ ${revisar.length} A REVISAR A MANO · coinciden pero no cumplen las tres condiciones`);
revisar.forEach((f) => console.log(`${linea(f)}  ← ${f.porque}`));
console.log(`\n━━ ${nuevos.length} SIN RASTRO PREVIO · trabajo real pendiente`);
nuevos.forEach(({ lead }) =>
  console.log(`  ${lead.codigo}  ${lead.recibido_at.slice(0, 16)}  ${(lead.nombre_contacto ?? "—").slice(0, 32)}`),
);

if (!APLICAR) {
  console.log(`\nNada se ha modificado. Para marcar los ${repetidos.length} repetidos:`);
  console.log("  node --env-file=.env.local scripts/marcar-duplicados-bandeja.mjs --aplicar\n");
  process.exit(0);
}

let hechos = 0;
for (const f of repetidos) {
  // El candado por estado va también acá: si alguien de Central asignó ese
  // contacto mientras corría el script, no se le pisa el trabajo.
  const { data, error } = await db
    .from("leads")
    .update({ estado: "duplicado", cuenta_id: f.cuenta.id })
    .eq("id", f.lead.id)
    .eq("estado", "pendiente_triaje")
    .select("id");
  if (error) console.error(`  ✗ ${f.lead.codigo}: ${error.message}`);
  else if (!data.length) console.warn(`  · ${f.lead.codigo}: ya no estaba pendiente, se deja como está`);
  else hechos++;
}
console.log(`\n✓ ${hechos} contactos marcados como repetidos y vinculados a su cuenta.`);
console.log(`  Quedan ${leads.length - hechos} en la bandeja de Central.\n`);
