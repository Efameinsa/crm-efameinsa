import Link from "@/components/enlace";
import { AlertTriangle, ArrowRight, Ban, Eye, Mail, MailCheck, MousePointerClick } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fechaHoraLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

/**
 * LOS CORREOS DE CAMPAÑA QUE RECIBIÓ ESTE CLIENTE (Santos, 15-10, migración 0496).
 *
 * «Un widget donde se vean las acciones de este tipo, un historial aparte: si abrió el
 * correo y qué correo abrió, con un link». Lo llena mkt.efameinsa.com cada minuto. Cada
 * correo dice a quién se le mandó, si llegó, si lo abrió, en qué botón hizo clic y si se
 * dio de baja o rebotó; «Ver el correo» abre la copia fija de lo que recibió.
 *
 * El clic es la señal que vale: las aperturas son aproximadas (algunos programas de
 * correo las marcan solos). En el resumen va lo último y, si no hay nada, no aparece;
 * la pestaña «Correos» muestra todo y explica cuando está vacía.
 */
export interface EnlaceClic {
  texto: string;
  url: string;
  at: string;
}

export interface CorreoRecibido {
  id: string;
  email: string;
  enviado_at: string | null;
  entregado_at: string | null;
  abierto_at: string | null;
  aperturas: number;
  clic_at: string | null;
  clics: number;
  enlaces: EnlaceClic[];
  baja_at: string | null;
  rebotado_at: string | null;
  rebote_tipo: string | null;
  queja_at: string | null;
  correos_campana: { codigo: string | null; asunto: string; nombre: string } | null;
}

export async function leerCorreosDeCampana(cuentaId: string, limite = 200): Promise<CorreoRecibido[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("correos_campana_recibidos")
    .select("id, email, enviado_at, entregado_at, abierto_at, aperturas, clic_at, clics, enlaces, baja_at, rebotado_at, rebote_tipo, queja_at, correos_campana(codigo, asunto, nombre)")
    .eq("cuenta_id", cuentaId)
    .order("enviado_at", { ascending: false, nullsFirst: false })
    .limit(limite);
  return (data ?? []) as unknown as CorreoRecibido[];
}

/** Lo que pasó con un correo, en chips. */
function Estado({ c }: { c: CorreoRecibido }) {
  const chips: { icono: React.ReactNode; texto: string; tono: string; titulo?: string }[] = [];
  if (c.rebotado_at) chips.push({ icono: <AlertTriangle className="size-3" />, texto: c.rebote_tipo === "blando" ? "No llegó (buzón lleno o caído)" : "Rebotó: el correo no existe", tono: "bg-red-100 text-red-800" });
  else if (c.entregado_at) chips.push({ icono: <MailCheck className="size-3" />, texto: "Llegó", tono: "bg-secondary text-muted-foreground" });
  if (c.abierto_at)
    chips.push({
      icono: <Eye className="size-3" />,
      texto: c.aperturas > 1 ? `Lo abrió ${c.aperturas} veces` : "Lo abrió",
      tono: "bg-sky-100 text-sky-800",
      titulo: `Primera vez: ${fechaHoraLima(c.abierto_at)}. Aproximado: algunos programas de correo lo marcan solos.`,
    });
  if (c.clic_at) chips.push({ icono: <MousePointerClick className="size-3" />, texto: "Hizo clic", tono: "bg-emerald-100 text-emerald-800", titulo: fechaHoraLima(c.clic_at) });
  if (c.baja_at) chips.push({ icono: <Ban className="size-3" />, texto: "Se dio de baja", tono: "bg-amber-100 text-amber-900" });
  if (c.queja_at) chips.push({ icono: <Ban className="size-3" />, texto: "Lo marcó como spam", tono: "bg-red-100 text-red-800" });
  if (!c.abierto_at && !c.clic_at && !c.rebotado_at && !c.baja_at) chips.push({ icono: <Mail className="size-3" />, texto: "Sin abrir", tono: "bg-secondary text-muted-foreground" });
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((x) => (
        <span key={x.texto} title={x.titulo} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", x.tono)}>
          {x.icono}
          {x.texto}
        </span>
      ))}
    </div>
  );
}

