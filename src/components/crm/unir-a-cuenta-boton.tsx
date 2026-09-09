"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Search, UserCheck } from "lucide-react";
import { buscarCuentasParaUnir, unirLeadACuenta, type CuentaParaUnir } from "@/lib/acciones/leads";
import { permisoSinPin } from "@/lib/acciones/seguridad";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CampoCodigo } from "@/components/crm/campo-codigo";
import { cn } from "@/lib/utils";

/**
 * UNIR ESTE CONTACTO A LA FICHA DEL CLIENTE QUE YA EXISTE.
 *
 * Central lo pidió dos días seguidos. El 09-09, con nombre y apellido: «para
 * unir DEYSI J con el cliente COMERCIO ALTERNATIVO DE PRODUCTOS NO
 * TRADICIONALES Y DESARROLLO EN LATINOAMERICA-PERU / CANDELA PERU».
 *
 * Ese prospecto entró por el formulario de Google Ads sin RUC y sin razón
 * social —el formulario de Ads solo pide nombre, teléfono y ciudad—, así que
 * el CRM le abrió ficha propia como cliente nuevo. Pero el correo decía
 * `@candelaperu.net`: es un cliente de C4 desde 2021. Quedaron dos fichas del
 * mismo cliente y, cuando Central buscó el RUC en sus derivados, no encontró
 * nada — el cliente estaba, pero el prospecto de hoy colgaba de la otra ficha.
 *
 * POR QUÉ NO ALCANZABA «Cambiar de comercial»: aquel mueve a quién está
 * derivado, pero se lleva la ficha nueva con él y el duplicado sigue vivo. Son
 * dos preguntas distintas —de qué cliente es, y quién lo atiende— y hasta hoy
 * solo se podía contestar la segunda.
 *
 * SE BUSCA COMO SE HABLA: por nombre, por RUC, por el correo entero o por el
 * dominio solo («candelaperu.net»), que es lo único que trae un contacto de
 * publicidad. Y cada resultado dice DE QUIÉN ES la cartera, porque unir se
 * decide mirando eso.
 */
