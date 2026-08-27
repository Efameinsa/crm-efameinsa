// Fusión de dos cuentas que resultaron ser la misma empresa. Vive aparte
// porque la usan dos scripts —el de SUNAT y el de nombres repetidos— y es la
// parte delicada: mueve historia y decide de quién es el cliente.
//
// Reglas, todas explícitas:
//   · LA CARTERA se queda con quien tuvo la ACTIVIDAD MÁS RECIENTE, no con
//     quien sobrevive. Si no, un registro viejo le roba el cliente al
//     comercial que lo está trabajando hoy.
//   · NO SE PIERDE NADA: oportunidades, cotizaciones del archivo, contactos,
//     leads, asignaciones e informes se mudan; dirección, rubro y notas se
//     completan desde la que se va cuando a la que queda le faltaban.
//   · Los contactos repetidos (mismo teléfono o mismo nombre) no se duplican.

// ⚠️ NOMBRES COMODÍN. En el Excel de Central, cuando no se sabía el nombre del
// cliente se escribía "SIN NOMBRE", "SIN DATOS", "ND"… Hay 104 cuentas
// llamadas "SIN NOMBRE" y NO son la misma empresa: son 104 clientes distintos
// sin nombre. Agruparlas por nombre y fusionarlas metería doscientos clientes
// sin relación en una sola ficha, y sería irreversible.
export const NOMBRES_COMODIN =
  /^(SIN\s*(NOMBRE|DATOS|RAZON\s*SOCIAL|INFORMACION|ESPECIFICAR)|N\s*[\/.]?\s*D|NO\s+(SE\s+INDICA|HAY\s+DATOS|INDICA|ESPECIFICA)|\(?\s*SIN\s+RAZON\s+SOCIAL\s*\)?|CLIENTE|VARIOS|X+|-+|\.+)$/;

export function esComodin(razonSocial) {
  const limpio = (razonSocial ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 /.()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!limpio) return true;
  if (NOMBRES_COMODIN.test(limpio)) return true;
  // Variantes largas del mismo comodín: "SIN NOMBRE NI DATOS", "SIN RAZON
  // SOCIAL NI DATOS". Si empieza en "SIN" y todo lo que sigue son palabras de
  // relleno, no hay nombre de cliente ahí.
  if (/^SIN\b/.test(limpio)) {
    const resto = limpio.replace(/^SIN\b/, "").trim().split(/[\s/-]+/).filter(Boolean);
    const RELLENO = new Set(["NOMBRE", "DATOS", "RAZON", "SOCIAL", "NI", "Y", "DE", "LA", "EL", "INFORMACION", "ESPECIFICAR", "REGISTRO", "SIN"]);
    if (resto.length && resto.every((p) => RELLENO.has(p))) return true;
  }
  // "SIN NOMBRE - SIN DATOS", "SIN DATOS/SIN NOMBRE": cualquier combinación de
  // comodines separados por barra o guion sigue siendo un comodín.
  const trozos = limpio.split(/\s*[/-]\s*/).filter(Boolean);
  return trozos.length > 1 && trozos.every((t) => NOMBRES_COMODIN.test(t.trim()));
}

export async function ultimaActividad(bd, cuentaId) {
  const { rows } = await bd.query(
    `select greatest(
       coalesce((select max(v.fecha_venta)::timestamptz from ventas v
                 join oportunidades o on o.id = v.oportunidad_id where o.cuenta_id = $1), 'epoch'),
       coalesce((select max(ch.fecha)::timestamptz from cotizaciones_historicas ch where ch.cuenta_id = $1), 'epoch'),
       coalesce((select max(o.updated_at) from oportunidades o where o.cuenta_id = $1), 'epoch')
     ) ultima`,
    [cuentaId],
  );
  return rows[0].ultima;
}

export async function historia(bd, cuentaId) {
  const { rows } = await bd.query(
    `select (select count(*) from oportunidades where cuenta_id = $1)::int ops,
            (select count(*) from cotizaciones_historicas where cuenta_id = $1)::int cots,
            (select count(*) from contactos where cuenta_id = $1)::int contactos,
            (select count(*) from leads where cuenta_id = $1)::int leads,
            (select count(*) from ventas v join oportunidades o on o.id = v.oportunidad_id
              where o.cuenta_id = $1)::int ventas`,
    [cuentaId],
  );
  return rows[0];
}

