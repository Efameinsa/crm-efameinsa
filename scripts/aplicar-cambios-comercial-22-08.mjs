// Aplica el contraste generado por detectar-cambios-comercial-22-08.mjs
// (scripts/data/cambios-comercial-22-08.json) contra la base real.
//
// MISMA RESOLUCIÓN DE CUENTA que importar-oportunidades-historicas.mjs
// (doc → teléfono → email → nombre único → cuenta nueva) y MISMA REGLA: el
// comercial de la oportunidad es el de la cuenta existente, nunca el del
// Excel — reasignar cartera es decisión manual de gerencia (regla 1,
// docs/03-reglas-negocio.md). Si el Excel de un comercial trae un cliente
// que ya es cartera de otro, se reporta, no se reasigna.
//
// PARA "nuevosClientes": igual que el import histórico — cuenta (si hace
// falta) + oportunidad + una actividad.
//
// PARA "conCambios": la oportunidad histórica de ese cliente (origen
// 'historico_excel', creada la semana pasada) se ACTUALIZA en sus campos de
// estado (etapa/intención/próxima acción/etc.) y se agrega una actividad
// NUEVA con el texto de gestión más reciente — la nota anterior NO se borra
// ni se pisa, queda como historial (se confirmó con una muestra: la
// "DESCRIPCION ESTADO" no es acumulativa en el Excel, cada estado trae su
// propio texto, así que perderíamos la gestión de esta semana si solo
// actualizáramos un campo en vez de sumar una actividad).
//
// Sin --aplicar: solo cruce + preview, no escribe nada.
// Con --aplicar: escribe todo en una sola transacción.
//
// Uso:
//   node --env-file=.env.local scripts/aplicar-cambios-comercial-22-08.mjs [--aplicar]

import { Client } from "pg";
import cambios from "./data/cambios-comercial-22-08.json" with { type: "json" };

const APLICAR = process.argv.includes("--aplicar");

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL. Corran con --env-file=.env.local");
  process.exit(1);
}

const normalizarRazonSocial = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
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
const aMedianoche = (iso) => (iso ? `${iso}T12:00:00-05:00` : null);

