// ============================================================
// CRM EFAMEINSA · Los pedidos de postventa que no encontraron su cliente
// ============================================================
// La cola de despachos del Excel de control de postventa entró el 25-08 como
// `servicios_postventa`, y el cruce con las fichas de cliente era por razón
// social EXACTA: 123 de 186 quedaron con `cuenta_id` nulo. La migración 0147
// enlazó los que casaban con UNA sola ficha ignorando puntos, espacios y el RUC
// pegado adelante. Quedan 88 sueltos: los que no casan con nadie («AVIVA EL
// PERU» contra «AVIVA EL PERU S.A.C.», el nombre de la señora en vez de su
// empresa, una serie de equipo en el texto y nada más) y los que casan con DOS
// o más fichas —cliente partido— donde no se puede adivinar.
//
// Eso lo decide una persona, no un script: Lesly (operaciones) va a «curar»
// los nombres. Este script arma el Excel para que lo haga sin abrir el CRM:
//
//   Hoja «Pedidos sin cliente»: un pedido por fila con hasta tres fichas
//   candidatas, ordenadas por parecido, y una columna vacía «Elegir ficha
//   (RUC)». Ella escribe el RUC de la ficha buena —o «#1», «#2», «#3» para
//   señalar el candidato, porque hay fichas históricas SIN RUC (cuatro de las
//   cinco NESSUS, por ejemplo)— y `aplicar-servicios-sin-cliente.mjs` lo
//   aplica.
//
//   Hoja «Fichas partidas»: los grupos de fichas que son el mismo cliente
//   escrito de dos maneras, con lo que carga cada una (oportunidades, ventas,
//   cotizaciones históricas), para decidir cuál se queda cuando se fusionen.
//   NESSUS va como caso especial: sus cinco variantes no casan ni por nombre
//   normalizado («NESSUS HOTEL», «NESSUS HOTLES PERU SA - CASA ANDINA»…).
//
// CÓMO SE BUSCA EL PARECIDO, de más a menos seguro:
//   1. El RUC pegado adelante del texto del Excel es el `num_doc` de una ficha.
//   2. El texto del pedido menciona una serie («SERIE: 602KWUC3Y694») y esa
//      serie está en `equipos_instalados` con cuenta: el equipo ya sabe de
//      quién es.
//   3. El nombre normalizado (mayúsculas, solo letras y números) es el mismo
//      que el de una ficha — el criterio de la 0147, que acá puede devolver
//      varias fichas.
//   4. Similitud por trigramas en Postgres (`similarity()` de pg_trgm, que
//      está instalada en esta base); si algún día no estuviera, se calcula en
//      Node un parecido por palabras compartidas.
// Los tres primeros son «candidato fuerte» y van marcados como tales.
//
// El archivo lleva nombres de clientes: `docs/*.xlsx` está en .gitignore y
// NO se versiona. Solo lee de la base (SELECT); no escribe nada.
//
// Uso:
//   node --env-file=.env.local scripts/reporte-servicios-sin-cliente.mjs
import XLSX from "xlsx";
import { Client } from "pg";

const SALIDA = process.env.SALIDA ?? "docs/servicios-sin-cliente.xlsx";
const CANDIDATOS_POR_PEDIDO = 3;
// Debajo de esto, un parecido por trigramas ya no dice nada útil («S.A.C.»
// contra cualquier otra S.A.C.).
const UMBRAL_TRIGRAMAS = 0.3;

