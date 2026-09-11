"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Loader2, Unlink } from "lucide-react";
import { vincularCarpetaServidor } from "@/lib/acciones/cuentas";

/**
 * «Vincular» y «Cambiar» de la carpeta del servidor, con respuesta.
 *
 * Ariana, 11-09, en SÁNCHEZ DIESTRA: «le da en vincular y no pasa nada».
 * Eran <form action> con la acción adentro y sin leer lo que devolvía: cuando
 * la base rechazaba el cambio —la ficha era de otra cartera—, no había ni
 * error ni éxito, solo silencio. Un botón que no contesta se toca tres veces
 * y después se reporta como caído el servidor. Acá se dice lo que pasó, en
 * las dos direcciones.
 */
export function VincularCarpetaBoton({
  cuentaId,
  clase,
  ruta,
}: {
  cuentaId: string;
  clase: "informes" | "fotos";
  /** La carpeta a vincular; `null` quita el vínculo actual. */
  ruta: string | null;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const quitar = ruta === null;
  return (
    <button
      type="button"
      disabled={pendiente}
      title={quitar ? "Quitar el vínculo" : `Vincular ${ruta}`}
      onClick={() =>
        iniciar(async () => {
          const r = await vincularCarpetaServidor({ cuentaId, clase, ruta });
          if (r.error) {
            toast.error(r.error, { duration: 8000 });
            return;
          }
          toast.success(quitar ? "Vínculo quitado" : "Carpeta vinculada", {
            description: quitar ? undefined : "Los documentos ya se abren desde esta ficha.",
          });
          router.refresh();
        })
      }
      className={
        quitar
          ? "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
          : "inline-flex items-center gap-1 rounded-md border border-primary/40 px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-60"
      }
    >
      {pendiente ? <Loader2 className="size-3 animate-spin" /> : quitar ? <Unlink className="size-3" /> : <Link2 className="size-3" />}
      {quitar ? "Cambiar" : "Vincular"}
    </button>
  );
}
