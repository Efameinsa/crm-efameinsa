// Guarda en `sunat_candidatos` lo que devolvió la consulta a SUNAT por razón
// social, ya clasificado por confianza. NO TOCA `cuentas`: eso lo hace después
// scripts/aplicar-ruc-aprobados.mjs, y solo con lo que gerencia apruebe.
//
// POR QUÉ LA CLASIFICACIÓN VA ACÁ Y NO A OJO: buscar por nombre trae
// homónimos, y un RUC equivocado es peor que ningún RUC — le pegaría a una
// cuenta la identidad de otra empresa y la deduplicación posterior mezclaría
// los historiales de venta de dos clientes distintos. Las reglas son
// deterministas para que la misma entrada dé siempre la misma confianza y
// gerencia sepa qué está aprobando.
//
// Uso:
//   node --env-file=.env.local scripts/registrar-candidatos-sunat.mjs archivo.json
// donde archivo.json es [{ cuentaId, razonSocial, contributors: [...] }, …]

import { readFileSync } from "node:fs";
import { Client } from "pg";

const RUTA = process.argv[2];
if (!RUTA) {
  console.error("Falta el archivo JSON con los resultados.");
  process.exit(1);
}

// Los sufijos societarios sobran al comparar: "SIERRA MINERA CARAZ" y "SIERRA
// MINERA CARAZ S.A.C" son la misma empresa escrita de dos maneras.
const SUFIJOS =
  /\b(SOCIEDAD ANONIMA CERRADA|SOCIEDAD ANONIMA|SOCIEDAD COMERCIAL DE RESPONSABILIDAD LIMITADA|EMPRESA INDIVIDUAL DE RESPONSABILIDAD LIMITADA|SAC|SA|SRL|EIRL|SCRL|SAA)\b/g;

