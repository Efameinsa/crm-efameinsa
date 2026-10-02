import { Archive, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { AccionFile, AccionTermine, EntregarFileDirecto, PedirFiles } from "@/components/crm/files-acciones";
import { TiemposDeFiles } from "@/components/crm/files-tiempos";
import { fechaHoraLima } from "@/lib/fechas";
import { haceCuanto, horaLima, lineaDePasos, origenDelFile } from "@/lib/files-recojo";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * FILES — EL CUADERNO DE CARGOS EN EL CRM (0334).
 *
 * Carlos, reunión del 24-09: los archivadores físicos se piden a Central por
 * correo y ella los entrega con su cuaderno de cargos; «cero control», nadie
 * sabe quién tiene qué y se pasan el día buscándolos. Acá queda: quién lo
 * pidió y cuándo, cuándo lo entregó Central, cuándo firmó quien lo recibió y
 * cuándo volvió. Y la pregunta del día: ¿quién tiene cada file?
 *
 * Todos piden y ven lo suyo. Central —y quien supervisa: operaciones,
 * gerencia— lleva el cuaderno: entrega, recibe de vuelta y ve lo prestado.
 * Un file prestado de un día para otro sale en rojo: «máximo al final del
 * día… mañana me lo devuelves».
 *
 * 30-09 (0350), Carlos: «que me lleve una notificación para ir a recoger el
 * file… el botoncito donde dice files, Terminé». Quien tiene el file aprieta
 * «Terminé, pueden recogerlo» y a Central le llega el aviso; en su lista esos
 * van primero, en granate, con cuánto hace que esperan. El historial muestra
 * la hora de cada paso «para que no haya manera de errores».
 */

type Fila = {
  id: string;
  grupo: string;
  solicitado_at: string;
  nota: string | null;
  entregado_at: string | null;
  recibido_at: string | null;
  devuelto_at: string | null;
  anulado_at: string | null;
  termine_at: string | null;
  termine_aviso_at: string | null;
  termine_avisos: number;
  cliente_texto: string | null;
  cliente_doc: string | null;
  empresa: "open" | "efameinsa" | "ambos" | null;
  /** Estante y cajón del inventario (0372); los pedidos anteriores no lo tienen. */
  ubicacion: string | null;
  entrega_directa: boolean;
  pedido_numero: string | null;
  cuentas: { razon_social: string; num_doc: string | null } | null;
  solicitante: { id: string; nombre: string; codigo_comercial: string | null } | null;
  entrego: { nombre: string } | null;
  recibio_vuelta: { nombre: string } | null;
};

const diaLima = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
// De qué empresa es el archivador (0341); los pedidos anteriores no lo decían.
const EMPRESA: Record<NonNullable<Fila["empresa"]>, string> = { open: "OPEN", efameinsa: "EFAMEINSA", ambos: "OPEN y EFAMEINSA" };
const quien = (p: Fila["solicitante"]) => (p ? `${p.codigo_comercial ? `${p.codigo_comercial} · ` : ""}${p.nombre}` : "—");

export default async function FilesPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const llevaElCuaderno = ["central", "gerencia", "admin", "operaciones"].includes(perfil.rol) || Boolean(perfil.es_operaciones);

  const { data } = await supabase
    .from("prestamos_file")
    .select(
      `id, grupo, solicitado_at, nota, entregado_at, recibido_at, devuelto_at, anulado_at, termine_at, termine_aviso_at, termine_avisos, cliente_texto, cliente_doc, empresa, ubicacion, entrega_directa, pedido_numero,
       cuentas(razon_social, num_doc),
       solicitante:perfiles!prestamos_file_solicitado_por_fkey(id, nombre, codigo_comercial),
       entrego:perfiles!prestamos_file_entregado_por_fkey(nombre),
       recibio_vuelta:perfiles!prestamos_file_devuelto_recibido_por_fkey(nombre)`,
    )
    .order("solicitado_at", { ascending: false })
    .limit(400);
  const filas = (data ?? []) as unknown as Fila[];
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  const vivos = filas.filter((f) => !f.anulado_at && !f.devuelto_at);
  const porEntregar = vivos.filter((f) => !f.entregado_at).sort((a, b) => a.solicitado_at.localeCompare(b.solicitado_at));
  // Los que ya avisaron «Terminé» van primero: Central sale a recogerlos (0350).
  const prestados = vivos
    .filter((f) => f.entregado_at)
    .sort((a, b) => (a.termine_at ? 0 : 1) - (b.termine_at ? 0 : 1) || (a.termine_at ?? a.entregado_at!).localeCompare(b.termine_at ?? b.entregado_at!));
  const porRecoger = prestados.filter((f) => f.termine_at).length;
  const mios = filas.filter((f) => f.solicitante?.id === perfil.id);
  const misVivos = mios.filter((f) => !f.anulado_at && !f.devuelto_at);
  const historial = filas.filter((f) => f.anulado_at || f.devuelto_at).slice(0, 60);
  // Pedidos con 2 o más files en su poder que todavía no avisó (0350).
  const porGrupo = new Map<string, Fila[]>();
  for (const f of misVivos) if (f.entregado_at && !f.termine_at) porGrupo.set(f.grupo, [...(porGrupo.get(f.grupo) ?? []), f]);
  const pedidosEnMiPoder = [...porGrupo].map(([grupo, filasDelGrupo]) => ({ grupo, filas: filasDelGrupo })).filter((g) => g.filas.length > 1);

  const ahora = new Date();
  const estado = (f: Fila, mio: boolean) => {
    if (f.anulado_at) return { texto: "Anulado", tono: "bg-muted text-muted-foreground" };
    if (f.devuelto_at) return { texto: `Devuelto ${fechaHoraLima(f.devuelto_at)}`, tono: "bg-[#1E7F4F]/10 text-[#1E7F4F]" };
    // «Terminé» (0350): quien lo tiene ya avisó; Central lo ve como alerta.
    if (f.entregado_at && f.termine_at) {
      if (mio) return { texto: `Avisado a Central ${horaLima(f.termine_aviso_at ?? f.termine_at)} · esperando recojo`, tono: "bg-primary/10 text-primary" };
      const veces = f.termine_avisos > 1 ? ` · recordó ${f.termine_avisos - 1} ${f.termine_avisos === 2 ? "vez" : "veces"}` : "";
      return { texto: `Listo para recoger · ${haceCuanto(f.termine_at, ahora)}${veces}`, tono: "bg-primary text-primary-foreground" };
    }
    if (f.entregado_at) {
      const vencido = diaLima(f.entregado_at) < hoy;
      return { texto: `${vencido ? "Prestado desde" : "Entregado"} ${fechaHoraLima(f.entregado_at)}${f.recibido_at ? "" : " · falta firmar «Recibí»"}`, tono: vencido ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-800" };
    }
    return { texto: `Pedido ${fechaHoraLima(f.solicitado_at)}`, tono: "bg-sky-500/10 text-sky-800" };
  };

  const fila = (f: Fila, acciones: React.ReactNode, conQuien = true, conPasos = false) => {
    const e = estado(f, !conQuien);
    return (
      <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
        <Archive className="size-4 flex-none text-primary" />
        <div className="min-w-[12rem] flex-1">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-semibold text-foreground">
            <span className="max-w-full shrink-0 truncate">{f.cliente_texto ?? f.cuentas?.razon_social ?? "Cliente"}</span>
            {f.empresa && <span className="flex-none rounded border border-primary/30 px-1.5 py-px text-[10px] font-bold tracking-wide text-primary">{EMPRESA[f.empresa]}</span>}
            {f.ubicacion && <span className="flex-none text-[11px] font-medium text-muted-foreground">{f.ubicacion}</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {/* Entrega directa (0365): nadie lo pidió; `solicitante` es quien lo recibió. */}
            {conQuien && <>{f.entrega_directa ? "Entregado directo a" : "Lo pidió"} <b className="font-semibold text-foreground">{quien(f.solicitante)}</b> · </>}
            {(f.cliente_doc ?? f.cuentas?.num_doc) ? `${f.cliente_doc ?? f.cuentas?.num_doc} · ` : ""}
            {f.nota ? `«${f.nota}»` : "sin nota"}
            {f.entrego ? ` · entregó ${f.entrego.nombre}` : ""}
            {f.recibio_vuelta ? ` · recibió de vuelta ${f.recibio_vuelta.nombre}` : ""}
          </p>
          {conPasos ? (
            <p className="text-[11px] tabular-nums text-muted-foreground">{lineaDePasos(f)}</p>
          ) : (
            f.entrega_directa && <p className="text-[11px] font-medium text-primary">{origenDelFile(f)}</p>
          )}
        </div>
        <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums", e.tono)}>{e.texto}</span>
        <div className="flex gap-2">{acciones}</div>
      </li>
    );
  };

  const vencidos = prestados.filter((f) => diaLima(f.entregado_at!) < hoy).length;

  return (
    <div className="space-y-4">
      {/* Central lleva el archivador: no se pide files a sí misma. */}
      {perfil.rol !== "central" && (
        <SeccionPanel titulo="Pedir files a Central">
          <p className="mb-3 text-xs text-muted-foreground">
            Busque en el inventario de files de EFAMEINSA y OPEN INVESTMENTS (al 23-09-2026): cada resultado dice de qué empresa es y en qué estante y cajón está. Agregue uno o varios; Central recibe el aviso, se lo entrega y usted firma con «Recibí el file». Al terminar apriete «Terminé, pueden recogerlo» y Central pasa por él; devuélvalo el mismo día.
          </p>
          <PedirFiles />
        </SeccionPanel>
      )}

      {misVivos.length > 0 && (
        <SeccionPanel titulo={`Mis files · ${misVivos.length}`}>
          {/* Varios files del mismo pedido en su poder: un solo «Terminé» y un solo aviso. */}
          {pedidosEnMiPoder.map((g) => (
            <div key={g.grupo} className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
              <span className="min-w-[12rem] flex-1 text-muted-foreground">
                Pedido del {fechaHoraLima(g.filas[0].solicitado_at)} · <b className="font-semibold text-foreground">{g.filas.length} files</b> en su poder:{" "}
                {g.filas.map((f) => f.cliente_texto ?? f.cuentas?.razon_social ?? "Cliente").join(" · ")}
              </span>
              <AccionTermine id={g.filas[0].id} ultimoAviso={null} cuantos={g.filas.length} />
            </div>
          ))}
          <ul className="divide-y divide-border rounded-lg border border-border">
            {misVivos.map((f) =>
              fila(
                f,
                <>
                  {f.entregado_at && !f.recibido_at && <AccionFile id={f.id} accion="recibi" variante="default" />}
                  {f.entregado_at && <AccionTermine id={f.id} ultimoAviso={f.termine_aviso_at} variante={f.recibido_at ? "default" : "outline"} />}
                  {!f.entregado_at && <AccionFile id={f.id} accion="anular" variante="ghost" />}
                </>,
                false,
              ),
            )}
          </ul>
        </SeccionPanel>
      )}

      {llevaElCuaderno && (
        <>
          {/* Entrega directa (0365, Carlos 01-10): el file sale sin que nadie
              lo pida. Con pedido se hace desde el cierre; acá, sin pedido. */}
          <SeccionPanel titulo="Entregar sin pedido">
            <p className="text-xs text-muted-foreground">
              Cuando lleva el file en la mano sin que se lo hayan pedido. Si es por un pedido recién generado, hágalo desde el cierre («Entregar el file a postventa») para que quede enlazado. Quien lo recibe firma «Recibí el file» y sigue el circuito de siempre.
            </p>
            <EntregarFileDirecto />
          </SeccionPanel>
          <SeccionPanel titulo={`Por entregar · ${porEntregar.length}`}>
            {porEntregar.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">No hay pedidos de files esperando.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {porEntregar.map((f) => fila(f, <><AccionFile id={f.id} accion="entregar" variante="default" /><AccionFile id={f.id} accion="anular" variante="ghost" /></>))}
              </ul>
            )}
          </SeccionPanel>
          <SeccionPanel titulo={`Prestados · ${prestados.length}${porRecoger ? ` · ${porRecoger} para recoger` : ""}${vencidos ? ` · ${vencidos} de días anteriores` : ""}`}>
            {vencidos > 0 && (
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-destructive">
                <AlertTriangle className="size-3.5" /> En rojo: entregados antes de hoy y todavía sin devolver.
              </p>
            )}
            {prestados.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">Todos los files están en el archivador.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {prestados.map((f) => fila(f, <AccionFile id={f.id} accion="devolver" variante={f.termine_at ? "default" : "outline"} />, true, true))}
              </ul>
            )}
          </SeccionPanel>
          {/* 02-10, Santos: medir cuánto tarda cada paso, en horario de oficina. */}
          <SeccionPanel titulo="Tiempos de los files">
            <TiemposDeFiles filas={filas} />
          </SeccionPanel>
        </>
      )}

      {(llevaElCuaderno ? historial : mios.filter((f) => f.anulado_at || f.devuelto_at).slice(0, 30)).length > 0 && (
        <SeccionPanel titulo="Historial">
          <ul className="divide-y divide-border rounded-lg border border-border">
            {(llevaElCuaderno ? historial : mios.filter((f) => f.anulado_at || f.devuelto_at).slice(0, 30)).map((f) => fila(f, null, llevaElCuaderno, true))}
          </ul>
        </SeccionPanel>
      )}
    </div>
  );
}
