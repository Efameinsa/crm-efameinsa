import Link from "@/components/enlace";
import { FileSpreadsheet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { torresSinSegundaSerie } from "@/lib/torres";
import { BotonImprimir } from "@/components/crm/boton-imprimir";
import { TituloParaImprimir } from "@/components/crm/titulo-para-imprimir";
import { MembreteDocumento } from "@/components/crm/membrete-documento";
import { OtrasActividades } from "@/components/crm/otras-actividades";

/**
 * EL REPORTE DEL ALMACÉN (Lesly, 01-10). Primero lo pidió en PDF; después, el
 * formato: «que tenga por separación lo que ha dado código, lo que está
 * pendiente, pendiente por probar, despachos, que salga su detalle y que tenga
 * la opción para escribir otras actividades».
 *
 * Cinco partes, cada una con su detalle: códigos dados en el rango, códigos
 * pendientes, pendientes por probar, despachos (programados y salidos en el
 * rango) y las otras actividades que escribe quien lo imprime. Sin precios.
 */

type Servicio = {
  id: string;
  cliente_texto: string | null;
  numero_pedido_erp: string | null;
  equipo: string | null;
  series_pedidas_at: string | null;
  prueba_solicitada_at: string | null;
  prueba_lista_at: string | null;
  prueba_embalaje: string | null;
  protocolo_prueba_ref: string | null;
  fecha_despacho: string | null;
  despacho_hora: string | null;
  despachado_at: string | null;
  almacen_listo_at: string | null;
  apertura_despacho_at: string | null;
  guia: string | null;
  transportista: string | null;
  modalidad: string | null;
  direccion_entrega: string | null;
  ubicacion: string | null;
  informe_cierre_id: string | null;
  pedido_ejecutado_at: string | null;
};
type Unidad = { servicio_id: string; orden: number; descripcion: string; serie: string | null; sin_serie: boolean | null; serie_registrada_at: string | null; prueba_lista_at: string | null; parte_de: string | null; parte_nombre: string | null };

const CAMPOS =
  "id, cliente_texto, numero_pedido_erp, equipo, series_pedidas_at, prueba_solicitada_at, prueba_lista_at, prueba_embalaje, protocolo_prueba_ref, fecha_despacho, despacho_hora, despachado_at, almacen_listo_at, apertura_despacho_at, guia, transportista, modalidad, direccion_entrega, ubicacion, informe_cierre_id, pedido_ejecutado_at";

const sinRuc = (s: string | null | undefined) => (s ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, "");
const dmy = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const diaLima = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("es-PE", { timeZone: "America/Lima" }) : "—");
const primera = (t: string | null | undefined) => (t ?? "").split("\n")[0].trim();
const corto = (t: string, n = 110) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const esFecha = (s: string | undefined) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

