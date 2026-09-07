"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Plus } from "lucide-react";
import { buscarClientes } from "@/lib/acciones/casos";
import { registrarEquipo } from "@/lib/acciones/equipos";
import { ficharEquipoDeLaAtencion } from "@/lib/acciones/atenciones";
import { cn } from "@/lib/utils";

/**
 * Fichar una máquina en el parque instalado (0181).
 *
 * El mismo formulario sirve en los dos lugares donde hacía falta y no existía:
 *
 *  · DENTRO DE UNA ATENCIÓN, cuando el cliente no tiene ninguna máquina y el
 *    panel de las series sale vacío. Ahí el cliente ya se sabe, así que no se
 *    pregunta: se ficha la máquina y queda vinculada con la garantía
 *    verificada, que es lo que hacía el clic del panel.
 *
 *  · EN EL PARQUE INSTALADO, para dar de alta a mano lo que ya está en la
 *    calle: las ventas viejas, y las máquinas que aparezcan cuando lleguen las
 *    guías de remisión.
 *
 * LA SERIE ES OPCIONAL, y está dicho en la pantalla. Se pide siempre —es la
 * identidad de la máquina— pero la foto de la placa llega cuando llega, y la
 * atención no puede esperar a eso. Sin serie la máquina queda fichada igual,
 * lista para completarla después.
 */
export function FicharMaquina({
  atencionId,
  cuenta,
  alTerminar,
}: {
  /** Si viene de una atención, la máquina queda vinculada a ella. */
  atencionId?: string;
  /** Cliente ya conocido. Si no viene, se pregunta acá. */
  cuenta?: { id: string; razonSocial: string } | null;
  alTerminar?: () => void;
}) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();

  const [elegida, setElegida] = useState(cuenta ?? null);
  const [texto, setTexto] = useState("");
  const [candidatas, setCandidatas] = useState<{ id: string; razonSocial: string; documento: string | null }[]>([]);

  const [serie, setSerie] = useState("");
  const [modelo, setModelo] = useState("");
  const [fecha, setFecha] = useState("");
  const [meses, setMeses] = useState("24");
  const [ubicacion, setUbicacion] = useState("");

  function mirarClientes() {
    if (texto.trim().length < 3) {
      toast.info("Escriba al menos tres letras del nombre o del RUC");
      return;
    }
    empezar(async () => {
      const r = await buscarClientes(texto);
      setCandidatas(r);
      if (r.length === 0) toast.info("Ningún cliente casa con eso");
    });
  }

  function guardar() {
    empezar(async () => {
      const comun = {
        serie: serie.trim() || null,
        modelo,
        fechaCompra: fecha || null,
        garantiaMeses: Number(meses) || 24,
        ubicacion: ubicacion.trim() || null,
      };
      const r = atencionId
        ? await ficharEquipoDeLaAtencion({ atencionId, ...comun })
        : await registrarEquipo({ cuentaId: elegida?.id ?? "", ...comun });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(
        atencionId
          ? `Máquina fichada${serie.trim() ? ` (${serie.trim()})` : ""} — garantía verificada`
          : "Máquina registrada en el parque instalado",
      );
      setSerie(""); setModelo(""); setFecha(""); setUbicacion("");
      alTerminar?.();
      router.refresh();
    });
  }

  const listo = modelo.trim().length >= 3 && (atencionId || elegida);

  return (
    <div className="space-y-3">
      {/* De quién es: solo cuando no se sabe todavía. */}
      {!atencionId && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground">¿De qué cliente es?</p>
          {elegida ? (
            <p className="text-xs font-semibold text-foreground">
              {elegida.razonSocial}{" "}
              <button
                type="button"
                onClick={() => setElegida(null)}
                className="cursor-pointer font-normal text-primary underline"
              >
                cambiar
              </button>
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex flex-1 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
                  <Search className="size-3.5 flex-none text-muted-foreground" />
                  <input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), mirarClientes())}
                    placeholder="Razón social o RUC"
                    className="w-full min-w-[160px] bg-transparent text-sm outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={mirarClientes}
                  disabled={pendiente}
                  className="cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
                >
                  Buscar
                </button>
              </div>
              {candidatas.length > 0 && (
                <div className="space-y-1">
                  {candidatas.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setElegida({ id: c.id, razonSocial: c.razonSocial }); setCandidatas([]); }}
                      className="block w-full cursor-pointer rounded border border-border bg-background px-2 py-1 text-left text-xs hover:bg-accent"
                    >
                      {c.razonSocial}
                      {c.documento && <span className="ml-1 text-muted-foreground">· {c.documento}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-foreground">
            Número de serie <span className="font-normal text-muted-foreground">— si el cliente ya lo mandó</span>
          </span>
          <input
            value={serie}
            onChange={(e) => setSerie(e.target.value)}
            placeholder="Como se lee en la placa"
            className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-sm outline-none"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-foreground">Modelo de la máquina</span>
          <input
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            placeholder="«Calandria GMP 120.20», «Lavadora Titan Max 17 kg»"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-foreground">
            Fecha de compra <span className="font-normal text-muted-foreground">— de ahí corre la garantía</span>
          </span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-foreground">Garantía (meses)</span>
            <input
              type="number"
              min={0}
              max={120}
              value={meses}
              onChange={(e) => setMeses(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-foreground">Dónde está</span>
            <input
              value={ubicacion}
              onChange={(e) => setUbicacion(e.target.value)}
              placeholder="Sede, piso"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none"
            />
          </label>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Sin fecha de compra la garantía queda sin calcular: la máquina se ficha igual y la fecha se completa cuando
        aparezca su guía de remisión, que es desde donde corre de verdad.
      </p>

      <button
        type="button"
        onClick={guardar}
        disabled={pendiente || !listo}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground",
          "hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <Plus className="size-3.5" />
        {atencionId ? "Fichar la máquina y verificar la garantía" : "Registrar la máquina"}
      </button>
    </div>
  );
}
