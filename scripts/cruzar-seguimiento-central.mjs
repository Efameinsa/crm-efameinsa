// ============================================================
// CRM EFAMEINSA · Cruzar las derivaciones manuales de Central con el CRM
// ============================================================
// El problema, tal como lo contó el ing. Carlos en la charla del 24-08:
//
//   «Como el sistema ya funciona hace una semana, ella ha bajado de manera
//    manual, les ha entregado y tú lo has gestionado ya. Pero recién hoy día
//    está que te lo reenvía por el sistema. … Si subimos ese CRM, ella misma
//    se va a dar cuenta de que ya lo derivó. Falta subir esa parte.»
//
// Entre el 17 y el 22 de agosto Central derivó 95 contactos A MANO, anotándolos
// en U:\ACTUALIZADO\SEGUIMIENTO DE PROSPECTOS-2026.xls. Los comerciales ya los
// trabajaron. Pero el CRM no se enteró, así que esos mismos contactos siguen en
// la bandeja de triaje — y al derivarlos por el sistema le llegan repetidos al
// comercial, que fue la queja de Brenda («ya las tenía registradas»).
//
// Este script NO escribe: cruza y muestra. La decisión de qué hacer con cada
// grupo se toma leyendo esto.
//
// El cruce es por TELÉFONO NORMALIZADO, que es el único dato que ambos lados
// comparten de forma fiable: en el Excel solo 3 de 95 traen correo y el nombre
// va a veces en "APELLIDOS Y NOMBRE" y a veces en "EMPRESA".
//
// Uso: node --env-file=.env.local scripts/cruzar-seguimiento-central.mjs

import { Client } from "pg";
import XLSX from "xlsx";

const NUEVO = "U:/ACTUALIZADO/SEGUIMIENTO DE PROSPECTOS-2026.xls";
const VIEJO = "U:/SEGUIMIENTO DE PROSPECTOS-2026.xls";

// Índices de la hoja "Seguimiento". La cabecera no cambia desde 2019.
const COL = {
  codigo: 1, via: 2, origen: 3, tipo: 4, area: 5, nombre: 6, empresa: 7,
  correo: 12, telefono: 13, fechaRecepcion: 16, fechaAsignado: 20,
  asignadoA: 22, numComercial: 24,
};

function filasPRO(ruta) {
  const hoja = XLSX.readFile(ruta, { cellDates: true }).Sheets["Seguimiento"];
  return XLSX.utils
    .sheet_to_json(hoja, { header: 1, defval: "" })
    .slice(1)
    .filter((r) => String(r[COL.codigo]).trim().startsWith("PRO"));
}

const fecha = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

const yaEstaban = new Set(filasPRO(VIEJO).map((r) => String(r[COL.codigo]).trim()));
const nuevas = filasPRO(NUEVO).filter((r) => !yaEstaban.has(String(r[COL.codigo]).trim()));

console.log(`Derivaciones manuales que el CRM no tiene: ${nuevas.length}`);
console.log(`Del ${fecha(nuevas[0]?.[COL.fechaRecepcion])} al ${fecha(nuevas.at(-1)?.[COL.fechaRecepcion])}\n`);

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

// normalizar_telefono() es la misma función que usa la columna generada de
// contactos, así que los dos lados quedan comparables sin reimplementar nada.
const grupos = { enBandeja: [], yaAsignado: [], otroEstado: [], sinTelefono: [], sinRastro: [] };

for (const r of nuevas) {
  const telefono = String(r[COL.telefono]).trim();
  const ficha = {
    codigo: String(r[COL.codigo]).trim(),
    quien: (String(r[COL.nombre]).trim() || String(r[COL.empresa]).trim() || "(sin nombre)").trim(),
    telefono,
    area: String(r[COL.area]).trim(),
    comercial: `${String(r[COL.asignadoA]).trim()} (${String(r[COL.numComercial]).trim()})`,
    asignado: fecha(r[COL.fechaAsignado]),
  };

  if (!telefono) {
    grupos.sinTelefono.push(ficha);
    continue;
  }

  const { rows } = await bd.query(
    `select l.id, l.codigo, l.estado, l.nombre_contacto, l.razon_social,
            p.nombre comercial_crm
       from leads l
       left join perfiles p on p.id = l.asignado_a
      where normalizar_telefono(l.telefono) = normalizar_telefono($1)
        and normalizar_telefono($1) is not null
      order by l.recibido_at desc
      limit 3`,
    [telefono],
  );

  if (rows.length === 0) grupos.sinRastro.push(ficha);
  else {
    const l = rows[0];
    ficha.enCrm = `${l.codigo ?? "sin código"} · ${l.estado}${l.comercial_crm ? ` · ${l.comercial_crm}` : ""}`;
    ficha.leadId = l.id;
    if (l.estado === "pendiente_triaje") grupos.enBandeja.push(ficha);
    else if (l.estado === "asignado") grupos.yaAsignado.push(ficha);
    else grupos.otroEstado.push(ficha);
  }
}

const titulo = (t, xs, explica) => {
  console.log(`\n${"─".repeat(74)}\n${t}: ${xs.length}\n${explica}`);
  for (const x of xs.slice(0, 40)) {
    console.log(`  ${x.codigo.padEnd(9)} ${x.quien.slice(0, 34).padEnd(34)} ${x.telefono.padEnd(13)} → ${x.comercial}`);
    if (x.enCrm) console.log(`  ${" ".repeat(9)} en el CRM: ${x.enCrm}`);
  }
  if (xs.length > 40) console.log(`  … y ${xs.length - 40} más`);
};

titulo(
  "EN LA BANDEJA, PERO YA DERIVADOS A MANO",
  grupos.enBandeja,
  "  Son los que le llegan repetidos al comercial. Hay que marcarlos como ya\n  asignados para que salgan de la bandeja de Central.",
);
titulo(
  "YA ASIGNADOS EN EL CRM",
  grupos.yaAsignado,
  "  Alondra ya los volvió a derivar por el sistema. Verificar que le tocaron al\n  mismo comercial que los venía trabajando.",
);
titulo("EN OTRO ESTADO", grupos.otroEstado, "  Descartados o histórico: revisar uno por uno.");
titulo(
  "SIN RASTRO EN EL CRM",
  grupos.sinRastro,
  "  Entraron por un canal que el CRM no recibe. Habría que crearlos ya asignados\n  al comercial que los trabajó, o su gestión de esta semana no cuenta.",
);
titulo("SIN TELÉFONO EN EL EXCEL", grupos.sinTelefono, "  No hay con qué cruzarlos: se revisan a mano.");

console.log(`\n${"─".repeat(74)}`);
console.log("Nada de esto se escribió en la base. Es solo el diagnóstico.");

await bd.end();
