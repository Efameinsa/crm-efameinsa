"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { activarNotificaciones, soportaPush } from "@/lib/push-cliente";
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
    if (!soportaPush()) return;
    if (typeof Notification !== "undefined" && Notification.permission === "granted") return;
    if (localStorage.getItem(CLAVE_DESCARTADO)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);
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
    localStorage.setItem(CLAVE_DESCARTADO, "1");
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
