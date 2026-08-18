// B11 pieza 4 (v3, 2026-08-18): importa las 1.560 filas C4_VENTA de las
// hojas COTIZ de cada comercial (scripts/data/ventas-historicas-COTIZ-v2.json,
// generado arrastrando los datos de la fila de cabecera del prospecto a su
// fila de venta) como oportunidades en etapa 'venta' + fila en `ventas`
// cuando el monto es conocido.
//
// POR QUÉ v3: la extracción v1 leía solo la fila de venta y perdía el RUC/DNI
// en el 93 % de los casos (102 de 1.560), así que se crearon 833 cuentas
// nuevas "sin documento" que en realidad ya existían. Con la cabecera:
// 1.506 tienen documento, 1.533 teléfono, 1.275 correo, 1.254 el código PRO
// de Central y 1.560 la PROCEDENCIA declarada por el comercial (PROV_PROSP:
// O_FB, GOOGLE, O_PAGWEB, F_CLIEREF…). Esta corrida:
//   1. resuelve la cuenta por documento (confiable) → teléfono → correo →
//      dedup por razón social dentro de la corrida → cuenta nueva SIN_DOC;
//   2. guarda procedencia y código de Central en la oportunidad
//      (migración 0022) → "De dónde vienen las ventas" tiene historia;
//   3. enlaza la oportunidad a un lead de publicidad del CRM cuando el cruce
//      es INEQUÍVOCO (mismo teléfono, correo, cuenta o código PRO vía
//      Central) y el lead llegó ANTES de la venta → el embudo real de
//      marketing muestra las ventas que sí produjo la publicidad.
//
// Decisiones vigentes de Darwin (2026-08-18): serie EFAMEINSA/OPEN en null
// (no determinable); sin documento se carga igual sin cruzar por nombre
// contra la base. Filas sin monto: oportunidad en 'venta' sin fila en
// `ventas`, con actividad "sin monto".
//
// Uso:
//   node --env-file=.env.local scripts/importar-ventas-historicas.mjs [--central "U:/SEGUIMIENTO DE PROSPECTOS-2026.xls"] [--aplicar]

import { Client } from "pg";
import { existsSync } from "fs";
import XLSX from "xlsx";
import ventas from "./data/ventas-historicas-COTIZ-v2.json" with { type: "json" };

function leerArgumento(nombre, porDefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 ? process.argv[i + 1] : porDefecto;
}
const APLICAR = process.argv.includes("--aplicar");
const CENTRAL = leerArgumento("central", "U:/SEGUIMIENTO DE PROSPECTOS-2026.xls");

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en .env.local");
  process.exit(1);
}

const soloDigitos = (v) => String(v ?? "").replace(/\D/g, "");
const inferirTipoDoc = (d) => (d.length === 11 ? "RUC" : d.length === 8 ? "DNI" : null);
function excelFechaAISO(serial) {
  if (typeof serial !== "number" || serial <= 0) return null;
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function normalizarTelefono(t) {
  if (!t) return null;
  const d = String(t).replace(/\D/g, "");
  return d.length > 9 && d.startsWith("51") ? d.slice(2) : d || null;
}
const normalizarEmail = (e) => { const s = String(e ?? "").trim().toLowerCase(); return s.includes("@") ? s : null; };
const normalizarRazonSocial = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
// 'PRO 11591' / 'PRO726' / 'PR0026' (O confundida con 0) → 'PRO11591' / 'PRO726' / 'PRO26'
function codigoCentral(s) {
  const m = String(s ?? "").toUpperCase().replace(/O/g, "0").match(/PR0*\s*(\d+)/);
  return m ? "PRO" + String(parseInt(m[1], 10)) : null;
}
function parseMonto(raw) {
  if (raw == null) return { monto: null, moneda: null };
  if (typeof raw === "number") return { monto: raw, moneda: "USD" };
  let s = String(raw).trim();
  if (!s || /^\d+-\d+$/.test(s)) return { monto: null, moneda: null };
  let moneda = "USD";
  if (/^S\/\.?\s*/i.test(s)) { moneda = "PEN"; s = s.replace(/^S\/\.?\s*/i, ""); }
  else if (/^(US\$|USD|\$)\s*/i.test(s)) s = s.replace(/^(US\$|USD|\$)\s*/i, "");
  s = s.trim();
  const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lc > -1) s = s.length - lc - 1 === 2 ? s.replace(/,(?=[^,]*$)/, ".").replace(/,/g, "") : s.replace(/,/g, "");
  else if (ld > -1 && (s.match(/\./g) || []).length > 1) s = s.replace(/\.(?=.*\.)/g, "");
  const n = parseFloat(s);
  return !isFinite(n) || n <= 0 ? { monto: null, moneda: null } : { monto: Math.round(n * 100) / 100, moneda };
}

