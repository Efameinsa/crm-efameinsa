"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Smartphone } from "lucide-react";
import { desactivarCelular, vincularCelular } from "@/lib/acciones/dispositivos-campo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * «VINCULAR CELULAR» EN TRABAJO DE CAMPO (0367).
 *
 * Ing. Carlos (vía Santos, 01-10-2026): «lo más preciso posible, como Uber o
 * inDrive». La laptop no tiene GPS y el navegador no lee con la pestaña de
 * fondo; el celular con Traccar Client sí. Acá gerencia genera el
 * identificador del celular y tiene a mano los pasos para configurarlo, con
 * los textos listos para copiar y mandarlos por WhatsApp (nadie tipea bien 20
 * letras en un celular).
 */

export const URL_SERVIDOR_OSMAND = "https://crm.efameinsa.com/api/campo/osmand";

export interface CelularVinculado {
  id: string;
  token: string;
  /** «hace 3 min», «todavía no envió nada». */
  ultimoEnvio: string;
}

async function copiar(texto: string, que: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(`${que} copiado.`);
  } catch {
    toast.error("No se pudo copiar: selecciónelo y cópielo a mano.");
  }
}

/** Los pasos tal como se le pasan a la persona. */
export function textoInstrucciones(token: string): string {
  return [
    "Configurar Traccar Client (GPS del celular para el CRM)",
    "",
    "1. Instale «Traccar Client» (de Traccar Ltd) desde Play Store o App Store. Es gratuita.",
    "2. Abra la app y entre a Configuración (Settings):",
    `   · Identificador del dispositivo (Device identifier): ${token}`,
    `   · URL del servidor (Server URL): ${URL_SERVIDOR_OSMAND}`,
    "   · Precisión de ubicación (Location accuracy): la más alta (Highest)",
    "   · Intervalo (Interval): 60",
    "   · Distancia (Distance): 0",
    "   · Latido / Heartbeat (si aparece): 300",
    "   · Almacenamiento sin conexión (Offline buffering): activado",
    "3. Permisos en Android:",
    "   · Ubicación → «Permitir todo el tiempo» y «Usar ubicación precisa» activado.",
    "   · Batería → Traccar Client → «Sin restricciones» (quitar la optimización de batería).",
    "   · Si el celular es Xiaomi, Huawei, Oppo o Samsung: permitir «Inicio automático» y no ponerla a dormir.",
    "   Permisos en iPhone: Ubicación → «Siempre» y «Ubicación exacta» activado.",
    "4. Vuelva a la pantalla principal y active el seguimiento (Continuous tracking / Service status).",
    "5. No cierre la app deslizándola desde las apps recientes: puede quedar en segundo plano.",
  ].join("\n");
}

export function CelularDeCampo({
  userId,
  nombre,
  celular,
}: {
  userId: string;
  nombre: string;
  celular: CelularVinculado | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [confirmarOtro, setConfirmarOtro] = useState(false);
  const [tokenNuevo, setTokenNuevo] = useState<string | null>(null);
  const [enviando, empezar] = useTransition();
  const router = useRouter();
  const token = tokenNuevo ?? celular?.token ?? null;

  function vincular() {
    empezar(async () => {
      const r = await vincularCelular(userId);
      if (r.error || !r.token) {
        toast.error(r.error ?? "No se pudo vincular.");
        return;
      }
      setConfirmarOtro(false);
      setTokenNuevo(r.token);
      setAbierto(true);
      router.refresh();
    });
  }

  function desactivar() {
    if (!celular) return;
    if (!window.confirm(`¿Desactivar el celular de ${nombre}? Deja de anotar posiciones al instante (como mucho en un minuto).`)) return;
    empezar(async () => {
      const r = await desactivarCelular(celular.id);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setTokenNuevo(null);
      toast.success("Celular desactivado.");
      router.refresh();
    });
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <Smartphone className="size-3.5 text-muted-foreground" aria-hidden />
      {celular ? (
        <>
          <span className="text-foreground">
            Celular (GPS) vinculado · último envío: <span className="font-medium">{celular.ultimoEnvio}</span>
          </span>
          <Button size="xs" variant="outline" onClick={() => setAbierto(true)}>
            Ver instrucciones
          </Button>
          <Button size="xs" variant="outline" disabled={enviando} onClick={() => setConfirmarOtro(true)}>
            Vincular otro
          </Button>
          <Button size="xs" variant="ghost" disabled={enviando} onClick={desactivar} className="text-destructive">
            Desactivar
          </Button>
        </>
      ) : (
        <>
          <span className="text-muted-foreground">Sin celular: solo la ubicación del navegador (sin GPS en la laptop).</span>
          <Button size="xs" disabled={enviando} onClick={vincular}>
            Vincular celular
          </Button>
        </>
      )}

      <Dialog open={confirmarOtro} onOpenChange={setConfirmarOtro}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Vincular otro celular?</DialogTitle>
            <DialogDescription>
              Se genera un identificador nuevo y el actual deja de servir: el celular que lo tiene ya no anota posiciones.
              Úselo si {nombre} cambió de celular o si el identificador se compartió con alguien más.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarOtro(false)}>
              Cancelar
            </Button>
            <Button disabled={enviando} onClick={vincular}>
              Generar uno nuevo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={abierto && token != null} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Celular de {nombre}: Traccar Client</DialogTitle>
            <DialogDescription>
              El identificador es la llave: quien lo tenga puede anotar posiciones a nombre de {nombre}. Mándelo solo a
              ella.
            </DialogDescription>
          </DialogHeader>
          {token && (
            <div className="space-y-3 text-sm">
              <Dato etiqueta="Identificador del dispositivo" valor={token} />
              <Dato etiqueta="URL del servidor" valor={URL_SERVIDOR_OSMAND} />
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 text-xs leading-relaxed">
                {textoInstrucciones(token)}
              </pre>
              <p className="text-xs text-muted-foreground">
                Para probar: con el seguimiento activado, en un par de minutos aquí debe decir «último envío: recién» y el
                punto aparece en el mapa marcado «GPS».
              </p>
            </div>
          )}
          <DialogFooter>
            {token && (
              <Button variant="outline" onClick={() => void copiar(textoInstrucciones(token), "Instrucciones")}>
                <Copy /> Copiar instrucciones
              </Button>
            )}
            <Button onClick={() => setAbierto(false)}>Listo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <div className="mt-0.5 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded border border-border bg-muted/40 px-2 py-1 font-mono text-sm">{valor}</code>
        <Button size="icon-sm" variant="outline" aria-label={`Copiar ${etiqueta}`} onClick={() => void copiar(valor, etiqueta)}>
          <Copy />
        </Button>
      </div>
    </div>
  );
}
