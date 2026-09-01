"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { activarNotificaciones, soportaPush } from "@/lib/push-cliente";
import { suscripcionRegistrada } from "@/lib/acciones/notificaciones";
import { Button } from "@/components/ui/button";

const CLAVE_DESCARTADO = "efameinsa_notif_callout_descartado";

export function CalloutActivarNotificaciones() {
  const [visible, setVisible] = useState(false);
  const [activando, setActivando] = useState(false);

  useEffect(() => {
    // localStorage/Notification no existen en el servidor: el estado real
    // solo se puede saber en el cliente, después de montar. Coincide con el
    // render del servidor (oculto) hasta entonces — no hay hidratación
    // desincronizada, solo una decisión que no puede tomarse antes.
    //
    // Dos correcciones del 25-08 (Central llevaba CERO suscripciones y nadie
    // se enteró):
    //  · «Descartar» ya no es para siempre: vuelve a ofrecerse a los 7 días.
    //  · Permiso concedido ≠ suscripción viva. Se verifica la suscripción DE
    //    VERDAD en el service worker; si el permiso está pero la suscripción
    //    no, el aviso vuelve a salir.
    (async () => {
      if (!soportaPush()) return;
      try {
        const descartado = Number(localStorage.getItem(CLAVE_DESCARTADO));
        if (descartado && Date.now() - descartado < 7 * 24 * 3600 * 1000) return;
      } catch {
        /* sin almacenamiento: se ofrece igual */
      }
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          const sub = await reg?.pushManager.getSubscription();
          // Tercera corrección (31-08, caso Post Venta): suscripción viva en
          // el NAVEGADOR no basta — si la base no la conoce (una limpieza le
          // borró la fila), el servidor no tiene a quién mandarle la push y
          // el aviso se escondía justo cuando más falta hacía. Se le pregunta
          // a la base antes de esconderse.
          if (sub && (await suscripcionRegistrada(sub.endpoint))) return;
        } catch {
          return;
        }
      }
      setVisible(true);
    })();
  }, []);

  if (!visible) return null;

  async function activar() {
    setActivando(true);
    const resultado = await activarNotificaciones();
    setActivando(false);
    if (resultado.error) {
      toast.error(resultado.error);
      return;
    }
    toast.success("Notificaciones activadas en este equipo");
    setVisible(false);
  }

  function descartar() {
    // Con fecha: a los 7 días vuelve a ofrecerse (un «1» viejo cuenta como
    // vencido, así los que lo descartaron para siempre lo vuelven a ver).
    localStorage.setItem(CLAVE_DESCARTADO, String(Date.now()));
    setVisible(false);
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
      <span aria-hidden className="text-base">🔔</span>
      <p className="flex-1 text-foreground">
        <strong>Active los avisos en este equipo.</strong>{" "}
        <span className="text-muted-foreground">Reciba asignaciones y aprobaciones aunque la pestaña esté cerrada.</span>
      </p>
      <Button size="sm" onClick={activar} disabled={activando}>
        {activando ? "Activando…" : "Activar notificaciones"}
      </Button>
      <button
        type="button"
        onClick={descartar}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Descartar"
      >
        ✕
      </button>
    </div>
  );
}