function Fila({ c, detalle }: { c: CorreoRecibido; detalle: boolean }) {
  const correo = c.correos_campana;
  return (
    <li className="space-y-1.5 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-medium leading-snug text-foreground">
          {correo?.codigo && <span className="mr-1.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">{correo.codigo}</span>}
          {correo?.asunto ?? "Correo de campaña"}
        </p>
        <Link href={`/correos-campana/${c.id}`} className="shrink-0 text-xs font-semibold text-primary hover:underline">
          Ver el correo
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">
        {fechaHoraLima(c.enviado_at)} · a {c.email}
      </p>
      <Estado c={c} />
      {detalle && c.enlaces.length > 0 && (
        <ul className="space-y-0.5 pl-1 text-xs">
          {c.enlaces.map((e, i) => (
            <li key={i} className="text-muted-foreground">
              <MousePointerClick className="mr-1 inline size-3 text-emerald-700" />
              Clic en <b className="text-foreground">«{e.texto}»</b> → <span className="break-all">{e.url.replace(/^https?:\/\/(www\.)?/, "")}</span> · {fechaHoraLima(e.at)}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Aviso fijo si el cliente pidió no recibir más campañas o su correo no existe. */
function Avisos({ correos }: { correos: CorreoRecibido[] }) {
  const baja = correos.find((c) => c.baja_at || c.queja_at);
  const rebote = correos.find((c) => c.rebotado_at && c.rebote_tipo !== "blando");
  if (!baja && !rebote) return null;
  return (
    <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
      {baja && (
        <p>
          <b>{baja.email}</b> pidió no recibir más campañas ({fechaHoraLima(baja.baja_at ?? baja.queja_at)}). Los avisos de sus pedidos le siguen llegando.
        </p>
      )}
      {rebote && (
        <p>
          <b>{rebote.email}</b> no existe (el correo rebotó). Conviene pedirle al cliente un correo vigente.
        </p>
      )}
    </div>
  );
}

/** El panel del resumen: lo último, y nada si no hay correos. */
export async function CorreosDeCampana({ cuentaId, verTodo }: { cuentaId: string; verTodo?: string }) {
  const correos = await leerCorreosDeCampana(cuentaId, 6);
  if (!correos.length) return null;
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-foreground">
          <Mail className="size-4 text-primary" /> Correos de campaña
        </h2>
        {verTodo && (
          <Link href={verTodo} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            Ver todo <ArrowRight className="size-3" />
          </Link>
        )}
      </div>
      <div className="px-3 pt-2">
        <Avisos correos={correos} />
      </div>
      <ul className="divide-y px-3">
        {correos.slice(0, 5).map((c) => (
          <Fila key={c.id} c={c} detalle={false} />
        ))}
      </ul>
    </div>
  );
}

/** La pestaña: todo, con el detalle de cada clic, y una explicación si está vacía. */
export async function HistorialCorreosDeCampana({ cuentaId }: { cuentaId: string }) {
  const correos = await leerCorreosDeCampana(cuentaId);
  if (!correos.length) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Este cliente todavía no ha recibido correos de campaña.</p>
        <p className="mt-1">
          Cuando se le envíe uno desde el emailing (mkt.efameinsa.com), aquí verá qué correo le llegó, si lo abrió y en qué hizo clic. Si hace clic, a su comercial le llega un aviso
          en la campana.
        </p>
      </div>
    );
  }
  const abiertos = correos.filter((c) => c.abierto_at).length;
  const conClic = correos.filter((c) => c.clic_at).length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-lg border bg-card px-3 py-1.5">
          <b>{correos.length}</b> {correos.length === 1 ? "correo recibido" : "correos recibidos"}
        </span>
        <span className="rounded-lg border bg-card px-3 py-1.5" title="Aproximado: algunos programas de correo marcan como abierto sin que la persona lo lea.">
          <b>{abiertos}</b> abiertos
        </span>
        <span className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-emerald-900">
          <b>{conClic}</b> con clic
        </span>
      </div>
      <Avisos correos={correos} />
      <ul className="divide-y rounded-xl border bg-card px-4">
        {correos.map((c) => (
          <Fila key={c.id} c={c} detalle />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        «Lo abrió» es aproximado: algunos programas de correo lo marcan solos. El clic sí es de la persona (los clics automáticos de los antivirus no se cuentan).
      </p>
    </div>
  );
}
