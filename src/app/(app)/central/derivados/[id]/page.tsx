import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileDown, Mail, Phone, Siren } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fechaHoraLima } from "@/lib/fechas";
import { firmarAdjuntosDeLeads } from "@/lib/adjuntos-lead";
import {
  cargarDerivado,
  demora,
  haceCuanto,
  ETIQUETA_CANAL,
  ETIQUETA_ETAPA,
  ETIQUETA_MOTIVO,
} from "@/lib/derivados-central";
import { ETIQUETA_ACTIVIDAD } from "@/components/crm/etiquetas-actividad";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { RutaDerivacion, type Hito } from "@/components/crm/ruta-derivacion";
import { LineaTiempoCuenta, type EventoTimeline } from "@/components/crm/linea-tiempo-cuenta";
import { AdjuntosLead } from "@/components/crm/adjuntos-lead";
import { RedirigirLeadBoton } from "@/components/crm/redirigir-lead-boton";
import { cargarSupervisores } from "@/lib/supervisores";
import { UrgenciaBoton } from "@/components/crm/urgencia-boton";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * La ficha de UNA derivación, para Central.
 *
 * POR QUÉ EXISTE (pedido de Central, 27-08): «una vista que al hacerle clic
 * pueda ver el historial de la gestión que hizo» el comercial. Su trabajo
 * sobre lo ya derivado es de supervisión —el cliente vuelve a llamar y
 * pregunta si alguien lo contactó—, y para eso la lista no alcanza: hace falta
 * ver el detalle de cada gestión, con la nota que escribió el comercial y a
 * qué se comprometió.
 *
 * POR QUÉ NO SE ENLAZA A LA OPORTUNIDAD DEL COMERCIAL: /comercial/* exige rol
 * comercial (su layout), así que a Central le daría un portazo. La base sí la
 * deja leer actividades y cotizaciones (políticas 0004 y 0001), que es lo que
 * se muestra acá — en modo lectura, sin las acciones del dueño del caso.
 */

const LIMITE_GESTIONES = 200;