export async function ReporteAlmacenHoja({ desde: desdeParam, hasta: hastaParam }: { desde?: string; hasta?: string }) {
  const supabase = await createClient();
  const hoy = hoyLima();
  const desde = esFecha(desdeParam) ? desdeParam! : hoy;
  const hasta = esFecha(hastaParam) ? hastaParam! : hoy;
  const ini = `${desde}T00:00:00-05:00`;
  const fin = `${hasta}T23:59:59-05:00`;

  // Lo vivo (para pendientes y programados) y lo que salió en el rango.
  const [{ data: vivos }, { data: salidos }, { data: codigosDados }] = await Promise.all([
    supabase.from("servicios_postventa").select(CAMPOS).eq("completado", false).is("cerrado_at", null).limit(1000),
    supabase.from("servicios_postventa").select(CAMPOS).gte("despachado_at", ini).lte("despachado_at", fin).order("despachado_at").limit(300),
    supabase
      .from("pedido_equipos")
      .select("servicio_id, orden, descripcion, serie, sin_serie, serie_registrada_at, prueba_lista_at, parte_de, parte_nombre")
      .gte("serie_registrada_at", ini)
      .lte("serie_registrada_at", fin)
      .order("serie_registrada_at")
      .limit(500),
  ]);
  const abiertos = (vivos ?? []) as unknown as Servicio[];
  const salieron = (salidos ?? []) as unknown as Servicio[];
  const dados = (codigosDados ?? []) as unknown as Unidad[];

  // Las unidades de los pedidos que hacen falta, para el detalle.
  const porServicio = new Map<string, Unidad[]>();
  const pedidosCon = new Set([...abiertos.filter((s) => s.series_pedidas_at || s.prueba_solicitada_at).map((s) => s.id), ...dados.map((d) => d.servicio_id)]);
  const ids = [...pedidosCon];
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase
      .from("pedido_equipos")
      .select("servicio_id, orden, descripcion, serie, sin_serie, serie_registrada_at, prueba_lista_at, parte_de, parte_nombre")
      .in("servicio_id", ids.slice(i, i + 100))
      .order("orden");
    for (const u of (data ?? []) as unknown as Unidad[]) porServicio.set(u.servicio_id, [...(porServicio.get(u.servicio_id) ?? []), u]);
  }
  // Los que no están vivos (ya cerrados) pero dieron código en el rango: su cliente.
  const conocidos = new Map([...abiertos, ...salieron].map((s) => [s.id, s]));
  const faltan = [...new Set(dados.map((d) => d.servicio_id))].filter((id) => !conocidos.has(id));
  if (faltan.length) {
    const { data } = await supabase.from("servicios_postventa").select(CAMPOS).in("id", faltan.slice(0, 100));
    for (const s of (data ?? []) as unknown as Servicio[]) conocidos.set(s.id, s);
  }

  // 1 · Códigos dados en el rango, agrupados por pedido.
  const dadosPorPedido = new Map<string, Unidad[]>();
  for (const d of dados) dadosPorPedido.set(d.servicio_id, [...(dadosPorPedido.get(d.servicio_id) ?? []), d]);

  // 2 · Pendientes de código: lo que Central pidió y todavía no tiene serie (y la torre sin su segunda).
  const lanzado = (s: Servicio) => !s.informe_cierre_id || Boolean(s.pedido_ejecutado_at);
  const torres = await torresSinSegundaSerie(supabase);
  const pendientesCodigo = abiertos
    .filter((s) => s.series_pedidas_at)
    .map((s) => ({ s, sinSerie: (porServicio.get(s.id) ?? []).filter((u) => !u.serie && !u.sin_serie), torres: torres.get(s.id) ?? 0 }))
    .filter((x) => x.sinSerie.length + x.torres > 0)
    .sort((a, b) => (a.s.series_pedidas_at ?? "").localeCompare(b.s.series_pedidas_at ?? ""));

  // 3 · Pendientes por probar: postventa pidió la prueba y falta el protocolo.
  const probado = (s: Servicio) => s.prueba_lista_at != null || String(s.prueba_embalaje ?? "").toUpperCase() === "SI";
  const porProbar = abiertos
    .filter((s) => lanzado(s) && s.prueba_solicitada_at && !probado(s))
    .sort((a, b) => (a.fecha_despacho ?? "9999").localeCompare(b.fecha_despacho ?? "9999") || (a.prueba_solicitada_at ?? "").localeCompare(b.prueba_solicitada_at ?? ""));

  // 4 · Despachos: programados desde hoy (y atrasados) sin salir, y los que salieron en el rango.
  const programados = abiertos
    .filter((s) => lanzado(s) && s.fecha_despacho && !s.despachado_at)
    .sort((a, b) => (a.fecha_despacho ?? "").localeCompare(b.fecha_despacho ?? "") || (a.despacho_hora ?? "").localeCompare(b.despacho_hora ?? ""));

  const rango = desde === hasta ? `el ${dmy(desde)}` : `del ${dmy(desde)} al ${dmy(hasta)}`;
  const fechaHoy = dmy(hoy);
  const th = "border border-neutral-500 bg-neutral-100 px-1.5 py-0.5 text-left align-bottom";
  const td = "border border-neutral-500 px-1.5 py-1 align-top";
  const vacio = (t: string) => <p className="mt-1 text-[11px] italic">{t}</p>;
  const cliente = (s: Servicio | undefined) => (
    <>
      <b>{sinRuc(s?.cliente_texto)}</b>
      {s?.numero_pedido_erp ? <span className="block text-[9.5px]">Pedido {s.numero_pedido_erp}</span> : null}
    </>
  );
  const unidad = (u: Unidad) => `${u.parte_nombre ? `${u.parte_nombre} · ` : ""}${corto(primera(u.descripcion), 80)}`;

  return (
    <div className="hoja-informe mx-auto max-w-3xl bg-white p-8 text-[12px] leading-snug text-black">
      <div className="no-imprimir mb-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/almacen" className="text-xs text-muted-foreground hover:underline">
            ← Volver a Almacén
          </Link>
          <TituloParaImprimir titulo={`Reporte del almacen ${desde === hasta ? desde : `${desde} al ${hasta}`}`} />
          <span className="flex items-center gap-2">
            <a
              href="/api/postventa/pedidos/reporte?de=almacen"
              download
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-foreground hover:bg-accent"
            >
              <FileSpreadsheet className="size-3.5" aria-hidden /> Pendientes en Excel
            </a>
            <BotonImprimir>Imprimir / guardar PDF</BotonImprimir>
          </span>
        </div>
        <form method="get" className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Códigos dados y despachos salidos</span>
          <label className="flex items-center gap-1">
            desde <input type="date" name="desde" defaultValue={desde} className="h-7 rounded border border-input bg-background px-1.5" />
          </label>
          <label className="flex items-center gap-1">
            hasta <input type="date" name="hasta" defaultValue={hasta} className="h-7 rounded border border-input bg-background px-1.5" />
          </label>
          <button type="submit" className="h-7 rounded border border-border bg-background px-2 font-medium hover:bg-accent">
            Ver
          </button>
          <span className="text-muted-foreground">Los pendientes y lo programado son siempre los de hoy.</span>
        </form>
      </div>

      <MembreteDocumento serie="EFAMEINSA" area="Almacén" generado={fechaHoy} />
      <h1 className="text-center text-base font-bold uppercase">Reporte del almacén</h1>
      <p className="mt-1 text-center text-[11px]">
        Códigos dados y despachos salidos {rango} · pendientes al {fechaHoy}
      </p>

      {/* 1 · CÓDIGOS DADOS */}
      <section className="mt-4">
        <h2 className="text-[13px] font-bold uppercase">
          1. Códigos dados · {dados.length} unidad{dados.length === 1 ? "" : "es"} en {dadosPorPedido.size} pedido{dadosPorPedido.size === 1 ? "" : "s"}
        </h2>
        {dadosPorPedido.size === 0 ? (
          vacio(`No se dieron códigos ${rango}.`)
        ) : (
          <table className="mt-1 w-full border-collapse text-[10.5px]">
            <thead>
              <tr>
                <th className={`${th} w-40`}>Cliente</th>
                <th className={th}>Unidad</th>
                <th className={`${th} w-32`}>Serie o código</th>
                <th className={`${th} w-20`}>Dado el</th>
              </tr>
            </thead>
            <tbody>
              {[...dadosPorPedido.entries()].flatMap(([id, us]) =>
                us.map((u, i) => (
                  <tr key={`${id}-${u.orden}-${i}`}>
                    {i === 0 && (
                      <td className={td} rowSpan={us.length}>
                        {cliente(conocidos.get(id))}
                      </td>
                    )}
                    <td className={td}>{unidad(u)}</td>
                    <td className={`${td} font-mono font-semibold`}>{u.serie ?? "—"}</td>
                    <td className={td}>{diaLima(u.serie_registrada_at)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        )}
      </section>

      {/* 2 · PENDIENTES DE CÓDIGO */}
      <section className="mt-5">
        <h2 className="text-[13px] font-bold uppercase">2. Pendientes de código · {pendientesCodigo.length} pedido{pendientesCodigo.length === 1 ? "" : "s"}</h2>
        {pendientesCodigo.length === 0 ? (
          vacio("Nada pendiente: Central no espera ningún código.")
        ) : (
          <table className="mt-1 w-full border-collapse text-[10.5px]">
            <thead>
              <tr>
                <th className={`${th} w-40`}>Cliente</th>
                <th className={th}>Qué falta codificar</th>
                <th className={`${th} w-20`}>Pedido el</th>
              </tr>
            </thead>
            <tbody>
              {pendientesCodigo.map(({ s, sinSerie, torres: t }) => {
                const cuenta = new Map<string, number>();
                for (const u of sinSerie) cuenta.set(primera(u.descripcion), (cuenta.get(primera(u.descripcion)) ?? 0) + 1);
                return (
                  <tr key={s.id}>
                    <td className={td}>{cliente(s)}</td>
                    <td className={td}>
                      {[...cuenta.entries()].map(([d, n]) => (
                        <span key={d} className="block">
                          {n} × {corto(d, 100)}
                        </span>
                      ))}
                      {t > 0 && <span className="block">{t} × serie de la secadora (torre)</span>}
                    </td>
                    <td className={td}>{diaLima(s.series_pedidas_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* 3 · PENDIENTES POR PROBAR */}
      <section className="mt-5">
        <h2 className="text-[13px] font-bold uppercase">3. Pendientes por probar · {porProbar.length}</h2>
        {porProbar.length === 0 ? (
          vacio("Nada por probar.")
        ) : (
          <table className="mt-1 w-full border-collapse text-[10.5px]">
            <thead>
              <tr>
                <th className={`${th} w-40`}>Cliente</th>
                <th className={th}>Equipos (probados / total)</th>
                <th className={`${th} w-20`}>Pidió la prueba</th>
                <th className={`${th} w-20`}>Despacho</th>
              </tr>
            </thead>
            <tbody>
              {porProbar.map((s) => {
                const us = (porServicio.get(s.id) ?? []).filter((u) => !u.parte_de);
                const listos = us.filter((u) => u.prueba_lista_at).length;
                return (
                  <tr key={s.id}>
                    <td className={td}>{cliente(s)}</td>
                    <td className={td}>
                      {us.length > 0 ? (
                        <>
                          <span className="block font-semibold">
                            {listos} de {us.length} probados
                          </span>
                          {us.map((u, i) => (
                            <span key={i} className="block">
                              {u.prueba_lista_at ? "✓" : "○"} {unidad(u)}
                              {u.serie ? ` · ${u.serie}` : ""}
                            </span>
                          ))}
                        </>
                      ) : (
                        corto(primera(s.equipo), 120)
                      )}
                    </td>
                    <td className={td}>{diaLima(s.prueba_solicitada_at)}</td>
                    <td className={td}>{s.fecha_despacho ? dmy(s.fecha_despacho) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* 4 · DESPACHOS */}
      <section className="mt-5">
        <h2 className="text-[13px] font-bold uppercase">4. Despachos</h2>
        <h3 className="mt-1 text-[12px] font-semibold">Salieron {rango} · {salieron.length}</h3>
        {salieron.length === 0 ? (
          vacio(`No salió ningún despacho ${rango}.`)
        ) : (
          <table className="mt-1 w-full border-collapse text-[10.5px]">
            <thead>
              <tr>
                <th className={`${th} w-40`}>Cliente</th>
                <th className={th}>Equipo</th>
                <th className={`${th} w-32`}>Destino</th>
                <th className={`${th} w-28`}>Guía / transporte</th>
                <th className={`${th} w-20`}>Salió</th>
              </tr>
            </thead>
            <tbody>
              {salieron.map((s) => (
                <tr key={s.id}>
                  <td className={td}>{cliente(s)}</td>
                  <td className={td}>{corto(primera(s.equipo), 100)}</td>
                  <td className={td}>{corto(s.direccion_entrega ?? s.ubicacion ?? (s.modalidad === "provincia" ? "Provincia" : "—"), 70)}</td>
                  <td className={td}>{[s.guia ? `Guía ${s.guia}` : null, s.transportista].filter(Boolean).join(" · ") || "—"}</td>
                  <td className={td}>{diaLima(s.despachado_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3 className="mt-3 text-[12px] font-semibold">Programados, sin salir · {programados.length}</h3>
        {programados.length === 0 ? (
          vacio("No hay despachos programados.")
        ) : (
          <table className="mt-1 w-full border-collapse text-[10.5px]">
            <thead>
              <tr>
                <th className={`${th} w-20`}>Fecha</th>
                <th className={`${th} w-40`}>Cliente</th>
                <th className={th}>Equipo</th>
                <th className={`${th} w-32`}>Cómo está</th>
              </tr>
            </thead>
            <tbody>
              {programados.map((s) => {
                const atrasado = (s.fecha_despacho ?? "") < hoy;
                const como = !s.apertura_despacho_at ? "Sin apertura de postventa" : s.almacen_listo_at ? "Listo en almacén" : "Con apertura · falta confirmar que está listo";
                return (
                  <tr key={s.id}>
                    <td className={td}>
                      {dmy(s.fecha_despacho)}
                      {s.despacho_hora ? <span className="block">{String(s.despacho_hora).slice(0, 5)}</span> : null}
                      {atrasado ? <b className="block">atrasado</b> : null}
                    </td>
                    <td className={td}>{cliente(s)}</td>
                    <td className={td}>{corto(primera(s.equipo), 100)}</td>
                    <td className={td}>{como}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* 5 · OTRAS ACTIVIDADES */}
      <section className="mt-5">
        <h2 className="text-[13px] font-bold uppercase">5. Otras actividades</h2>
        <OtrasActividades clave={`crm:reporte-almacen:${desde}:${hasta}`} />
      </section>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body *:not(:has(.hoja-informe)):not(.hoja-informe):not(.hoja-informe *) { display: none !important; }
          body *:has(.hoja-informe) { min-height: 0 !important; height: auto !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; border: 0 !important; box-shadow: none !important; background: transparent !important; }
          html, body { background: #fff !important; }
          .hoja-informe { max-width: none; padding: 0; margin: 0; }
          .no-imprimir { display: none !important; }
          tr { break-inside: avoid; }
          thead { display: table-header-group; }
          h2, h3 { break-after: avoid; }
        }
      `}</style>
    </div>
  );
}
