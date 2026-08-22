// Bloque A, Fases 2 y 3 (docs/10-plan-ajustes-reunion-21-08.md).
// Lee scripts/data/oportunidades-historicas.json (generado por
// extraer-oportunidades-historicas.mjs) y crea las oportunidades que le
// faltan al CRM. Sin --aplicar: solo el cruce de cuentas, sin escribir nada
// (Fase 2). Con --aplicar: escribe todo en una sola transacción (Fase 3).
//
// MISMO CRITERIO DE RESOLUCIÓN DE CUENTA que
// scripts/importar-ventas-historicas.mjs (documento → teléfono → correo →
// nombre → cuenta nueva), con dos añadidos pensados para esta corrida:
//
//   · EL NOMBRE SOLO SE CRUZA CONTRA CUENTAS EXISTENTES SI NO ES UN COMODÍN
//     Y ES ÚNICO. "SIN NOMBRE"/"SIN DATOS" no identifican a nadie (ver
//     scripts/lib-fusionar-cuentas.mjs); y si el nombre normalizado calza con
//     MÁS DE UNA cuenta, no se adivina cuál es — se reporta para revisión.
//
//   · EL COMERCIAL DE LA OPORTUNIDAD ES EL DE LA CUENTA, NUNCA EL DEL EXCEL.
//     Si la cuenta ya existe, su dueño actual NO se toca: reasignar cartera
//     es decisión manual de gerencia (docs/03-reglas-negocio.md, regla 1),
//     no un efecto de este import. Solo las cuentas NUEVAS quedan con el
//     comercial que dice el Excel.
//
// NO SE ENLAZA A LEADS DE PUBLICIDAD (a diferencia del import de ventas): la
// atribución de marketing para estas 23 mil oportunidades no es necesaria
// para que Carlos pueda ver y filtrar su cartera, y añadirla habría hecho
// esta corrida mucho más lenta y compleja sin servir al objetivo del lunes.
// Queda pendiente si hace falta más adelante.
//
// Uso:
//   node --env-file=.env.local scripts/importar-oportunidades-historicas.mjs [--aplicar] [--forzar]

import { Client } from "pg";
import datos from "./data/oportunidades-historicas.json" with { type: "json" };

const APLICAR = process.argv.includes("--aplicar");
const FORZAR = process.argv.includes("--forzar");

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL. Corran con --env-file=.env.local");
  process.exit(1);
}

const normalizarRazonSocial = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

// Mismo criterio que scripts/lib-fusionar-cuentas.mjs.
const NOMBRES_COMODIN =
  /^(SIN\s*(NOMBRE|DATOS|RAZON\s*SOCIAL|INFORMACION|ESPECIFICAR)|N\s*[/.]?\s*D|NO\s+(SE\s+INDICA|HAY\s+DATOS|INDICA|ESPECIFICA)|\(?\s*SIN\s+RAZON\s+SOCIAL\s*\)?|CLIENTE|VARIOS|X+|-+|\.+)$/;
function esComodin(razonSocial) {
  const limpio = String(razonSocial ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[^A-Z0-9 /.()-]/g, " ").replace(/\s+/g, " ").trim();
  if (!limpio) return true;
  if (NOMBRES_COMODIN.test(limpio)) return true;
  if (/^SIN\b/.test(limpio)) {
    const resto = limpio.replace(/^SIN\b/, "").trim().split(/[\s/-]+/).filter(Boolean);
    const RELLENO = new Set(["NOMBRE", "DATOS", "RAZON", "SOCIAL", "NI", "Y", "DE", "LA", "EL", "INFORMACION", "ESPECIFICAR", "REGISTRO", "SIN"]);
    if (resto.length && resto.every((p) => RELLENO.has(p))) return true;
  }
  const trozos = limpio.split(/\s*[/-]\s*/).filter(Boolean);
  return trozos.length > 1 && trozos.every((t) => NOMBRES_COMODIN.test(t.trim()));
}

// A mediodía para que ordenar/filtrar por fecha no la corra al día anterior
// (lección de src/lib/fechas.ts, ya documentada en este proyecto).
const aMedianoche = (iso) => (iso ? `${iso}T12:00:00-05:00` : null);