async function main() {
  const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await bd.connect();

  try {
    const { rows: comercialesDb } = await bd.query("select id, codigo_comercial, codigo_anterior from perfiles where rol = 'comercial'");
    const idPorCodigo = new Map();
    for (const c of comercialesDb) {
      if (c.codigo_comercial) idPorCodigo.set(c.codigo_comercial, c.id);
      if (c.codigo_anterior) idPorCodigo.set(c.codigo_anterior, c.id);
    }

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
      `select distinct t.telefono_normalizado, c.id, c.comercial_id from contactos t join cuentas c on c.id = t.cuenta_id where t.telefono_normalizado is not null`,
    );
    const telMap = new Map();
    for (const r of telRows) {
      if (!telMap.has(r.telefono_normalizado)) telMap.set(r.telefono_normalizado, []);
      telMap.get(r.telefono_normalizado).push({ id: r.id, comercial_id: r.comercial_id });
    }

    const { rows: emailRows } = await bd.query(
      `select distinct lower(t.email) as email, c.id, c.comercial_id from contactos t join cuentas c on c.id = t.cuenta_id where t.email is not null`,
    );
    const emailMap = new Map();
    for (const r of emailRows) {
      if (!emailMap.has(r.email)) emailMap.set(r.email, []);
      emailMap.get(r.email).push({ id: r.id, comercial_id: r.comercial_id });
    }

    // Oportunidades históricas vigentes — para localizar cuál actualizar en
    // "conCambios". Algunos clientes quedaron con MÁS DE UNA (el import
    // original creó una oportunidad por cada fila-identidad que encontró, y
    // un mismo cliente a veces aparecía dos veces con distinta llave — se
    // verificó con un caso real). Ordenadas por created_at desc: [0] es la
    // más reciente, que es la que se actualiza (decisión del usuario).
    const { rows: opRows } = await bd.query(
      `select id, cuenta_id, comercial_id, etapa, created_at from oportunidades where origen = 'historico_excel' and etapa <> 'venta' order by created_at desc`,
    );
    const opPorCuenta = new Map();
    for (const o of opRows) {
      if (!opPorCuenta.has(o.cuenta_id)) opPorCuenta.set(o.cuenta_id, []);
      opPorCuenta.get(o.cuenta_id).push(o);
    }
    console.log(`  cuentas con doc: ${docMap.size} · nombres: ${nombreMap.size} · teléfonos: ${telMap.size} · emails: ${emailMap.size} · oportunidades histórico activas: ${opRows.length}`);

    const stats = {
      nuevosCreados: 0, cuentasNuevas: 0, nombreAmbiguo: 0,
      cambiosActualizados: 0, cambiosSinPreviaCreados: 0, cambiosMultiplesResueltos: 0,
      carteraDistinta: 0,
    };
    const reporteCarteraDistinta = [];
    const cacheNombreNuevo = new Map();

    async function resolverCuenta(item) {
      if (item.doc) {
        const existente = docMap.get(item.doc);
        if (existente) return existente;
        if (!APLICAR) {
          const simulada = { id: `SIMULADA_DOC_${item.doc}`, comercial_id: item.comercial_id };
          docMap.set(item.doc, simulada);
          stats.cuentasNuevas++;
          return simulada;
        }
        const nueva = await bd.query(
          `insert into cuentas (tipo_doc, num_doc, razon_social, comercial_id, rubro_id, departamento, provincia, distrito, direccion, cartera_desde, notas)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           on conflict (num_doc) where num_doc is not null and tipo_doc <> 'SIN_DOC' do nothing
           returning id, comercial_id`,
          [item.tipoDoc, item.doc, item.razon || "(sin razón social)", item.comercial_id, item.rubroId,
           item.departamento, item.provincia, item.distrito, item.direccion, item.fechaEstado,
           `[Actualización 22-08 ${item.hoja} ${item.comercial}] ${item.nota ?? ""}`.trim()],
        );
        if (nueva.rows.length) {
          stats.cuentasNuevas++;
          docMap.set(item.doc, nueva.rows[0]);
          await crearContacto(nueva.rows[0].id, item);
          return nueva.rows[0];
        }
        const relectura = (await bd.query("select id, comercial_id from cuentas where num_doc = $1", [item.doc])).rows[0];
        docMap.set(item.doc, relectura);
        return relectura;
      }

      if (item.telefono) {
        const candidatas = telMap.get(item.telefono);
        if (candidatas && candidatas.length === 1) return candidatas[0];
      }
      if (item.email) {
        const candidatas = emailMap.get(item.email);
        if (candidatas && candidatas.length === 1) return candidatas[0];
      }

      const razonNorm = normalizarRazonSocial(item.razon);
      const esNombreUtilizable = !esComodin(item.razon) && razonNorm.length >= 12;

      if (esNombreUtilizable && cacheNombreNuevo.has(razonNorm)) return cacheNombreNuevo.get(razonNorm);

      if (esNombreUtilizable) {
        const candidatas = nombreMap.get(razonNorm);
        if (candidatas && candidatas.length === 1) return candidatas[0];
        if (candidatas && candidatas.length > 1) {
          stats.nombreAmbiguo++;
          return null;
        }
      }

      if (!APLICAR) {
        const simulada = { id: `SIMULADA_SIN_DOC_${cacheNombreNuevo.size}_${stats.cuentasNuevas}`, comercial_id: item.comercial_id };
        stats.cuentasNuevas++;
        if (esNombreUtilizable) cacheNombreNuevo.set(razonNorm, simulada);
        return simulada;
      }

      const nueva = await bd.query(
        `insert into cuentas (tipo_doc, num_doc, razon_social, comercial_id, rubro_id, departamento, provincia, distrito, direccion, cartera_desde, notas)
         values ('SIN_DOC', null, $1, $2, $3, $4, $5, $6, $7, $8, $9)
         returning id, comercial_id`,
        [item.razon || "(sin razón social)", item.comercial_id, item.rubroId,
         item.departamento, item.provincia, item.distrito, item.direccion, item.fechaEstado,
         `[Actualización 22-08 ${item.hoja} ${item.comercial}] Falta RUC/DNI. ${item.nota ?? ""}`.trim()],
      );
      stats.cuentasNuevas++;
      await crearContacto(nueva.rows[0].id, item);
      if (esNombreUtilizable) cacheNombreNuevo.set(razonNorm, nueva.rows[0]);
      return nueva.rows[0];
    }

    async function crearContacto(cuentaId, item) {
      if (!APLICAR) return;
      const tel = item.telCel || item.telFijo;
      if (!item.contacto && !tel && !item.email) return;
      await bd.query(
        "insert into contactos (cuenta_id, nombre, cargo, telefono, email, es_principal) values ($1,$2,$3,$4,$5,true)",
        [cuentaId, item.contacto || item.razon || "(sin nombre)", item.cargo, tel, item.email],
      );
    }

    function notaTextoDe(item, prefijo) {
      const notaPrefijo = item.pendienteGerencia ? "[Pendiente de aprobación de gerencia] " : "";
      return `${notaPrefijo}[${prefijo} ${item.hoja}, estado ${item.estadoOriginal ?? "(vacío)"}]${item.nota ? " " + item.nota : ""}` +
        (item.equipoRef ? ` · Equipo: ${item.equipoRef}` : "") +
        (item.montoRef ? ` · Monto ref.: US$ ${item.montoRef}` : "") +
        (item.nroPpto ? ` · Presupuesto ${item.nroPpto}` : "");
    }

    async function crearOportunidad(item, cuenta, comercial_id) {
      if (!APLICAR) return;
      const cerrada = ["rechazada", "derivada"].includes(item.etapa) ? aMedianoche(item.fechaEstado) : null;
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
      await bd.query(
        "insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at) values ($1,$2,$3,$4,coalesce($5,now()))",
        [op[0].id, item.actividadTipo ?? "nota", notaTextoDe(item, "Actualización 22-08"), cuenta.comercial_id ?? comercial_id, aMedianoche(item.fechaEstado)],
      );
    }

    async function actualizarOportunidad(oportunidad, item, cuenta, comercial_id) {
      if (!APLICAR) return;
      const cerrada = ["rechazada", "derivada"].includes(item.etapa) ? aMedianoche(item.fechaEstado) : null;
      await bd.query(
        `update oportunidades set etapa=$1, intencion=$2, monto_estimado=coalesce($3, monto_estimado),
           proxima_accion=$4, proxima_accion_at=$5, cerrada_at=coalesce($6, cerrada_at),
           procedencia=coalesce($7, procedencia), codigo_central=coalesce($8, codigo_central),
           motivo_rechazo_id=coalesce($9, motivo_rechazo_id)
         where id=$10`,
        [item.etapa, item.intencion, item.montoRef, item.proximaAccion, item.proximaAccionAt,
         cerrada, item.procedencia, item.codigoCentral, item.motivoRechazoId, oportunidad.id],
      );
      await bd.query(
        "insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at) values ($1,$2,$3,$4,coalesce($5,now()))",
        [oportunidad.id, item.actividadTipo ?? "nota", notaTextoDe(item, "Actualización 22-08"), cuenta.comercial_id ?? comercial_id, aMedianoche(item.fechaEstado)],
      );
    }

    if (APLICAR) await bd.query("begin");

    // ── 1) Clientes nuevos ────────────────────────────────────────────
    for (const item of cambios.nuevosClientes) {
      const comercial_id = idPorCodigo.get(item.comercial);
      if (!comercial_id) continue;
      const cuenta = await resolverCuenta({ ...item, comercial_id });
      if (!cuenta) continue;
      stats.nuevosCreados++;
      await crearOportunidad(item, cuenta, comercial_id);
    }

    // ── 2) Clientes con cambios ────────────────────────────────────────
    // Decisión confirmada con el usuario: si el cliente tiene más de una
    // oportunidad histórica activa, se actualiza la más reciente (ya viene
    // ordenada por created_at desc) y las demás quedan intactas. Si no tiene
    // ninguna (35 casos: quedaron fuera del import original, probablemente
    // por nombre ambiguo en ese momento), se crea una — igual que un cliente
    // nuevo, porque no hay nada que actualizar.
    for (const c of cambios.conCambios) {
      const item = c.item;
      const comercial_id = idPorCodigo.get(item.comercial);
      if (!comercial_id) continue;
      const cuenta = await resolverCuenta({ ...item, comercial_id });
      if (!cuenta) continue;

      if (cuenta.comercial_id && cuenta.comercial_id !== comercial_id) {
        stats.carteraDistinta++;
        reporteCarteraDistinta.push({ razon: item.razon, excelDe: item.comercial, carteraActualId: cuenta.comercial_id });
        // No se reasigna cartera automáticamente (regla 1). Se sigue de todas
        // formas para no perder la actualización de estado del cliente.
      }

      const esCuentaSimulada = String(cuenta.id).startsWith("SIMULADA");
      const previas = esCuentaSimulada ? [] : (opPorCuenta.get(cuenta.id) ?? []);

      if (previas.length === 0) {
        stats.cambiosSinPreviaCreados++;
        await crearOportunidad(item, cuenta, comercial_id);
        continue;
      }
      if (previas.length > 1) stats.cambiosMultiplesResueltos++;
      stats.cambiosActualizados++;
      await actualizarOportunidad(previas[0], item, cuenta, comercial_id);
    }

    console.log("\nResultado:", stats);
    if (reporteCarteraDistinta.length) {
      console.log(`\n⚠️ ${reporteCarteraDistinta.length} clientes cuyo Excel es de un comercial pero la cartera en el CRM es de otro (NO se reasignó, revisar):`);
      console.table(reporteCarteraDistinta.slice(0, 20));
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