export default async function DerivadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const fila = await cargarDerivado(supabase, id);
  if (!fila) notFound();

  const opId = fila.oportunidad?.id ?? null;

  const [{ data: actividades }, { data: asignacion }, { data: leadCrudo }, { data: comerciales }, supervisores] = await Promise.all([
    opId
      ? supabase
          .from("actividades")
          .select(
            "id, tipo, nota, realizada_at, realizada_por, adjuntos, proxima_accion, proxima_accion_at, proxima_accion_hora, catalogo_resultados_gestion(codigo, nombre)",
          )
          .eq("oportunidad_id", opId)
          .order("realizada_at", { ascending: false })
          .limit(LIMITE_GESTIONES)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("asignaciones")
      .select("motivo, notas, decidida_por, de_comercial, created_at")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("leads").select("id, adjuntos, recibido_por").eq("id", id).maybeSingle(),
    supabase
      .from("perfiles")
      .select("id, nombre, codigo_comercial")
      .eq("rol", "comercial")
      .eq("activo", true)
      .eq("es_prueba", false)
      .order("codigo_comercial"),
    cargarSupervisores(supabase),
  ]);

  // Quién registró el contacto y quién decidió la derivación: son nombres
  // sueltos que no vienen con el lead.
  const idsPerfil = [leadCrudo?.recibido_por, asignacion?.decidida_por].filter(Boolean) as string[];
  const { data: perfilesSueltos } = idsPerfil.length
    ? await supabase.from("perfiles").select("id, nombre").in("id", idsPerfil)
    : { data: [] };
  const nombreDe = new Map((perfilesSueltos ?? []).map((p) => [p.id, p.nombre]));

  const adjuntosLead = leadCrudo
    ? ((await firmarAdjuntosDeLeads(supabase, [leadCrudo])).get(leadCrudo.id) ?? [])
    : [];

  // Las gestiones y las cotizaciones, en una sola cronología. Todos los
  // eventos van con oportunidadId en null a propósito: el enlace «Ver
  // oportunidad» que trae la línea de tiempo apunta a /comercial/*, que a
  // Central le está cerrado.
  const rutasAdjuntos = (actividades ?? []).flatMap((a) =>
    ((a as { adjuntos?: { path: string; nombre: string }[] }).adjuntos ?? []).map((x) => x.path),
  );
  const urlPorRuta = new Map<string, string>();
  if (rutasAdjuntos.length) {
    const { data: firmadas } = await supabase.storage.from("adjuntos").createSignedUrls(rutasAdjuntos, 3600);
    for (const f of firmadas ?? []) if (f.signedUrl && f.path) urlPorRuta.set(f.path, f.signedUrl);
  }

  const eventos: EventoTimeline[] = [
    ...(actividades ?? []).map((a): EventoTimeline => {
      const resultado = a.catalogo_resultados_gestion as unknown as { codigo: string; nombre: string } | null;
      return {
        tipo: "actividad",
        id: a.id,
        fecha: a.realizada_at,
        oportunidadId: null,
        tipoActividad: a.tipo,
        nota: a.nota,
        resultado,
        proximaAccion: a.proxima_accion,
        proximaAccionAt: a.proxima_accion_at,
        proximaAccionHora: a.proxima_accion_hora ? String(a.proxima_accion_hora).slice(0, 5) : null,
        adjuntos: ((a as { adjuntos?: { path: string; nombre: string }[] }).adjuntos ?? [])
          .map((x) => ({ nombre: x.nombre, url: urlPorRuta.get(x.path) ?? "" }))
          .filter((x) => x.url),
      };
    }),
    ...fila.cotizaciones.map((c): EventoTimeline => ({
      tipo: "cotizacion",
      id: c.id,
      fecha: c.created_at,
      oportunidadId: null,
      codigo: c.codigo,
      estadoLabel: c.estado === "enviada" ? "enviada al cliente" : c.estado === "aceptada" ? "aceptada" : "en borrador",
      color: c.estado === "enviada" || c.estado === "aceptada" ? "verde" : "ambar",
      monto: c.total,
      moneda: c.moneda,
      pdfUrl: `/api/cotizaciones/${c.id}/pdf`,
    })),
  ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  const etapa = fila.oportunidad ? ETIQUETA_ETAPA[fila.oportunidad.etapa] : null;
  const com = fila.comercial;
  const contacto = fila.nombreContacto ?? fila.codigo ?? "el contacto";
  const primeraCotizacion = fila.cotizaciones[0] ?? null;
  const cerrada = fila.oportunidad?.etapa === "venta" || fila.oportunidad?.etapa === "rechazada";
  const perdida = fila.oportunidad?.etapa === "rechazada";

  const hitos: Hito[] = [
    {
      titulo: "Llegó a Central",
      fecha: fila.recibidoAt,
      detalle: [
        ETIQUETA_CANAL[fila.canal] ?? fila.canal,
        leadCrudo?.recibido_por ? `registrado por ${nombreDe.get(leadCrudo.recibido_por) ?? "—"}` : "ingreso automático",
      ].join(" · "),
    },
    {
      titulo: "Se derivó al comercial",
      fecha: fila.asignadoAt,
      demora: demora(fila.recibidoAt, fila.asignadoAt),
      detalle: [
        com ? `a ${com.codigo_comercial ? `${com.codigo_comercial} · ` : ""}${com.nombre}` : null,
        asignacion?.decidida_por ? `por ${nombreDe.get(asignacion.decidida_por) ?? "—"}` : null,
        fila.motivo ? (ETIQUETA_MOTIVO[fila.motivo] ?? fila.motivo) : null,
      ]
        .filter(Boolean)
        .join(" · "),
      pendiente: "Sin derivar",
    },
    {
      titulo: "El comercial hizo el primer contacto",
      fecha: fila.primeraGestion?.fecha ?? null,
      demora: demora(fila.asignadoAt, fila.primeraGestion?.fecha ?? null),
      detalle: fila.primeraGestion
        ? (ETIQUETA_ACTIVIDAD[fila.primeraGestion.tipo] ?? fila.primeraGestion.tipo)
        : null,
      pendiente: `Nadie registró una gestión todavía — derivado ${haceCuanto(fila.asignadoAt)}`,
      alerta: fila.alerta === "demora",
    },
    {
      titulo: "Se cotizó",
      fecha: primeraCotizacion?.enviada_at ?? primeraCotizacion?.created_at ?? null,
      demora: demora(fila.primeraGestion?.fecha ?? fila.asignadoAt, primeraCotizacion?.enviada_at ?? primeraCotizacion?.created_at ?? null),
      detalle: primeraCotizacion
        ? `${primeraCotizacion.codigo ?? "Borrador"}${primeraCotizacion.total != null ? ` · ${primeraCotizacion.moneda} ${Number(primeraCotizacion.total).toLocaleString("es-PE")}` : ""}`
        : null,
      pendiente: "Sin cotización todavía",
    },
    {
      titulo: perdida ? "No prosperó" : "Se cerró la venta",
      fecha: cerrada ? (fila.oportunidad?.cerrada_at ?? null) : null,
      demora: cerrada ? demora(fila.asignadoAt, fila.oportunidad?.cerrada_at ?? null) : null,
      detalle: etapa?.texto ?? null,
      pendiente: "En curso",
      fallido: perdida,
    },
  ];

  return (
    <div className="space-y-4">
      <Link
        href="/central/derivados"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Lo que derivé
      </Link>

      {/* ENCABEZADO: quién es y en qué quedó, sin scroll ni entrecerrar los ojos. */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground">{fila.nombreContacto ?? "Sin nombre"}</h1>
            {fila.razonSocial && fila.razonSocial !== fila.nombreContacto && (
              <p className="text-sm text-muted-foreground">{fila.razonSocial}</p>
            )}
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">{fila.codigo}</span>
              {fila.telefono && (
                <a href={`tel:${fila.telefono}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Phone className="size-3" />
                  {fila.telefono}
                </a>
              )}
              {fila.email && (
                <a href={`mailto:${fila.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Mail className="size-3" />
                  {fila.email}
                </a>
              )}
              <span>Llegó por {ETIQUETA_CANAL[fila.canal] ?? fila.canal}</span>
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                etapa?.clase ?? "bg-amber-500/15 text-amber-800",
              )}
            >
              {etapa?.texto ?? "Sin abrir todavía"}
            </span>
            <div className="flex items-center gap-0.5">
              <RedirigirLeadBoton
                leadId={fila.id}
                contacto={contacto}
                comercialActual={fila.asignadoA}
                comerciales={comerciales ?? []}
                supervisores={supervisores}
              />
              {fila.asignadoA && (
                <UrgenciaBoton
                  leadId={fila.id}
                  contacto={contacto}
                  comercial={
                    com ? `${com.codigo_comercial ?? ""}${com.codigo_comercial ? " · " : ""}${com.nombre}` : "el comercial"
                  }
                  totalUrgencias={fila.urgencias?.total ?? 0}
                />
              )}
            </div>
          </div>
        </div>

        {fila.alerta === "demora" && (
          <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
            Derivado {haceCuanto(fila.asignadoAt)} y todavía no hay ninguna gestión registrada.
          </p>
        )}
        {fila.alerta === "frio" && (
          <p className="mt-3 rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-800">
            La última gestión fue {haceCuanto(fila.ultimaGestion?.fecha ?? null)} y el caso sigue abierto.
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* LO QUE PIDIÓ EL CENTRAL: el historial de la gestión del comercial. */}
        <SeccionPanel
          titulo="Historial de la gestión"
          accion={
            <span className="text-xs text-muted-foreground">
              {fila.gestiones} gestión{fila.gestiones === 1 ? "" : "es"}
              {fila.cotizaciones.length > 0 &&
                ` · ${fila.cotizaciones.length} cotización${fila.cotizaciones.length === 1 ? "" : "es"}`}
            </span>
          }
        >
          {eventos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {com?.nombre ?? "El comercial"} no registró ninguna gestión sobre este contacto todavía. Si el cliente
              está esperando, use el botón de urgencia: le suena en pantalla y le llega al celular.
            </p>
          ) : (
            <>
              <p className="mb-4 text-xs text-muted-foreground">
                Registrado por {com?.codigo_comercial ? `${com.codigo_comercial} · ` : ""}
                {com?.nombre ?? "el comercial"}. Es solo lectura: quien mueve el caso es el comercial.
              </p>
              <LineaTiempoCuenta eventos={eventos} />
            </>
          )}
        </SeccionPanel>

        <div className="space-y-4">
          <SeccionPanel titulo="La ruta del contacto">
            <RutaDerivacion hitos={hitos} />
          </SeccionPanel>

          <SeccionPanel titulo="Lo que solicita">
            {fila.mensaje ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{fila.mensaje}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No se registró qué pedía.</p>
            )}
            <AdjuntosLead adjuntos={adjuntosLead} />
            {asignacion?.notas && (
              <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
                <b className="text-foreground">Nota de la derivación: </b>
                {asignacion.notas}
              </p>
            )}
          </SeccionPanel>

          {fila.oportunidad?.proxima_accion && (
            <SeccionPanel titulo="A qué se comprometió">
              <p className="text-sm text-foreground">{fila.oportunidad.proxima_accion}</p>
              {fila.oportunidad.proxima_accion_at && (
                <p className="mt-0.5 text-xs text-muted-foreground">Para el {fila.oportunidad.proxima_accion_at}</p>
              )}
            </SeccionPanel>
          )}

          {fila.cotizaciones.length > 0 && (
            <SeccionPanel titulo="Cotizaciones">
              <ul className="space-y-1.5">
                {fila.cotizaciones.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/api/cotizaciones/${c.id}/pdf`}
                      target="_blank"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <FileDown className="size-4 flex-none" />
                      <span className="font-mono">{c.codigo ?? "Borrador"}</span>
                      {c.total != null && (
                        <span className="text-muted-foreground">
                          {c.moneda} {Number(c.total).toLocaleString("es-PE")}
                        </span>
                      )}
                    </Link>
                    <span className="ml-6 text-xs text-muted-foreground">
                      {c.enviada_at ? `Enviada ${fechaHoraLima(c.enviada_at)}` : "Sin enviar al cliente"}
                    </span>
                  </li>
                ))}
              </ul>
            </SeccionPanel>
          )}

          {fila.urgencias && (
            <SeccionPanel titulo="Urgencias enviadas">
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-destructive">
                <Siren className="size-4" />
                {fila.urgencias.total} aviso{fila.urgencias.total === 1 ? "" : "s"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                El último, {fechaHoraLima(fila.urgencias.ultima)} ({haceCuanto(fila.urgencias.ultima)}).
              </p>
            </SeccionPanel>
          )}
        </div>
      </div>
    </div>
  );
}