async function main() {
  const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await bd.connect();

  try {
    if (!FORZAR) {
      const { rows } = await bd.query(
        "select count(*)::int n from oportunidades where origen = 'historico_excel' and etapa <> 'venta'",
      );
      if (rows[0].n > 0) {
        console.error(
          `\n⚠️ Ya hay ${rows[0].n} oportunidades historico_excel en etapa distinta de 'venta'.\n` +
            `Parece que este import ya se corrió. Si de verdad quieren repetirlo, agreguen --forzar.`,
        );
        process.exit(1);
      }
    }

    const { rows: comercialesDb } = await bd.query(
      "select id, codigo_comercial, codigo_anterior from perfiles where rol = 'comercial'",
    );
    const idPorCodigo = new Map();
    for (const c of comercialesDb) {
      if (c.codigo_comercial) idPorCodigo.set(c.codigo_comercial, c.id);
      if (c.codigo_anterior) idPorCodigo.set(c.codigo_anterior, c.id); // 'C8' -> Brenda (C1)
    }

    // Precarga: 23 mil ítems × hasta 4 consultas cada uno tardaba demasiado
    // (una corrida "solo cruce" se colgó 20+ min). Se lee todo una vez y el
    // cruce corre en memoria; solo quedan awaits reales para los INSERT.
    console.log("Precargando cuentas y contactos...");
    const { rows: cuentasDoc } = await bd.query("select id, num_doc, comercial_id from cuentas where num_doc is not null");
    const docMap = new Map();
    for (const c of cuentasDoc) docMap.set(c.num_doc, { id: c.id, comercial_id: c.comercial_id });

    const { rows: cuentasNombre } = await bd.query(
      `select id, comercial_id, upper(translate(razon_social, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) as razon_norm from cuentas`,
    );
    const nombreMap = new Map();
    for (const c of cuentasNombre) {
      if (!nombreMap.has(c.razon_norm)) nombreMap.set(c.razon_norm, []);
      nombreMap.get(c.razon_norm).push({ id: c.id, comercial_id: c.comercial_id });
    }

    const { rows: telRows } = await bd.query(
      `select distinct t.telefono_normalizado, c.id, c.comercial_id
       from contactos t join cuentas c on c.id = t.cuenta_id
       where t.telefono_normalizado is not null`,
    );
    const telMap = new Map();
    for (const r of telRows) {
      if (!telMap.has(r.telefono_normalizado)) telMap.set(r.telefono_normalizado, []);
      telMap.get(r.telefono_normalizado).push({ id: r.id, comercial_id: r.comercial_id });
    }

    const { rows: emailRows } = await bd.query(
      `select distinct lower(t.email) as email, c.id, c.comercial_id
       from contactos t join cuentas c on c.id = t.cuenta_id
       where t.email is not null`,
    );
    const emailMap = new Map();
    for (const r of emailRows) {
      if (!emailMap.has(r.email)) emailMap.set(r.email, []);
      emailMap.get(r.email).push({ id: r.id, comercial_id: r.comercial_id });
    }
    console.log(`  cuentas con doc: ${docMap.size} · nombres: ${nombreMap.size} · telefonos: ${telMap.size} · emails: ${emailMap.size}`);

    const stats = {
      total: datos.length, sinComercial: 0,
      porDoc: 0, porTelefono: 0, porEmail: 0, porNombreExistente: 0, porNombreEnEsteRun: 0, cuentasNuevas: 0,
      nombreAmbiguo: 0, oportunidadesCreadas: 0, actividadesCreadas: 0,
    };
    const ambiguos = [];
    const cacheNombreNuevo = new Map(); // razonNormalizada -> cuenta_id (para no duplicar dentro de esta misma corrida)

    async function resolverCuenta(item) {
      if (item.doc) {
        const existente = docMap.get(item.doc);
        if (existente) { stats.porDoc++; return existente; }

        if (!APLICAR) {
          // Dry-run: NUNCA escribir. Cuenta simulada, solo para contar y para
          // que un segundo ítem con el mismo doc en esta corrida calce con
          // la misma cuenta simulada (igual que pasaría de verdad).
          const simulada = { id: `SIMULADA_DOC_${item.doc}`, comercial_id: item.comercial_id };
          docMap.set(item.doc, simulada);
          stats.cuentasNuevas++;
          return simulada;
        }

        // Cuenta nueva con documento — igual que importar-ventas-historicas.mjs.
        const nueva = await bd.query(
          `insert into cuentas (tipo_doc, num_doc, razon_social, comercial_id, rubro_id, departamento, provincia, distrito, direccion, cartera_desde, notas)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           on conflict (num_doc) where num_doc is not null and tipo_doc <> 'SIN_DOC' do nothing
           returning id, comercial_id`,
          [item.tipoDoc, item.doc, item.razon || "(sin razón social)", item.comercial_id, item.rubroId,
           item.departamento, item.provincia, item.distrito, item.direccion, item.fechaEstado,
           `[Histórico ${item.hoja} ${item.comercial}] ${item.nota ?? ""}`.trim()],
        );
        if (nueva.rows.length) {
          stats.cuentasNuevas++;
          docMap.set(item.doc, nueva.rows[0]);
          await crearContacto(nueva.rows[0].id, item);
          return nueva.rows[0];
        }
        // Carrera rarísima (otro item con el mismo doc se coló antes): releer.
        const relectura = (await bd.query("select id, comercial_id from cuentas where num_doc = $1", [item.doc])).rows[0];
        docMap.set(item.doc, relectura);
        return relectura;
      }

      if (item.telefono) {
        const candidatas = telMap.get(item.telefono);
        if (candidatas && candidatas.length === 1) { stats.porTelefono++; return candidatas[0]; }
      }
      if (item.email) {
        const candidatas = emailMap.get(item.email);
        if (candidatas && candidatas.length === 1) { stats.porEmail++; return candidatas[0]; }
      }

      const razonNorm = normalizarRazonSocial(item.razon);
      const esNombreUtilizable = !esComodin(item.razon) && razonNorm.length >= 12;

      if (esNombreUtilizable && cacheNombreNuevo.has(razonNorm)) {
        stats.porNombreEnEsteRun++;
        return cacheNombreNuevo.get(razonNorm);
      }

      if (esNombreUtilizable) {
        const candidatas = nombreMap.get(razonNorm);
        if (candidatas && candidatas.length === 1) { stats.porNombreExistente++; return candidatas[0]; }
        if (candidatas && candidatas.length > 1) {
          stats.nombreAmbiguo++;
          ambiguos.push({ razon: item.razon, comercial: item.comercial, cuentasCandidatas: candidatas.length });
          return null; // no se adivina — no se crea oportunidad para este item
        }
      }

      if (!APLICAR) {
        // Dry-run: cuenta SIN_DOC simulada, sin escribir nada.
        const simulada = { id: `SIMULADA_SIN_DOC_${cacheNombreNuevo.size}_${stats.cuentasNuevas}`, comercial_id: item.comercial_id };
        stats.cuentasNuevas++;
        if (esNombreUtilizable) cacheNombreNuevo.set(razonNorm, simulada);
        return simulada;
      }

      // Cuenta nueva SIN_DOC.
      const nueva = await bd.query(
        `insert into cuentas (tipo_doc, num_doc, razon_social, comercial_id, rubro_id, departamento, provincia, distrito, direccion, cartera_desde, notas)
         values ('SIN_DOC', null, $1, $2, $3, $4, $5, $6, $7, $8, $9)
         returning id, comercial_id`,
        [item.razon || "(sin razón social)", item.comercial_id, item.rubroId,
         item.departamento, item.provincia, item.distrito, item.direccion, item.fechaEstado,
         `[Histórico ${item.hoja} ${item.comercial}] Falta RUC/DNI. ${item.nota ?? ""}`.trim()],
      );
      stats.cuentasNuevas++;
      await crearContacto(nueva.rows[0].id, item);
      if (esNombreUtilizable) cacheNombreNuevo.set(razonNorm, nueva.rows[0]);
      return nueva.rows[0];
    }

    async function crearContacto(cuentaId, item) {
      if (!APLICAR) return; // defensa extra: esta función jamás debe escribir en dry-run
      const tel = item.telCel || item.telFijo;
      if (!item.contacto && !tel && !item.email) return;
      await bd.query(
        "insert into contactos (cuenta_id, nombre, cargo, telefono, email, es_principal) values ($1,$2,$3,$4,$5,true)",
        [cuentaId, item.contacto || item.razon || "(sin nombre)", item.cargo, tel, item.email],
      );
    }

    console.log(`Total de ítems a procesar: ${datos.length}`);
    console.log(APLICAR ? "\n=== APLICANDO (transacción única) ===\n" : "\n=== SOLO CRUCE, SIN ESCRIBIR (agregue --aplicar) ===\n");

    if (APLICAR) await bd.query("begin");

    let i = 0;
    for (const itemCrudo of datos) {
      if (++i % 2000 === 0) console.log(`  ${i}/${datos.length}...`);

      const comercial_id = idPorCodigo.get(itemCrudo.comercial);
      if (!comercial_id) { stats.sinComercial++; continue; }
      const item = { ...itemCrudo, comercial_id };

      const cuenta = await resolverCuenta(item);
      if (!cuenta) continue; // ambiguo, ya contado arriba

      if (!APLICAR) { stats.oportunidadesCreadas++; continue; } // en dry-run no se inserta nada más

      const cerrada = ["rechazada", "derivada"].includes(item.etapa) ? aMedianoche(item.fechaEstado) : null;
      const notaPrefijo = item.pendienteGerencia ? "[Pendiente de aprobación de gerencia] " : "";
      const notaTexto = `${notaPrefijo}[Histórico ${item.hoja}, estado ${item.estadoOriginal ?? "(vacío)"}]${item.nota ? " " + item.nota : ""}` +
        (item.equipoRef ? ` · Equipo: ${item.equipoRef}` : "") +
        (item.montoRef ? ` · Monto ref.: US$ ${item.montoRef}` : "") +
        (item.nroPpto ? ` · Presupuesto ${item.nroPpto}` : "");

      const { rows: op } = await bd.query(
        `insert into oportunidades
           (cuenta_id, comercial_id, etapa, intencion, monto_estimado, moneda, proxima_accion, proxima_accion_at,
            cerrada_at, created_at, origen, procedencia, codigo_central, motivo_rechazo_id)
         values ($1,$2,$3,$4,$5,'USD',$6,$7,$8,coalesce($9,now()),'historico_excel',$10,$11,$12)
         returning id`,
        [cuenta.id, cuenta.comercial_id ?? comercial_id, item.etapa, item.intencion, item.montoRef,
         item.proximaAccion, item.proximaAccionAt, cerrada, aMedianoche(item.fechaEstado),
         item.procedencia, item.codigoCentral, item.motivoRechazoId],
      );
      stats.oportunidadesCreadas++;

      await bd.query(
        "insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at) values ($1,$2,$3,$4,coalesce($5,now()))",
        [op[0].id, item.actividadTipo ?? "nota", notaTexto, cuenta.comercial_id ?? comercial_id, aMedianoche(item.fechaEstado)],
      );
      stats.actividadesCreadas++;
    }

    console.log("\nResultado:", stats);
    if (ambiguos.length) {
      console.log(`\n⚠️ ${ambiguos.length} nombres ambiguos (calzan con más de una cuenta) — NO se crearon, revisar a mano:`);
      console.table(ambiguos.slice(0, 20));
    }

    if (APLICAR) {
      await bd.query("commit");
      console.log("\n✓ Transacción confirmada.");
    } else {
      console.log("\n(Dry-run: nada se escribió. Revisar los números arriba antes de correr con --aplicar.)");
    }
  } catch (e) {
    if (APLICAR) await bd.query("rollback").catch(() => {});
    console.error("\n✗ Error" + (APLICAR ? " — rollback, la base queda intacta" : "") + ":", e.message);
    process.exitCode = 1;
  } finally {
    await bd.end();
  }
}

main();