export function UnirACuentaBoton({
  leadId,
  contacto,
  estado,
  comercialActual,
  sugerencia,
  supervisores = [],
  variante = "outline",
}: {
  leadId: string;
  contacto: string;
  /** `asignado` = ya se derivó, así que unir a otra cartera pide código. */
  estado: "pendiente_triaje" | "asignado" | string;
  comercialActual: string | null;
  /** Con qué arranca la búsqueda: el dominio del correo, la razón social… */
  sugerencia?: string | null;
  supervisores?: { id: string; nombre: string; rol?: string }[];
  variante?: "outline" | "ghost";
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<CuentaParaUnir[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [elegida, setElegida] = useState<CuentaParaUnir | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pin, setPin] = useState("");
  const [sinPinHasta, setSinPinHasta] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  const sinPin = sinPinHasta !== null;
  // La misma regla que aplica la base (0200): solo hace falta código cuando el
  // contacto YA está derivado y la ficha destino es de otro comercial. Mientras
  // siga en la bandeja no hay derivación que corregir.
  const mueveCartera = Boolean(
    estado === "asignado" && elegida?.comercialId && comercialActual && elegida.comercialId !== comercialActual,
  );
  const digitos = pin.replace(/[^0-9]/g, "").length;
  const listo =
    Boolean(elegida) && motivo.trim().length >= 10 && (!mueveCartera || sinPin || digitos === 4);

  useEffect(() => {
    if (!abierto) return;
    permisoSinPin().then((r) => setSinPinHasta(r.hasta));
    if (sugerencia && !q) setQ(sugerencia);
    // Solo al abrir: después manda lo que teclee Central.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  // Se busca mientras escribe, con una pausa: es la misma mecánica del
  // formulario de captura, donde el análisis en vivo ya evitó duplicados.
  useEffect(() => {
    if (!abierto) return;
    const texto = q.trim();
    if (texto.length < 3) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const t = setTimeout(() => {
      buscarCuentasParaUnir(texto)
        .then(setResultados)
        .finally(() => setBuscando(false));
    }, 350);
    return () => clearTimeout(t);
  }, [q, abierto]);

  function cerrar() {
    setAbierto(false);
    setQ("");
    setResultados([]);
    setElegida(null);
    setMotivo("");
    setPin("");
  }

  function guardar() {
    if (!listo || !elegida) return;
    startTransition(async () => {
      const r = await unirLeadACuenta(leadId, elegida.id, pin, motivo);
      if (r.error) {
        toast.error(r.error, { duration: 9000 });
        // El código se quema al usarse: si algo falló después de validarlo, el
        // que está en pantalla ya no sirve.
        setPin("");
        return;
      }
      toast.success(r.resumen ?? "Contacto unido a la ficha del cliente", { duration: 9000 });
      cerrar();
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => (v ? setAbierto(true) : cerrar())}>
      <DialogTrigger
        render={
          <Button size="sm" variant={variante} className="h-8 gap-1.5 px-2.5">
            <Link2 className="size-4" />
            <span className="hidden sm:inline">Es un cliente que ya tenemos</span>
            <span className="sm:hidden">Unir</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>¿De qué cliente es este contacto?</DialogTitle>
          <DialogDescription>
            <b>{contacto}</b> pasa a la ficha del cliente que elija, con su expediente y su teléfono. La ficha
            repetida se cierra.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="buscar-cuenta">Buscar el cliente</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="buscar-cuenta"
              className="pl-8"
              placeholder="Nombre, RUC, correo o solo el dominio (candelaperu.net)"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setElegida(null);
              }}
            />
          </div>
          {/* El dominio del correo es la pista que el CRM todavía no cruza solo:
              un prospecto de publicidad llega sin RUC, pero con el correo de la
              empresa. Se ofrece hecho para que no haya que recortarlo a mano. */}
          {sugerencia && q !== sugerencia && (
            <button
              type="button"
              onClick={() => setQ(sugerencia)}
              className="text-[11px] text-primary underline-offset-2 hover:underline"
            >
              Buscar por «{sugerencia}», que es de donde vino este contacto
            </button>
          )}
        </div>

        <div className="max-h-56 space-y-1.5 overflow-y-auto">
          {buscando && resultados.length === 0 && (
            <p className="px-1 text-xs text-muted-foreground">Buscando…</p>
          )}
          {!buscando && q.trim().length >= 3 && resultados.length === 0 && (
            <p className="rounded-md border border-dashed border-border px-2.5 py-2 text-xs text-muted-foreground">
              Ninguna ficha dice «{q.trim()}». Si el cliente es nuevo de verdad, no hay nada que unir: se deriva y
              listo.
            </p>
          )}
          {resultados.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setElegida(c)}
              className={cn(
                "flex w-full flex-col items-start gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                elegida?.id === c.id
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-accent",
              )}
            >
              <span className="text-sm font-semibold leading-snug text-foreground">{c.razonSocial}</span>
              <span className="text-[11px] text-muted-foreground">
                {c.numDoc ? `${c.numDoc} · ` : ""}
                {c.codigoComercial || c.comercialNombre ? (
                  <>
                    cartera de{" "}
                    <b className="text-foreground">
                      {c.codigoComercial ? `${c.codigoComercial} · ` : ""}
                      {c.comercialNombre ?? "—"}
                    </b>
                  </>
                ) : (
                  "sin comercial asignado"
                )}
                {c.detalle ? ` · ${c.detalle}` : ""}
              </span>
            </button>
          ))}
        </div>

        {/* QUÉ VA A PASAR, dicho antes de apretar. Unir no le quita el cliente a
            nadie: la ficha se queda con su comercial y el prospecto pasa a
            manos de quien ya atiende a ese cliente. */}
        {elegida && (
          <p
            className={cn(
              "rounded-md border px-2.5 py-2 text-xs leading-snug",
              mueveCartera
                ? "border-amber-400 bg-amber-50 text-amber-900"
                : "border-sky-300 bg-sky-50 text-sky-900",
            )}
          >
            {mueveCartera ? (
              <>
                <b>{contacto}</b> deja de estar derivado a quien lo tiene ahora y pasa a{" "}
                <b>
                  {elegida.codigoComercial ? `${elegida.codigoComercial} · ` : ""}
                  {elegida.comercialNombre ?? "el comercial de esa ficha"}
                </b>
                , que ya lleva a ese cliente. Por eso pide el código.
              </>
            ) : (
              <>
                Queda en la ficha de <b>{elegida.razonSocial}</b>
                {estado === "pendiente_triaje" ? ", y al derivarlo se va con su historia." : "."}
              </>
            )}
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="motivo-unir">Por qué es el mismo cliente</Label>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Lo lee el comercial que lo recibe. Una frase alcanza.
          </p>
          <Textarea
            id="motivo-unir"
            rows={2}
            placeholder="ej.: escribió desde el correo de la empresa, es el mismo cliente que ya atendemos"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>

        {mueveCartera &&
          (sinPin ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-[12px] leading-snug">
              <p className="font-semibold text-foreground">Hoy no hace falta el código.</p>
              <p className="text-muted-foreground">
                Gerencia lo levantó por el día. La corrección queda registrada igual.
              </p>
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
              <div className="space-y-1.5">
                <div>
                  <Label htmlFor="pin-unir" className="text-sm">
                    Código del supervisor
                  </Label>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Cambia cada 10 min · sirve para una corrección
                  </p>
                </div>
                <CampoCodigo id="pin-unir" valor={pin} onChange={setPin} tono="amber" />
              </div>
              {supervisores.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 text-[11px]">
                  <span className="mr-0.5 inline-flex items-center gap-1 font-semibold text-foreground">
                    <UserCheck className="size-3.5" />
                    Pídaselo a:
                  </span>
                  {supervisores.map((s) => (
                    <span key={s.id} className="rounded-full bg-background px-2 py-0.5 text-muted-foreground">
                      {s.nombre}
                      {s.rol && s.rol !== "gerencia" ? ` · ${s.rol}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

        <DialogFooter className="sm:flex-col sm:items-stretch sm:gap-2">
          {!listo && (
            <p className="text-[11px] text-muted-foreground">
              {!elegida
                ? "Elija la ficha del cliente."
                : motivo.trim().length < 10
                  ? "Escriba por qué es el mismo cliente."
                  : "Falta el código del supervisor."}
            </p>
          )}
          <Button onClick={guardar} disabled={!listo || enviando}>
            {enviando ? "Uniendo…" : "Unir a esta ficha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