function prepararFila(f) {
  const d = soloDigitos(f.numDoc);
  const tipoDoc = inferirTipoDoc(d);
  const { monto, moneda } = parseMonto(f.monto);
  return {
    ...f,
    numDoc: tipoDoc ? d : null,
    tipoDoc,
    fechaVenta: excelFechaAISO(f.fEstado) ?? excelFechaAISO(f.fAccion),
    monto,
    moneda,
    telNormalizado: normalizarTelefono(f.telCel) ?? normalizarTelefono(f.telFijo),
    emailNormalizado: normalizarEmail(f.email),
    razonNormalizada: normalizarRazonSocial(f.razon),
    procedencia: f.prov ? String(f.prov).trim().toUpperCase() : null,
    codigoCentral: codigoCentral(f.codMkt),
  };
}

// Central: código PRO → teléfono (para enlazar venta → lead vía código).
function cargarCentral() {
  if (!existsSync(CENTRAL)) { console.log(`(sin acceso a ${CENTRAL}: no se cruzará por código PRO)`); return new Map(); }
  const wb = XLSX.readFile(CENTRAL);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Seguimiento"], { header: 1, defval: null });
  const H = rows[0];
  const col = (n) => H.findIndex((h) => typeof h === "string" && h.trim().toUpperCase().startsWith(n));
  const iCod = col("CODIGO"), iTel = col("TELÉFONO");
  const m = new Map();
  for (const r of rows.slice(1)) { const c = codigoCentral(r[iCod]); const t = normalizarTelefono(r[iTel]); if (c && t) m.set(c, t); }
  return m;
}