/**
 * Mueve todo de `origenId` a `destinoId` y borra la de origen.
 * `nombreOficial` (opcional) reemplaza la razón social de la que queda.
 */
export async function fusionar(bd, destinoId, origenId, { carteraId, nombreOficial = null } = {}) {
  await bd.query("update oportunidades set cuenta_id = $1 where cuenta_id = $2", [destinoId, origenId]);
  await bd.query("update cotizaciones_historicas set cuenta_id = $1 where cuenta_id = $2", [destinoId, origenId]);
  await bd.query("update leads set cuenta_id = $1 where cuenta_id = $2", [destinoId, origenId]);
  await bd.query("update asignaciones set cuenta_id = $1 where cuenta_id = $2", [destinoId, origenId]);
  await bd.query("update informes_cierre set cuenta_id = $1 where cuenta_id = $2", [destinoId, origenId]);
  // Las tablas de postventa (migraciones 0075 y 0087). Sin esto, fusionar una
  // cuenta con despachos o informes los dejaría colgando de una ficha borrada
  // —o la clave foránea impediría el borrado a mitad de la fusión—. Hoy la
  // mayoría de las cuentas no tiene ninguna de estas filas; el día que las
  // tenga, el que fusione no se va a acordar de esto.
  await bd.query("update servicios_postventa set cuenta_id = $1 where cuenta_id = $2", [destinoId, origenId]);
  await bd.query("update soporte_tecnico     set cuenta_id = $1 where cuenta_id = $2", [destinoId, origenId]);
  await bd.query("update informes_servicio   set cuenta_id = $1 where cuenta_id = $2", [destinoId, origenId]);
  await bd.query("update equipos_instalados  set cuenta_id = $1 where cuenta_id = $2", [destinoId, origenId]);
  // Si alguna de las dos era madre de un grupo, sus hijas pasan a la que queda.
  await bd.query("update cuentas set cuenta_padre_id = $1 where cuenta_padre_id = $2", [destinoId, origenId]);

  await bd.query(
    `update contactos c set cuenta_id = $1, es_principal = false
     where c.cuenta_id = $2
       and not exists (
         select 1 from contactos d where d.cuenta_id = $1
           and ((d.telefono_normalizado is not null and d.telefono_normalizado <> ''
                 and d.telefono_normalizado = c.telefono_normalizado)
                or upper(d.nombre) = upper(c.nombre)))`,
    [destinoId, origenId],
  );
  await bd.query("delete from contactos where cuenta_id = $1", [origenId]);

  await bd.query(
    `update cuentas q set
       razon_social = coalesce($4, q.razon_social),
       nombre_comercial = coalesce(
         nullif(q.nombre_comercial, ''), nullif(v.nombre_comercial, ''),
         case when $4 is not null and upper($4) <> upper(v.razon_social) then v.razon_social end),
       tipo_doc     = case when q.tipo_doc = 'SIN_DOC' and v.tipo_doc <> 'SIN_DOC' then v.tipo_doc else q.tipo_doc end,
       num_doc      = coalesce(q.num_doc, v.num_doc),
       direccion    = coalesce(q.direccion, v.direccion),
       departamento = coalesce(q.departamento, v.departamento),
       provincia    = coalesce(q.provincia, v.provincia),
       distrito     = coalesce(q.distrito, v.distrito),
       rubro_id     = coalesce(q.rubro_id, v.rubro_id),
       comercial_id = coalesce($3, q.comercial_id),
       notas = case
         when v.notas is null or v.notas = '' then q.notas
         when q.notas is null or q.notas = '' then v.notas
         else q.notas || E'\n\n[de la ficha fusionada] ' || v.notas end,
       ultima_venta_at = nullif(greatest(coalesce(q.ultima_venta_at, 'epoch'), coalesce(v.ultima_venta_at, 'epoch')), 'epoch'),
       cartera_desde = least(coalesce(q.cartera_desde, now()), coalesce(v.cartera_desde, now()))
     from cuentas v
     where q.id = $1 and v.id = $2`,
    [destinoId, origenId, carteraId ?? null, nombreOficial],
  );

  await bd.query("delete from sunat_candidatos where cuenta_id = $1", [origenId]);
  await bd.query("delete from cuentas where id = $1", [origenId]);
}
