"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Clock, ImageIcon, Loader2, MessageCircle, Send } from "lucide-react";
import Link from "@/components/enlace";
import { marcarGuiaEnviadaAlCliente, pedirFotosAlAlmacen } from "@/lib/acciones/postventa";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { FotoAlmacen } from "@/lib/postventa";
import { cn } from "@/lib/utils";

type FotoConUrl = FotoAlmacen & { url: string | null };

const cuando = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * LAS FOTOS DEL PEDIDO, CADA UNA CON SU TÍTULO (reunión de gerencia 20-10,
 * Beneficencia de Huancayo):
 *  · Las del protocolo ya están en el protocolo: «si son las mismas, que no se
 *    muestren… ver más fotos y videos del protocolo».
 *  · «Uno, las fotos del despacho en planta, y dos, las fotos de la agencia…
 *    si hay pendiente, que aparezca, y que le dé un clic para apurarlo.»
 */
export function FotosDelDespacho({
  servicioId,
  protocolo,
  planta,
  agencia,
  aplicaAgencia,
  salio,
  pedidasAt,
}: {
  servicioId: string;
  protocolo: FotoConUrl[];
  planta: FotoConUrl[];
  agencia: FotoConUrl[];
  /** Va por agencia (entrega_modo). */
  aplicaAgencia: boolean;
  /** Ya salió del almacén. */
  salio: boolean;
  pedidasAt: string | null;
}) {
  const fotosProt = protocolo.filter((f) => !f.tipo?.startsWith("video")).length;
  const videosProt = protocolo.length - fotosProt;
  const faltaPlanta = salio && planta.length === 0;
  const faltaAgencia = salio && aplicaAgencia && agencia.length === 0;
  const falta = [faltaPlanta ? "fotos de la carga en planta" : null, faltaAgencia ? "foto en la agencia con la guía" : null].filter(Boolean).join(" y ");

  return (
    <div id="fotos-almacen" className="scroll-mt-4 space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-[12px] font-bold uppercase tracking-wide text-foreground">Fotos del pedido</h2>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs">
        <span className="flex items-center gap-1.5">
          <ImageIcon className="size-3.5 text-muted-foreground" />
          <b>Protocolo de pruebas</b>
          <span className="text-muted-foreground">
            {protocolo.length ? ` · ${fotosProt} foto${fotosProt === 1 ? "" : "s"}${videosProt ? ` y ${videosProt} video${videosProt === 1 ? "" : "s"}` : ""}` : " · lo sube el almacén al probar"}
          </span>
        </span>
        <Link href={`/pedidos/${servicioId}/protocolo`} className="font-semibold text-primary hover:underline">
          Ver fotos y videos del protocolo
        </Link>
      </div>

      <Bloque titulo="1. Fotos del despacho en planta" href={`/pedidos/${servicioId}/fotos#planta`} fotos={planta} pendiente={faltaPlanta} noAplica={!salio ? "Se suben cuando sale del almacén." : null} />
      {aplicaAgencia && (
        <Bloque titulo="2. Fotos en la agencia (con la guía)" href={`/pedidos/${servicioId}/fotos#agencia`} fotos={agencia} pendiente={faltaAgencia} noAplica={!salio ? "Se suben cuando el equipo llega a la agencia." : null} />
      )}

      {falta && <PedirAlAlmacen servicioId={servicioId} falta={falta} pedidasAt={pedidasAt} />}
    </div>
  );
}

// Las fotos no se abren en el pedido (20-10, LINO ESPIRITU): un enlace las lleva a /pedidos/[id]/fotos.
function Bloque({ titulo, href, fotos, pendiente, noAplica }: { titulo: string; href: string; fotos: FotoConUrl[]; pendiente: boolean; noAplica: string | null }) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
        {titulo}
        {fotos.length > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#1E7F4F]/10 px-2 py-0.5 text-[10px] font-semibold text-[#1E7F4F]">
            <CheckCircle2 className="size-3" /> subidas
          </span>
        ) : pendiente ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
            <Clock className="size-3" /> pendiente del almacén
          </span>
        ) : null}
      </p>
      {fotos.length > 0 ? (
        <Link href={href} className="text-xs font-semibold text-primary hover:underline">
          Ver fotos ({fotos.length})
        </Link>
      ) : (
        <p className="text-[11px] text-muted-foreground">{noAplica ?? "Todavía no las sube el almacén."}</p>
      )}
    </div>
  );
}