async function main() {
  const filas = ventas.map(prepararFila);
  const telPorPro = cargarCentral();
  console.log(`Total filas: ${filas.length}`);
  console.log(`  con RUC/DNI: ${filas.filter((f) => f.numDoc).length} · con teléfono: ${filas.filter((f) => f.telNormalizado).length} · con correo: ${filas.filter((f) => f.emailNormalizado).length}`);
  console.log(`  con procedencia: ${filas.filter((f) => f.procedencia).length} · con código Central: ${filas.filter((f) => f.codigoCentral).length} (Central cargado: ${telPorPro.size} códigos)`);
  console.log(`  con monto: ${filas.filter((f) => f.monto).length} · sin monto: ${filas.filter((f) => !f.monto).length} · sin fecha: ${filas.filter((f) => !f.fechaVenta).length}`);

  const cliente = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await cliente.connect();
  try {
    const { rows: comercialesDb } = await cliente.query("select id, codigo_comercial from perfiles where rol = 'comercial'");
    const idPorComercial = new Map(comercialesDb.map((c) => [c.codigo_comercial, c.id]));

    // Leads de publicidad del CRM, indexados para el enlace venta → lead.
    const { rows: leadsDb } = await cliente.query(
      "select id, telefono_normalizado tel, lower(email) email, cuenta_id, recibido_at::date fecha from leads where fuente in ('google_ads','meta_ads')",
    );
    const leadsPorTel = new Map(), leadsPorEmail = new Map(), leadsPorCuenta = new Map();
    const push = (m, k, l) => { if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(l); };
    for (const l of leadsDb) { push(leadsPorTel, l.tel, l); push(leadsPorEmail, l.email, l); push(leadsPorCuenta, l.cuenta_id, l); }

    function leadPara(f, cuentaId) {
      const candidatos = new Map();
      const add = (arr) => { for (const l of arr ?? []) candidatos.set(l.id, l); };
      add(leadsPorTel.get(f.telNormalizado));
      add(leadsPorEmail.get(f.emailNormalizado));
      add(leadsPorCuenta.get(cuentaId));
      if (f.codigoCentral && telPorPro.has(f.codigoCentral)) add(leadsPorTel.get(telPorPro.get(f.codigoCentral)));
      // Solo leads que llegaron antes (o el mismo día) de la venta.
      const validos = [...candidatos.values()].filter((l) => !f.fechaVenta || l.fecha.toISOString().slice(0, 10) <= f.fechaVenta);
      return validos.length === 1 ? validos[0] : null; // ambiguo → no se enlaza
    }

    if (!APLICAR) {
      // Simulación del enlace a leads (sin resolver cuentas nuevas).
      let n = 0;
      for (const f of filas) { const l = leadPara(f, null); if (l) n++; }
      console.log(`\nVentas que se enlazarían a un lead de publicidad (sin contar el cruce por cuenta): ${n}`);
      console.log("\n=== SIMULACIÓN (sin --aplicar, no se escribe nada) ===");
      return;
    }

    console.log("\n=== ESCRIBIENDO EN LA BASE (transacción única) ===");
    await cliente.query("begin");
    const cacheRazon = new Map();
    const st = { cuentasNuevas: 0, porDoc: 0, porTel: 0, porEmail: 0, porNombre: 0, sinDoc: 0, oportunidades: 0, ventas: 0, conLead: 0, saltadas: 0 };

    async function cuentaPorDoc(f, comercialId) {
      const { rows } = await cliente.query(
        `insert into cuentas (tipo_doc, num_doc, razon_social, comercial_id, cartera_desde, notas)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (num_doc) where num_doc is not null and tipo_doc <> 'SIN_DOC' do nothing
         returning id`,
        [f.tipoDoc, f.numDoc, f.razon || "(sin razón social)", comercialId, f.fechaVenta, `[Histórico venta ${f.comercialCarpeta}] ${f.descripcion ?? ""}`.trim()],
      );
      if (rows.length) { st.cuentasNuevas++; await contacto(rows[0].id, f); return rows[0].id; }
      return (await cliente.query("select id from cuentas where num_doc = $1", [f.numDoc])).rows[0].id;
    }
    async function contacto(cuentaId, f) {
      const tel = f.telCel || f.telFijo;
      if (!f.contacto && !tel && !f.email) return;
      await cliente.query("insert into contactos (cuenta_id, nombre, telefono, email, es_principal) values ($1,$2,$3,$4,true)", [cuentaId, f.contacto || f.razon || "(sin nombre)", tel, f.email]);
    }
    async function cuentaNuevaSinDoc(f, comercialId) {
      const { rows } = await cliente.query(
        `insert into cuentas (tipo_doc, num_doc, razon_social, comercial_id, cartera_desde, notas)
         values ('SIN_DOC', null, $1, $2, $3, $4) returning id`,
        [f.razon || "(sin razón social)", comercialId, f.fechaVenta, `[Histórico venta ${f.comercialCarpeta}] Falta RUC/DNI — completar cuando se identifique. ${f.descripcion ?? ""}`.trim()],
      );
      st.cuentasNuevas++; st.sinDoc++;
      await contacto(rows[0].id, f);
      return rows[0].id;
    }
    async function resolverCuenta(f, comercialId) {
      if (f.numDoc) { st.porDoc++; return cuentaPorDoc(f, comercialId); }
      if (f.telNormalizado) {
        const r = await cliente.query("select distinct cuenta_id from contactos where telefono_normalizado = $1", [f.telNormalizado]);
        if (r.rows.length === 1) { st.porTel++; return r.rows[0].cuenta_id; }
      }
      if (f.emailNormalizado) {
        const r = await cliente.query("select distinct cuenta_id from contactos where lower(email) = $1", [f.emailNormalizado]);
        if (r.rows.length === 1) { st.porEmail++; return r.rows[0].cuenta_id; }
      }
      if (cacheRazon.has(f.razonNormalizada)) { st.porNombre++; return cacheRazon.get(f.razonNormalizada); }
      const id = await cuentaNuevaSinDoc(f, comercialId);
      cacheRazon.set(f.razonNormalizada, id);
      return id;
    }

    let i = 0;
    for (const f of filas) {
      if (++i % 250 === 0) console.log(`  ${i}/${filas.length}...`);
      const comercialId = idPorComercial.get(f.comercialCarpeta);
      if (!comercialId) { st.saltadas++; continue; }
      const cuentaId = await resolverCuenta(f, comercialId);
      const lead = leadPara(f, cuentaId);
      const nota = `[Histórico venta ${f.comercialCarpeta}${f.fechaVenta ? ", " + f.fechaVenta : ""}]${f.descripcion ? " " + f.descripcion : ""}${f.monto ? "" : " ⚠ Sin monto registrado en el histórico — completar manualmente."}`;
      const moneda = f.moneda ?? "USD";
      const { rows: op } = await cliente.query(
        `insert into oportunidades (cuenta_id, comercial_id, etapa, monto_estimado, moneda, cerrada_at, created_at, origen, procedencia, codigo_central, lead_id)
         values ($1, $2, 'venta', $3, $4, $5, coalesce($5, now()), 'historico_excel', $6, $7, $8) returning id`,
        [cuentaId, comercialId, f.monto, moneda, f.fechaVenta, f.procedencia, f.codigoCentral, lead?.id ?? null],
      );
      st.oportunidades++;
      if (lead) {
        st.conLead++;
        await cliente.query("update leads set cuenta_id = coalesce(cuenta_id, $2), asignado_a = coalesce(asignado_a, $3) where id = $1", [lead.id, cuentaId, comercialId]);
      }
      await cliente.query("insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at) values ($1, 'nota', $2, $3, coalesce($4, now()))", [op[0].id, nota, comercialId, f.fechaVenta]);
      if (f.monto) {
        await cliente.query(
          `insert into ventas (oportunidad_id, cotizacion_id, serie, fecha_venta, monto_total, moneda, registrada_por, notas, origen)
           values ($1, null, null, coalesce($2, current_date), $3, $4, $5, 'Importado de histórico — sin cotización asociada.', 'historico_excel')`,
          [op[0].id, f.fechaVenta, f.monto, moneda, comercialId],
        );
        st.ventas++;
      }
    }
    console.log("\nResultado:", st);
    await cliente.query("commit");
    console.log("✓ Transacción confirmada.");
  } catch (e) {
    await cliente.query("rollback").catch(() => {});
    console.error("\n✗ Error — rollback, la base queda intacta:", e.message);
    process.exit(1);
  } finally {
    await cliente.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