function normalizar(texto) {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(SUFIJOS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// SUNAT devuelve también el nombre comercial pegado con guion ("LOGISTIC
// INDUSTRY & MINING SOCIEDAD ANONIMA - LOGISMINSA S.A."): se comparan las dos
// partes, porque el CRM suele tener guardada la corta.
function partes(nombre) {
  return nombre.split(/\s+-\s+/).map(normalizar).filter(Boolean);
}

function clasificar(razonSocialCrm, contributors) {
  const crm = normalizar(razonSocialCrm);
  // El CRM también trae nombres compuestos ("INVERSIONES EN TURISMO S.A. -
  // HOTEL LAS DUNAS SUN RESORT": razón social y nombre del hotel). Se comparan
  // las partes de los dos lados, si no la coincidencia se pierde. El aviso de
  // "dos razones sociales" ya se encarga de bajarle la confianza a estos casos.
  const crmPartes = partes(razonSocialCrm);
  const encaja = (nombreSunat) => partes(nombreSunat).some((p) => crmPartes.includes(p));
  const activos = contributors.filter((c) => c.status === "ACTIVO");

  if (contributors.length === 0) {
    return { resultado: "sin_resultado", confianza: "ninguna", motivo: "SUNAT no devolvió ninguna empresa con ese nombre.", elegido: null };
  }
  if (activos.length === 0) {
    return {
      resultado: "sin_resultado",
      confianza: "ninguna",
      motivo: `Los ${contributors.length} resultados están de baja en SUNAT.`,
      elegido: null,
    };
  }

  const exactos = activos.filter((c) => encaja(c.name));

  if (exactos.length === 1) {
    return {
      resultado: "exacta_unica",
      confianza: "alta",
      motivo: "Un solo contribuyente activo y el nombre coincide exactamente (sin contar el tipo de sociedad).",
      elegido: exactos[0],
    };
  }
  if (exactos.length > 1) {
    return {
      resultado: "varias",
      confianza: "baja",
      motivo: `${exactos.length} empresas activas se llaman igual. Hay que elegir a mano.`,
      elegido: null,
    };
  }

  // Sin coincidencia exacta: se acepta que uno contenga al otro, pero eso ya
  // no da confianza alta.
  const contiene = activos.filter((c) => partes(c.name).some((p) => p.includes(crm) || crm.includes(p)));
  if (contiene.length === 1) {
    return {
      resultado: "unica_aproximada",
      confianza: "media",
      motivo: `El nombre no es idéntico pero uno contiene al otro: "${razonSocialCrm}" vs "${contiene[0].name}".`,
      elegido: contiene[0],
    };
  }
  if (activos.length === 1) {
    return {
      resultado: "unica_aproximada",
      confianza: "baja",
      motivo: `Un solo activo, pero el nombre no encaja: "${razonSocialCrm}" vs "${activos[0].name}".`,
      elegido: activos[0],
    };
  }
  return {
    resultado: "varias",
    confianza: "baja",
    motivo: `${activos.length} candidatos activos y ninguno con el nombre idéntico.`,
    elegido: null,
  };
}

// Dos formatos de entrada. El .json es el completo; el .txt es compacto,
// pensado para cargar tandas grandes a mano sin escribir JSON:
//
//   RAZON SOCIAL DEL CRM
//     20136424867 | DERRAMA MAGISTERIAL | LIMA | ACTIVO
//     20561119130 | EMPRESA DE TRANSPORTES ... | CHICLAYO | BAJA DE OFICIO
//   OTRA RAZON SOCIAL   [tope]        <- "[tope]" = SUNAT devolvió las 30
//     (sin sangría y sin líneas debajo = sin resultados)
function leerCompacto(texto) {
  const salida = [];
  for (const linea of texto.split("\n")) {
    const limpia = linea.replace(/\r$/, "");
    if (!limpia.trim()) continue;
    if (/^\s/.test(limpia)) {
      const [ruc, name, location, status] = limpia.split("|").map((x) => x.trim());
      salida[salida.length - 1].contributors.push({
        ruc,
        name,
        location: location || null,
        status: status || null,
      });
    } else {
      const capped = /\[tope\]\s*$/.test(limpia);
      salida.push({
        razonSocial: limpia.replace(/\s*\[tope\]\s*$/, "").trim(),
        capped,
        contributors: [],
      });
    }
  }
  return salida;
}

const bruto = readFileSync(RUTA, "utf8");
const entradas = RUTA.endsWith(".txt") ? leerCompacto(bruto) : JSON.parse(bruto);
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

// El formato compacto no trae el id: se resuelve por razón social NORMALIZADA
// contra las cuentas sin documento. Normalizada y no exacta porque el CRM
// arrastra espacios dobles y tildes del Excel ("VOLCAN COMPAÑÍA   MINERA SA")
// y transcribir eso a mano pierde filas en silencio.
//
// Si el nombre normalizado cae en VARIAS cuentas, el resultado se registra en
// TODAS. Parece arriesgado y no lo es: cuando SUNAT devuelve una sola empresa
// activa con ese nombre exacto, no existe otra empresa así en el Perú, así que
// esas fichas del CRM son la misma. Cada una queda con su propio RUC sugerido
// y la fusión posterior las une por documento. Antes se saltaban, y eso dejaba
// trabadas justamente las que más falta hacía limpiar (NEWREST, LOGISMINSA,
// HASS PERU: partidas en dos fichas cada una).
const sinId = entradas.filter((e) => !e.cuentaId);
if (sinId.length) {
  const { rows } = await bd.query("select id, razon_social from cuentas where tipo_doc = 'SIN_DOC'");
  const porNombre = new Map();
  for (const r of rows) {
    const clave = normalizar(r.razon_social);
    if (!porNombre.has(clave)) porNombre.set(clave, []);
    porNombre.get(clave).push(r.id);
  }
  const expandidas = [];
  for (const e of sinId) {
    const ids = porNombre.get(normalizar(e.razonSocial)) ?? [];
    e.cuentaId = ids[0] ?? null;
    // Las copias extra entran como entradas propias, con el mismo resultado.
    for (const otro of ids.slice(1)) expandidas.push({ ...e, cuentaId: otro });
  }
  if (expandidas.length) {
    entradas.push(...expandidas);
    console.log(`↔ ${expandidas.length} ficha(s) más con el mismo nombre reciben el mismo resultado; la fusión las unirá por RUC.`);
  }
  const perdidas = entradas.filter((e) => !e.cuentaId);
  if (perdidas.length) {
    console.log(`⚠️ ${perdidas.length} sin cuenta que coincida, se saltan: ${perdidas.map((e) => e.razonSocial).join(" · ").slice(0, 240)}`);
  }
}

const cuenta = { alta: 0, media: 0, baja: 0, ninguna: 0 };

for (const e of entradas) {
  if (!e.cuentaId) continue;
  const { resultado, confianza, motivo, elegido } = clasificar(e.razonSocial, e.contributors ?? []);
  const avisos = [motivo];

  // Dos razones sociales metidas en un campo ("CORPORACION CENTRAL SUAREZ SAC
  // - AVIVA DEL PERU …"): el RUC hallado es el de UNA de las dos, y cuál es el
  // cliente lo tiene que decir el comercial.
  if (/\S\s+-\s+\S/.test(e.razonSocial) && /\b(SAC|SA|SRL|EIRL|SOCIEDAD)\b/i.test(e.razonSocial)) {
    avisos.push("⚠️ El nombre del CRM parece traer DOS razones sociales; el RUC hallado es el de una sola.");
  }
  // Un RUC que empieza en 10 es persona natural con negocio, no empresa.
  if (elegido?.ruc?.startsWith("10")) {
    avisos.push("⚠️ RUC de persona natural (empieza en 10), no de empresa.");
  }

  // SUNAT corta en 30 resultados: si llegó al tope, el nombre es demasiado
  // genérico ("SERVICIOS GENERALES") y elegir de esa lista es adivinar.
  if (e.capped) {
    avisos.push("⚠️ SUNAT devolvió el máximo de 30 coincidencias: el nombre es demasiado genérico para decidir por él.");
  }

  // EL HALLAZGO MÁS ÚTIL: si el RUC que devolvió SUNAT YA está en otra cuenta
  // del CRM, acabamos de encontrar el duplicado — y encima uno que comparar
  // nombres no habría encontrado nunca ("OSWIL GROUP S.A.C." contra "OSWILL
  // GROUP SAC", con una L de más). Ahí lo que corresponde no es ponerle el RUC
  // a esta cuenta, sino FUSIONAR las dos.
  let rucYaEnCuenta = null;
  let resultadoFinal = resultado;
  let esDuplicado = false;
  if (elegido?.ruc) {
    const { rows } = await bd.query("select id, razon_social from cuentas where num_doc = $1 and id <> $2 limit 1", [
      elegido.ruc,
      e.cuentaId,
    ]);
    if (rows[0]) {
      rucYaEnCuenta = rows[0].id;
      // Solo es "confirmado" si además el nombre encajaba. Si el nombre no
      // encajaba, que el RUC exista en otra cuenta es justamente la señal de
      // que nos equivocamos de empresa.
      esDuplicado = resultado === "exacta_unica" || resultado === "unica_aproximada";
      if (esDuplicado) {
        resultadoFinal = "duplicado_confirmado";
        avisos.push(`➡️ FUSIONAR con la cuenta "${rows[0].razon_social}", que ya tiene ese RUC.`);
      } else {
        avisos.push(`⚠️ Ese RUC ya está en la cuenta "${rows[0].razon_social}" y el nombre no encajaba: probablemente nos equivocamos de empresa.`);
      }
    }
  }

  // "alta" significa que no queda nada que averiguar sobre la identidad. Un
  // duplicado confirmado lo es —sabemos exactamente qué empresa es—, aunque la
  // fusión en sí siga siendo decisión de gerencia por el tema de la cartera.
  const otrosAvisos = avisos.length - 1 - (esDuplicado ? 1 : 0);
  const confianzaFinal = e.capped
    ? "baja"
    : esDuplicado && resultado === "exacta_unica" && otrosAvisos === 0
      ? "alta"
      : otrosAvisos > 0 && confianza === "alta"
        ? "media"
        : confianza;
  cuenta[confianzaFinal]++;

  await bd.query(
    `insert into sunat_candidatos
       (cuenta_id, razon_social_crm, resultado, candidatos, ruc_sugerido, nombre_sunat,
        ubicacion_sunat, estado_sunat, confianza, motivo, ruc_ya_en_cuenta)
     values ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11)
     on conflict (cuenta_id) do update set
       razon_social_crm = excluded.razon_social_crm, consultado_at = now(),
       resultado = excluded.resultado, candidatos = excluded.candidatos,
       ruc_sugerido = excluded.ruc_sugerido, nombre_sunat = excluded.nombre_sunat,
       ubicacion_sunat = excluded.ubicacion_sunat, estado_sunat = excluded.estado_sunat,
       confianza = excluded.confianza, motivo = excluded.motivo,
       ruc_ya_en_cuenta = excluded.ruc_ya_en_cuenta`,
    [
      e.cuentaId,
      e.razonSocial,
      resultadoFinal,
      JSON.stringify(e.contributors ?? []),
      elegido?.ruc ?? null,
      elegido?.name ?? null,
      elegido?.location ?? null,
      elegido?.status ?? null,
      confianzaFinal,
      avisos.join(" "),
      rucYaEnCuenta,
    ],
  );
}

console.log(`Registrados ${entradas.length}: alta ${cuenta.alta} · media ${cuenta.media} · baja ${cuenta.baja} · sin resultado ${cuenta.ninguna}`);
const { rows: dup } = await bd.query(
  "select count(*)::int n from sunat_candidatos where resultado = 'duplicado_confirmado'");
console.log(`Duplicados que destapó la consulta: ${dup[0].n}`);
const { rows } = await bd.query(
  "select confianza, count(*)::int n from sunat_candidatos where decision is null group by 1 order by 1",
);
console.log("Acumulado sin revisar:", rows.map((r) => `${r.confianza} ${r.n}`).join(" · "));
await bd.end();