// La misma normalización de la 0147: mayúsculas, solo [A-Z0-9], y fuera el
// RUC pegado al nombre («20556440981 - MARANATHA COMEX S.A.C.», y también
// «INDUSTRIAL PESQUERA SANTA MONICA SA - 20205572229», que lo trae al final).
function sinRuc(texto) {
  return String(texto ?? "")
    .replace(/^\d{8,11}\s*-\s*/, "")
    .replace(/\s*-\s*\d{8,11}\s*$/, "");
}
function rucEnTexto(texto) {
  const m = String(texto ?? "").match(/(?<!\d)(\d{11}|\d{8})(?!\d)/);
  return m ? m[1] : null;
}
function sinAcentos(texto) {
  return String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function clave(texto) {
  return sinAcentos(sinRuc(texto)).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Las palabras con las que se puede reconocer a un cliente: fuera la forma
// jurídica (SAC, EIRL, S.A.…), que la comparten miles de fichas.
const PALABRAS_VACIAS = new Set(["SA", "SAC", "SAA", "SRL", "SCRL", "EIRL", "SOCIEDAD", "ANONIMA", "CERRADA", "ABIERTA",
  "EMPRESA", "INDIVIDUAL", "RESPONSABILIDAD", "LIMITADA", "COMERCIAL", "DE", "DEL", "LA", "EL", "LOS", "LAS", "Y", "E", "&"]);
function palabras(texto) {
  return sinAcentos(sinRuc(texto)).toUpperCase().split(/[^A-Z0-9]+/).filter((p) => p && !PALABRAS_VACIAS.has(p));
}

// Las series que menciona un texto. Es el patrón de `seriesDeTexto` en
// src/lib/postventa.ts, con una diferencia: acá el dos puntos después de
// «SERIE» es opcional, porque el Excel de postventa escribe «SERIE
// 405KWPVPG296» sin nada en medio y esas son justo las que hay que encontrar.
// La «S:» a secas sigue exigiendo el signo para no leer «LAVADORAS 13KG» como
// una serie.
function seriesDeTexto(texto) {
  if (!texto) return [];
  const vistas = new Set();
  for (const m of String(texto).matchAll(
    /(?:\bS\/N\s*[:.]?|\bS\s*[:.]|\b(?:SN|SERIE|SERIES)\s*[:.]?)\s*([A-Z0-9][A-Z0-9-]{4,})/gi,
  )) {
    vistas.add(m[1].toUpperCase().replace(/[.,;]$/, ""));
  }
  return [...vistas];
}

// Parecido por palabras compartidas, solo para cuando pg_trgm no esté.
function parecidoPorPalabras(a, b) {
  const A = new Set(palabras(a)), B = new Set(palabras(b));
  if (!A.size || !B.size) return 0;
  let comunes = 0;
  for (const p of A) if (B.has(p)) comunes++;
  return comunes / Math.max(A.size, B.size);
}

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const hayTrigramas = (await bd.query(`select 1 from pg_extension where extname = 'pg_trgm'`)).rowCount > 0;
console.log(hayTrigramas ? "pg_trgm instalada: el parecido lo calcula Postgres." : "pg_trgm NO está: el parecido se calcula en Node por palabras compartidas.");

// ---- Las fichas, con lo que carga cada una -------------------------------
const { rows: cuentas } = await bd.query(`
  select c.id, c.razon_social, c.tipo_doc::text tipo_doc, c.num_doc,
         p.codigo_comercial comercial, p.nombre comercial_nombre,
         coalesce(o.n, 0)::int oportunidades,
         coalesce(v.n, 0)::int ventas,
         coalesce(h.n, 0)::int cotizaciones_historicas,
         coalesce(e.n, 0)::int equipos,
         coalesce(sp.n, 0)::int servicios,
         c.created_at
    from cuentas c
    left join perfiles p on p.id = c.comercial_id
    left join (select cuenta_id, count(*) n from oportunidades group by 1) o on o.cuenta_id = c.id
    left join (select o.cuenta_id, count(*) n from ventas v join oportunidades o on o.id = v.oportunidad_id
                where v.anulada_at is null group by 1) v on v.cuenta_id = c.id
    left join (select cuenta_id, count(*) n from cotizaciones_historicas group by 1) h on h.cuenta_id = c.id
    left join (select cuenta_id, count(*) n from equipos_instalados group by 1) e on e.cuenta_id = c.id
    left join (select cuenta_id, count(*) n from servicios_postventa group by 1) sp on sp.cuenta_id = c.id
`);
for (const c of cuentas) c.palabras = new Set(palabras(c.razon_social));
const cuentaPorId = new Map(cuentas.map((c) => [c.id, c]));
const cuentasPorClave = new Map();
const cuentasPorRuc = new Map();
for (const c of cuentas) {
  const k = clave(c.razon_social);
  if (k) {
    if (!cuentasPorClave.has(k)) cuentasPorClave.set(k, []);
    cuentasPorClave.get(k).push(c);
  }
  if (c.num_doc) {
    if (!cuentasPorRuc.has(c.num_doc)) cuentasPorRuc.set(c.num_doc, []);
    cuentasPorRuc.get(c.num_doc).push(c);
  }
}

// Las series que ya tienen dueño.
const { rows: equipos } = await bd.query(
  `select upper(serie) serie, cuenta_id from equipos_instalados where serie is not null and cuenta_id is not null`,
);
const cuentaPorSerie = new Map();
for (const e of equipos) {
  if (!cuentaPorSerie.has(e.serie)) cuentaPorSerie.set(e.serie, new Set());
  cuentaPorSerie.get(e.serie).add(e.cuenta_id);
}

// ---- Los pedidos sueltos ---------------------------------------------------
const { rows: sueltos } = await bd.query(`
  select s.id, s.cliente_texto, to_char(s.fecha_confirmacion, 'DD-MM-YYYY') fecha_confirmacion,
         s.tipo_servicio, s.equipo, s.observaciones, s.ubicacion, s.monto, s.moneda::text moneda
    from servicios_postventa s
   where s.cuenta_id is null
   order by s.cliente_texto, s.fecha_confirmacion nulls last
`);

let conCandidatoFuerte = 0;
let sinNingunCandidato = 0;
const filasPedidos = [];
const clavesDeSueltos = new Set();

for (const s of sueltos) {
  // Cada candidato acumula motivos y se queda con el puntaje más alto.
  const candidatos = new Map();
  const sumar = (id, puntaje, motivo) => {
    const c = cuentaPorId.get(id);
    if (!c) return;
    const previo = candidatos.get(id) ?? { cuenta: c, puntaje: 0, motivos: [] };
    previo.puntaje = Math.max(previo.puntaje, puntaje);
    if (!previo.motivos.includes(motivo)) previo.motivos.push(motivo);
    candidatos.set(id, previo);
  };

  // 1. RUC pegado al nombre.
  const ruc = rucEnTexto(s.cliente_texto);
  const fichasDelRuc = ruc ? cuentasPorRuc.get(ruc) ?? [] : [];
  for (const c of fichasDelRuc) sumar(c.id, 1, "el RUC del Excel es el de la ficha");

  // 2. Serie de equipo con dueño.
  const series = seriesDeTexto(`${s.equipo ?? ""} ${s.observaciones ?? ""}`);
  for (const serie of series) {
    for (const id of cuentaPorSerie.get(serie) ?? []) sumar(id, 0.95, `la serie ${serie} está en su ficha`);
  }

  // 3. Mismo nombre normalizado (puede ser más de una ficha: cliente partido).
  const k = clave(s.cliente_texto);
  const mismasClave = k ? cuentasPorClave.get(k) ?? [] : [];
  if (mismasClave.length > 1) clavesDeSueltos.add(k);
  for (const c of mismasClave) {
    sumar(c.id, 0.9, mismasClave.length > 1 ? `mismo nombre que ${mismasClave.length} fichas (cliente partido)` : "mismo nombre, sin puntos ni espacios");
  }

  // 4. Todas las palabras del Excel están en el nombre de la ficha («INABIF»
  //    dentro de «PROGRAMA INTEGRAL … - INABIF», «QORITEL SAC» dentro de
  //    «QORITEL SOCIEDAD ANONIMA CERRADA - QORITEL S.A.C.»). Los trigramas no
  //    ven eso cuando el nombre del Excel es corto.
  const propias = palabras(s.cliente_texto);
  if (propias.length) {
    for (const c of cuentas) {
      if (c.palabras.size && propias.every((p) => c.palabras.has(p))) {
        sumar(c.id, 0.75, propias.length === 1 ? `su única palabra («${propias[0]}») está en el nombre de la ficha` : "todas sus palabras están en el nombre de la ficha");
      }
    }
  }

  // 5. Parecido del texto.
  const texto = sinRuc(s.cliente_texto).trim();
  if (hayTrigramas) {
    const { rows } = await bd.query(
      `select id, similarity(upper(razon_social), upper($1)) sim
         from cuentas
        where similarity(upper(razon_social), upper($1)) >= $2
        order by 2 desc, razon_social
        limit 6`,
      [texto, UMBRAL_TRIGRAMAS],
    );
    for (const r of rows) sumar(r.id, Number(r.sim) * 0.85, `se parece (${Math.round(r.sim * 100)}%)`);
  } else {
    const parecidos = cuentas
      .map((c) => ({ id: c.id, sim: parecidoPorPalabras(texto, c.razon_social) }))
      .filter((x) => x.sim >= 0.5)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 6);
    for (const r of parecidos) sumar(r.id, r.sim * 0.85, `comparte palabras (${Math.round(r.sim * 100)}%)`);
  }

  // Los mejores, y entre iguales primero la ficha que más trabajo carga.
  const mejores = [...candidatos.values()]
    .sort((a, b) => b.puntaje - a.puntaje
      || (b.cuenta.ventas + b.cuenta.oportunidades + b.cuenta.cotizaciones_historicas) - (a.cuenta.ventas + a.cuenta.oportunidades + a.cuenta.cotizaciones_historicas))
    .slice(0, CANDIDATOS_POR_PEDIDO);
  const fuerte = mejores.some((m) => m.puntaje >= 0.9);
  if (fuerte) conCandidatoFuerte++;
  if (!mejores.length) sinNingunCandidato++;

  const fila = {
    "id del pedido": s.id,
    "Cliente como está en el Excel": s.cliente_texto,
    // Santos, 02-09: «¿no se les puede poner una pastilla con algún
    // diferencial, para ver que no son duplicados sino gestiones
    // diferentes?». Se rellenan abajo, cuando ya están todas las filas.
    "Mismo cliente": "",
    "¿Fila repetida en el Excel?": "",
    "Fecha confirmación": s.fecha_confirmacion ?? "",
    "Tipo": s.tipo_servicio ?? "",
    "Equipo": s.equipo ?? "",
    "Monto": s.monto == null ? "" : Number(s.monto),
    "Moneda": s.moneda ?? "",
    "Series en el texto": series.join(", "),
    "RUC en el Excel": ruc ? `${ruc}${fichasDelRuc.length ? "" : " (ninguna ficha lo tiene)"}` : "",
    "Candidato fuerte": fuerte ? "SÍ" : "",
  };
  for (let i = 0; i < CANDIDATOS_POR_PEDIDO; i++) {
    const m = mejores[i];
    const n = i + 1;
    fila[`#${n} Ficha`] = m ? m.cuenta.razon_social : "";
    fila[`#${n} RUC`] = m ? m.cuenta.num_doc ?? "(sin RUC)" : "";
    fila[`#${n} Comercial`] = m ? m.cuenta.comercial ?? "" : "";
    fila[`#${n} Ventas`] = m ? m.cuenta.ventas : "";
    fila[`#${n} Por qué`] = m ? m.motivos.join("; ") : "";
    fila[`#${n} id`] = m ? m.cuenta.id : "";
  }
  fila["Elegir ficha (RUC)"] = "";
  fila["Nota de Lesly"] = "";
  filasPedidos.push(fila);
}

// ---- El diferencial entre filas del mismo cliente -------------------------
// Una fila por pedido: el mismo cliente sale tantas veces como pedidos tuvo
// (Perú Bar: la lavadora y, aparte, su instalación). Se numera «Pedido 1 de
// 2» para que se vea que son gestiones distintas, y se marca como repetida
// la fila que trae el MISMO equipo, la misma serie y el mismo tipo que otra
// del mismo cliente: esas sí parecen duplicadas en el Excel de origen
// (Hospital de Jaén tiene dos así, sin fecha), y Lesly decide.
{
  const clave = (f) => String(f["Cliente como está en el Excel"] ?? "").toUpperCase().replace(/^\d{8,11}\s*-\s*/, "").replace(/[^A-Z0-9]/g, "");
  const grupos = new Map();
  for (const f of filasPedidos) {
    const k = clave(f);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(f);
  }
  for (const lista of grupos.values()) {
    lista.forEach((f, i) => {
      f["Mismo cliente"] = lista.length > 1 ? `Pedido ${i + 1} de ${lista.length} · distinto pedido, mismo cliente` : "";
      const huella = `${f["Tipo"]}|${String(f["Equipo"]).replace(/\s+/g, " ").trim().toUpperCase()}|${f["Series en el texto"]}`;
      const gemela = lista.find((g, j) => j < i && `${g["Tipo"]}|${String(g["Equipo"]).replace(/\s+/g, " ").trim().toUpperCase()}|${g["Series en el texto"]}` === huella);
      f["¿Fila repetida en el Excel?"] = gemela
        ? `PARECE REPETIDA: mismo equipo y serie que el pedido del ${gemela["Fecha confirmación"] || "(sin fecha)"}${f["Fecha confirmación"] ? "" : " · esta no tiene fecha"}`
        : "";
    });
  }
}

// ---- Fichas partidas ------------------------------------------------------
// Todos los grupos con el mismo nombre normalizado, señalando los que tienen
// pedidos sueltos esperando (esos son los urgentes), más NESSUS a mano.
const grupos = [];
for (const [k, lista] of cuentasPorClave) {
  if (lista.length > 1) grupos.push({ clave: k, fichas: lista, urgente: clavesDeSueltos.has(k), especial: false });
}
const nessus = cuentas.filter((c) => /NESSUS/i.test(c.razon_social));
if (nessus.length > 1) {
  const yaEnGrupo = new Set(grupos.flatMap((g) => g.fichas.map((f) => f.id)));
  grupos.push({
    clave: "NESSUS (variantes que no casan por nombre)",
    fichas: nessus,
    urgente: sueltos.some((s) => /NESSUS/i.test(s.cliente_texto)),
    especial: true,
    nota: nessus.some((f) => yaEnGrupo.has(f.id)) ? "algunas también salen en un grupo por nombre" : "",
  });
}
grupos.sort((a, b) => Number(b.urgente) - Number(a.urgente) || b.fichas.length - a.fichas.length || a.clave.localeCompare(b.clave));

// Con 14 000 fichas hay más de mil grupos con el mismo nombre; nadie va a
// decidir mil fusiones de una sentada. La hoja «Fichas partidas» lleva SOLO
// los grupos que tienen pedidos sueltos esperando (más NESSUS), que son los
// que destraban esta cola; el resto va completo en «Fichas partidas (todas)».
function filasDeGrupos(lista) {
  const filas = [];
  let numeroGrupo = 0;
  for (const g of lista) {
  numeroGrupo++;
  const fichas = [...g.fichas].sort((a, b) => (b.ventas + b.oportunidades + b.cotizaciones_historicas) - (a.ventas + a.oportunidades + a.cotizaciones_historicas));
  for (const f of fichas) {
    filas.push({
      "Grupo": numeroGrupo,
      "Pedidos sueltos esperando": g.urgente ? "SÍ" : "",
      "Caso": g.especial ? `especial: ${g.clave}${g.nota ? ` (${g.nota})` : ""}` : "",
      "id de la ficha": f.id,
      "Razón social exacta": f.razon_social,
      "Doc.": f.tipo_doc ?? "",
      "RUC": f.num_doc ?? "(sin RUC)",
      "Comercial": f.comercial ?? "",
      "Oportunidades": f.oportunidades,
      "Ventas": f.ventas,
      "Cotizaciones históricas": f.cotizaciones_historicas,
      "Equipos instalados": f.equipos,
      "Servicios postventa": f.servicios,
      "Creada": f.created_at ? new Date(f.created_at).toISOString().slice(0, 10) : "",
      "Se queda (marcar X)": "",
      "Nota de Lesly": "",
    });
  }
  }
  return filas;
}
const gruposUrgentes = grupos.filter((g) => g.urgente || g.especial);
const filasPartidas = filasDeGrupos(gruposUrgentes);
const filasPartidasTodas = filasDeGrupos(grupos);

// ---- El archivo -------------------------------------------------------------
const libro = XLSX.utils.book_new();

const hoja1 = XLSX.utils.json_to_sheet(filasPedidos);
hoja1["!cols"] = [
  { wch: 38 }, { wch: 42 }, { wch: 34 }, { wch: 46 }, { wch: 12 }, { wch: 16 }, { wch: 60 }, { wch: 11 }, { wch: 7 }, { wch: 18 }, { wch: 22 }, { wch: 9 },
  ...Array.from({ length: CANDIDATOS_POR_PEDIDO }, () => [{ wch: 42 }, { wch: 13 }, { wch: 9 }, { wch: 7 }, { wch: 44 }, { wch: 38 }]).flat(),
  { wch: 20 }, { wch: 40 },
];
hoja1["!freeze"] = { xSplit: 2, ySplit: 1 };
XLSX.utils.book_append_sheet(libro, hoja1, "Pedidos sin cliente");

const anchosPartidas = [
  { wch: 6 }, { wch: 10 }, { wch: 40 }, { wch: 38 }, { wch: 50 }, { wch: 6 }, { wch: 13 }, { wch: 9 },
  { wch: 13 }, { wch: 7 }, { wch: 12 }, { wch: 10 }, { wch: 11 }, { wch: 11 }, { wch: 12 }, { wch: 40 },
];
const hoja2 = XLSX.utils.json_to_sheet(filasPartidas);
hoja2["!cols"] = anchosPartidas;
hoja2["!freeze"] = { xSplit: 0, ySplit: 1 };
XLSX.utils.book_append_sheet(libro, hoja2, "Fichas partidas");

const hoja2b = XLSX.utils.json_to_sheet(filasPartidasTodas);
hoja2b["!cols"] = anchosPartidas;
hoja2b["!freeze"] = { xSplit: 0, ySplit: 1 };
XLSX.utils.book_append_sheet(libro, hoja2b, "Fichas partidas (todas)");

const hoja3 = XLSX.utils.aoa_to_sheet([
  ["Cómo llenar este archivo"],
  [""],
  ["Hoja «Pedidos sin cliente»: cada fila es un pedido del Excel de postventa que el CRM no supo a qué cliente pertenece."],
  ["  Al lado van hasta tres fichas candidatas (#1, #2, #3), la más parecida primero, y por qué se propone cada una."],
  ["  En «Elegir ficha (RUC)» escribir el RUC de la ficha buena. Si la ficha no tiene RUC, escribir #1, #2 o #3."],
  ["  Si ninguna es, escribir «ninguna» (o dejar en blanco y anotar en «Nota de Lesly» cómo se llama el cliente)."],
  ["  «Candidato fuerte = SÍ» quiere decir que el RUC, la serie del equipo o el nombre exacto ya apuntan a esa ficha."],
  [""],
  ["  «RUC en el Excel» avisa si ese RUC no está en ninguna ficha: ahí probablemente haya que crear el cliente o ponerle el RUC a la ficha que corresponda."],
  [""],
  ["Hoja «Fichas partidas»: grupos de fichas que son el mismo cliente escrito de dos maneras (mismo grupo = mismo número)."],
  ["  Son solo los grupos con pedidos sueltos esperando (y NESSUS). Marcar con X la ficha que se queda; las demás del grupo se fusionan en esa."],
  ["  La hoja «Fichas partidas (todas)» trae los demás grupos con el mismo nombre, para cuando se pueda."],
  [""],
  [`Generado el ${new Date().toLocaleString("es-PE", { timeZone: "America/Lima" })} con scripts/reporte-servicios-sin-cliente.mjs. Se aplica con scripts/aplicar-servicios-sin-cliente.mjs.`],
]);
hoja3["!cols"] = [{ wch: 130 }];
XLSX.utils.book_append_sheet(libro, hoja3, "Instrucciones");

XLSX.writeFile(libro, SALIDA);
await bd.end();

console.log(`\n${SALIDA}`);
console.log(`  Pedidos sueltos: ${sueltos.length}`);
console.log(`    con candidato fuerte (RUC, serie o nombre exacto): ${conCandidatoFuerte}`);
console.log(`    sin ningún candidato: ${sinNingunCandidato}`);
console.log(`  Grupos de fichas partidas: ${gruposUrgentes.length} en la hoja principal (${grupos.filter((g) => g.urgente).length} con pedidos sueltos esperando; NESSUS ${nessus.length > 1 ? `con ${nessus.length} variantes` : "no encontrado"}), ${grupos.length} en total en «Fichas partidas (todas)»`);
