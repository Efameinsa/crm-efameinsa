// Genera el Excel para que gerencia confirme los RUC que SUNAT propuso pero
// que el sistema NO se atrevió a aplicar solo.
//
// Lo de confianza alta ya se aplicó (un solo contribuyente activo con el
// nombre idéntico, sin ningún aviso). Lo que queda acá es lo dudoso, y es
// dudoso por motivos concretos que van escritos en su columna: varios
// homónimos activos, el nombre no encaja del todo, SUNAT devolvió el tope de
// 30 coincidencias, el RUC es de persona natural, o la razón social del CRM
// trae dos empresas pegadas y el RUC hallado es el de una sola.
//
// La hoja trae los candidatos con su RUC, ubicación y estado, y una columna
// vacía donde Carlos escribe el RUC bueno (o "ninguno"). Es el mismo formato
// que funcionó con `docs/asesores-a-identificar.xlsx`: se manda por WhatsApp y
// vuelve completado.
//
// Uso: node --env-file=.env.local scripts/lista-ruc-a-confirmar.mjs

import XLSX from "xlsx";
import { Client } from "pg";

const SALIDA = "docs/ruc-a-confirmar.xlsx";

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows } = await bd.query(
  `select s.razon_social_crm, s.confianza, s.motivo, s.candidatos,
          s.ruc_sugerido, s.nombre_sunat, s.ubicacion_sunat,
          c.departamento,
          (select count(*) from cotizaciones_historicas ch where ch.cuenta_id = s.cuenta_id)::int cots,
          (select count(*) from ventas v join oportunidades o on o.id = v.oportunidad_id
            where o.cuenta_id = s.cuenta_id)::int ventas,
          p.codigo_comercial
   from sunat_candidatos s
   join cuentas c on c.id = s.cuenta_id
   left join perfiles p on p.id = c.comercial_id
   where s.decision is null and s.confianza in ('media', 'baja', 'ninguna')
   order by (select count(*) from cotizaciones_historicas ch where ch.cuenta_id = s.cuenta_id) desc,
            s.razon_social_crm`,
);

const filas = rows.map((r) => {
  const activos = (r.candidatos ?? []).filter((c) => c.status === "ACTIVO");
  return {
    "Cliente en el CRM": r.razon_social_crm,
    "Comercial": r.codigo_comercial ?? "",
    "Cotizaciones": r.cots,
    "Ventas": r.ventas,
    "Depto.": r.departamento ?? "",
    "RUC que propone el sistema": r.ruc_sugerido ?? "",
    "Nombre en SUNAT": r.nombre_sunat ?? "",
    "Dónde": r.ubicacion_sunat ?? "",
    "Por qué hay que revisarlo": r.motivo,
    "Otros candidatos activos": activos
      .filter((c) => c.ruc !== r.ruc_sugerido)
      .slice(0, 6)
      .map((c) => `${c.ruc} ${c.name}${c.location ? ` (${c.location})` : ""}`)
      .join(" | "),
    "RUC CORRECTO (escribir acá)": "",
  };
});

const libro = XLSX.utils.book_new();
const hoja = XLSX.utils.json_to_sheet(filas);
hoja["!cols"] = [
  { wch: 42 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 12 },
  { wch: 15 }, { wch: 42 }, { wch: 16 }, { wch: 62 }, { wch: 60 }, { wch: 24 },
];
XLSX.utils.book_append_sheet(libro, hoja, "RUC a confirmar");

const instrucciones = [
  { A: "Qué es esto" },
  { A: "Estos clientes están en el CRM sin RUC. Se buscó su nombre en SUNAT y salió más de una" },
  { A: "posibilidad, o el nombre no coincidía del todo. El sistema NO les puso el RUC solo, a" },
  { A: "propósito: un RUC equivocado es peor que ninguno, porque después uniría a dos clientes" },
  { A: "distintos y mezclaría sus historiales de venta." },
  { A: "" },
  { A: "Qué hay que hacer" },
  { A: "En la última columna, escribir el RUC correcto. Si ninguno de los candidatos es el" },
  { A: "cliente, escribir NINGUNO. Si no se sabe, dejar en blanco y lo vemos después." },
  { A: "" },
  { A: "Los que SÍ se resolvieron solos ya están aplicados y no aparecen en esta lista." },
];
const hoja2 = XLSX.utils.json_to_sheet(instrucciones, { skipHeader: true });
hoja2["!cols"] = [{ wch: 95 }];
XLSX.utils.book_append_sheet(libro, hoja2, "Instrucciones");

XLSX.writeFile(libro, SALIDA);
console.log(`${filas.length} clientes para confirmar → ${SALIDA}`);
const porConfianza = rows.reduce((a, r) => ((a[r.confianza] = (a[r.confianza] ?? 0) + 1), a), {});
console.log("Por confianza:", porConfianza);
await bd.end();