function PedirAlAlmacen({ servicioId, falta, pedidasAt }: { servicioId: string; falta: string; pedidasAt: string | null }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  // La hora se toma una vez al montar (una pantalla se dibuja varias veces).
  const [ahora] = useState(() => Date.now());
  const reciente = pedidasAt ? ahora - Date.parse(pedidasAt) < 4 * 3600 * 1000 : false;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
      <span className="flex-1">Falta: {falta}.{pedidasAt ? ` Se le pidió al almacén el ${cuando(pedidasAt)}.` : ""}</span>
      <Button
        size="sm"
        variant="outline"
        disabled={pendiente || reciente}
        porQue={reciente ? "Ya se le pidió hace menos de 4 horas; si es urgente, llámelo." : undefined}
        onClick={() =>
          empezar(async () => {
            const r = await pedirFotosAlAlmacen(servicioId, falta);
            if (r.error) return void toast.error(r.error, { duration: 8000 });
            toast.success("Listo: el almacén recibió el aviso.");
            router.refresh();
          })
        }
      >
        {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        Pedir al almacén
      </Button>
    </div>
  );
}

/**
 * «ENVIAR GUÍA Y FOTOS AL CLIENTE» CON REGISTRO (gerencia 20-10): postventa
 * le manda la guía y las fotos al cliente por WhatsApp, y hasta hoy nadie
 * sabía si se había mandado. Abre el WhatsApp con el mensaje armado y un clic
 * deja «Enviado al cliente por X · fecha · WhatsApp».
 */
export function EnviarGuiaAlCliente({
  servicioId,
  cliente,
  telefono,
  guia,
  agencia,
  salidaAt,
  enviada,
  codigoCaso = null,
}: {
  /** El código del caso de este pedido (Brenda 20-10: «al cliente le tendremos que decir su código»). */
  codigoCaso?: string | null;
  servicioId: string;
  cliente: string;
  telefono: string | null;
  guia: string | null;
  agencia: string | null;
  salidaAt: string | null;
  enviada: { at: string; por: string | null; via: string | null } | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, empezar] = useTransition();
  const textoInicial = [
    `Buen día, le saluda Efameinsa (postventa).`,
    `Su pedido salió${salidaAt ? ` el ${new Date(salidaAt).toLocaleDateString("es-PE", { timeZone: "America/Lima" })}` : ""}${agencia ? ` por la agencia ${agencia}` : ""}.`,
    guia ? `Guía de remisión: ${guia}.` : null,
    "Le adjuntamos la guía y las fotos del despacho. Cualquier consulta, estamos atentos.",
    codigoCaso ? `Su código de atención es ${codigoCaso}: menciónelo si nos vuelve a escribir y lo ubicamos al toque.` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const [texto, setTexto] = useState(textoInicial);
  const tel = (telefono ?? "").replace(/\D/g, "").slice(-9);

  if (enviada) {
    return (
      <p className="flex items-center gap-1.5 rounded-md border border-[#1E7F4F]/30 bg-[#1E7F4F]/5 px-3 py-2 text-xs text-[#1E7F4F]">
        <CheckCircle2 className="size-3.5" />
        Guía y fotos enviadas al cliente{enviada.por ? ` por ${enviada.por}` : ""} · {cuando(enviada.at)}
        {enviada.via ? ` · ${enviada.via === "whatsapp" ? "WhatsApp" : enviada.via}` : ""}
      </p>
    );
  }

  function marcar(via: "whatsapp" | "correo" | "otro") {
    empezar(async () => {
      const r = await marcarGuiaEnviadaAlCliente(servicioId, via, texto);
      if (r.error) return void toast.error(r.error, { duration: 8000 });
      toast.success("Registrado: ya se sabe que el cliente tiene su guía y sus fotos.");
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <>
      <div id="enviar-guia-cliente" className="flex scroll-mt-24 flex-wrap items-center gap-2 rounded-md border border-amber-400/50 bg-amber-500/5 px-3 py-2 text-xs target:ring-2 target:ring-primary/60">
        <span className="flex-1 text-amber-900">La guía y las fotos del despacho todavía no figuran como enviadas al cliente.</span>
        <Button size="sm" onClick={() => setAbierto(true)}>
          <MessageCircle className="size-3.5" /> Enviar guía y fotos al cliente
        </Button>
      </div>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar guía y fotos al cliente</DialogTitle>
            <DialogDescription>
              {cliente}. Abra el WhatsApp, adjunte la guía y las fotos (están en «Fotos del pedido») y, al terminar, marque que se envió.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Textarea rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {tel.length === 9 ? (
                <a
                  href={`https://wa.me/51${tel}?text=${encodeURIComponent(texto)}`}
                  target="_blank"
                  rel="noreferrer"
                  className={cn("inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent")}
                >
                  <MessageCircle className="size-3.5" /> Abrir WhatsApp ({tel})
                </a>
              ) : (
                <span className="text-[11px] text-muted-foreground">El pedido no tiene un celular de contacto: envíelo desde su WhatsApp y marque abajo.</span>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
              <Button variant="outline" size="sm" disabled={pendiente} onClick={() => marcar("correo")}>
                Lo envié por correo
              </Button>
              <Button size="sm" disabled={pendiente} onClick={() => marcar("whatsapp")}>
                {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                Ya lo envié por WhatsApp
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
