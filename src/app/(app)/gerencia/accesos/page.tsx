import Link from "next/link";
import { Laptop, Smartphone, Tablet, MapPin, ShieldAlert, HelpCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirRol } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaCalendario, fechaHoraLima } from "@/lib/fechas";
import { describirEquipo, haceCuanto, huellaEquipo, ipsDeLaOficina, zonaDeAcceso } from "@/lib/accesos";
import { ubicarIps } from "@/lib/geoip";
import { MapaAccesos, type PuntoAcceso } from "@/components/crm/mapa-accesos";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Quién entra al CRM, desde qué equipo y desde dónde.
 *
 * Carlos lo pidió el 28-08 pensando en voz alta sobre el riesgo real: «se
 * supone que esta URL la puedo abrir en cualquier lugar del planeta… quiero una
 * vista de qué computadores está viendo actualmente». Esto es esa vista, y es
 * el primer paso de lo que viene después —autorizar equipo por equipo—: antes
 * de decidir a quién se le cierra la puerta hay que poder ver quién entra por
 * ella.
 *
 * LO QUE ACÁ NO SE HACE, a propósito:
 *   · No se geolocaliza la IP. Habría que mandarle a un tercero, todos los
 *     días, la lista de dónde se conecta cada empleado; y para la pregunta que
 *     importa —¿está entrando desde fuera?— alcanza con reconocer la red de la
 *     oficina, que se reconoce sola porque es por la que entra media empresa.
 *   · No se bloquea nada todavía. Esta pantalla mira; el bloqueo por equipo es
 *     la siguiente conversación y necesita decidir qué pasa cuando alguien
 *     viaja o se le rompe la laptop.
 */

const ICONO = { escritorio: Laptop, celular: Smartphone, tablet: Tablet, desconocido: HelpCircle } as const;

interface Acceso {
  id: string;
  user_id: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export default async function AccesosPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  await requerirRol(["gerencia", "admin"]);
  const sp = await searchParams;
  const soloFuera = sp.ver === "fuera";

  const supabase = await createClient();
  const [{ data: accesosData }, { data: perfiles }] = await Promise.all([
    supabase.from("accesos").select("id, user_id, ip, user_agent, created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("perfiles").select("id, nombre, rol, codigo_comercial, activo, es_postventa"),
  ]);

  const accesos = (accesosData ?? []) as unknown as Acceso[];
  // El más viejo que queda: es «desde cuándo» hay registro.
  const desdeCuando = accesos.length ? accesos[accesos.length - 1].created_at : null;
  const oficina = ipsDeLaOficina(accesos.map((a) => ({ ip: a.ip, user_id: a.user_id })));
  const persona = new Map(
    (perfiles ?? []).map((p) => [
      p.id as string,
      { nombre: (p.nombre as string) ?? "—", codigo: p.codigo_comercial as string | null, rol: p.rol as string, activo: p.activo as boolean },
    ]),
  );

  // El último acceso de cada uno: es la respuesta a «quién está usando el CRM».
  const ultimoPorUsuario = new Map<string, Acceso>();
  for (const a of accesos) if (!ultimoPorUsuario.has(a.user_id)) ultimoPorUsuario.set(a.user_id, a);

  // Los equipos desde los que ya entró cada uno. Sirve para marcar el equipo
  // nuevo, que es la señal que de verdad hay que mirar.
  const equiposPorUsuario = new Map<string, Set<string>>();
  for (const a of [...accesos].reverse()) {
    const huella = huellaEquipo(a.user_agent, a.ip);
    if (!equiposPorUsuario.has(a.user_id)) equiposPorUsuario.set(a.user_id, new Set());
    equiposPorUsuario.get(a.user_id)!.add(huella);
  }

  const conectados = [...ultimoPorUsuario.entries()]
    .map(([userId, a]) => ({ userId, acceso: a, quien: persona.get(userId) }))
    .filter((x) => x.quien)
    .sort((a, b) => b.acceso.created_at.localeCompare(a.acceso.created_at));

  const bitacora = (soloFuera ? accesos.filter((a) => zonaDeAcceso(a.ip, oficina).fuera) : accesos).slice(0, 80);
  const fueraTotal = accesos.filter((a) => zonaDeAcceso(a.ip, oficina).fuera).length;

  // Dónde está cada equipo. Se piden las IP de los últimos ingresos: las que ya
  // se consultaron alguna vez salen de la base sin volver a preguntarle a
  // nadie, y de las nuevas se resuelven unas pocas por carga para que la
  // pantalla no espere a un tercero (migración 0103).
  const ubicaciones = await ubicarIps(conectados.map((c) => c.acceso.ip ?? "").filter(Boolean));

  // Un punto por lugar, con toda la gente que entró desde ahí.
  const porLugar = new Map<string, PuntoAcceso>();
  for (const { acceso, quien } of conectados) {
    const u = acceso.ip ? ubicaciones.get(acceso.ip) : undefined;
    if (!u || u.lat == null || u.lon == null) continue;
    const clave = `${u.lat},${u.lon}`;
    if (!porLugar.has(clave)) {
      porLugar.set(clave, {
        lat: u.lat,
        lon: u.lon,
        lugar: u.etiqueta,
        proveedor: u.proveedor,
        ip: u.ip,
        personas: [],
        esOficina: oficina.has(u.ip),
      });
    }
    porLugar.get(clave)!.personas.push({ nombre: quien!.nombre, cuando: haceCuanto(acceso.created_at) });
  }
  const puntos = [...porLugar.values()];

  return (
    <div className="space-y-4">
      <SeccionPanel
        titulo="Dónde están los equipos"
        accion={<span className="text-xs text-muted-foreground">{puntos.length} lugares</span>}
      >
        <p className="mb-3 max-w-prose text-xs text-muted-foreground">
          Desde dónde se está gestionando, que es lo mismo que decir dónde está la laptop. La ubicación sale de la IP:
          eso ubica <strong>la central del proveedor</strong>, no a la persona, así que sirve para distinguir Lima de
          Arequipa o del extranjero, y no para saber en qué calle está. Por eso son círculos y no alfileres.
        </p>
        <MapaAccesos puntos={puntos} />
      </SeccionPanel>

      <SeccionPanel
        titulo="Quién está usando el CRM"
        accion={<span className="text-xs text-muted-foreground">{conectados.length} usuarios con acceso registrado</span>}
      >
        <p className="mb-3 max-w-prose text-xs text-muted-foreground">
          El último ingreso de cada persona: cuándo, desde qué equipo y desde dónde. La red de la oficina se reconoce
          sola —es por la que entra casi todo el mundo—; lo que entra por otra IP se marca como fuera.
        </p>
        <div className="space-y-1.5">
          {conectados.map(({ userId, acceso, quien }) => {
            const equipo = describirEquipo(acceso.user_agent);
            const zona = zonaDeAcceso(acceso.ip, oficina);
            const Icono = ICONO[equipo.tipo];
            return (
              <div
                key={userId}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-md border p-2.5",
                  zona.fuera ? "border-amber-300 bg-amber-50/60" : "border-border",
                )}
              >
                <span className="flex size-8 flex-none items-center justify-center rounded-full bg-secondary text-foreground">
                  <Icono className="size-4" />
                </span>
                <div className="min-w-[180px] flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {quien!.nombre}
                    {quien!.codigo && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{quien!.codigo}</span>}
                    {!quien!.activo && <span className="ml-1.5 text-xs font-normal text-destructive">· inactivo</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {equipo.resumen} · {quien!.rol}
                    {(equiposPorUsuario.get(userId)?.size ?? 1) > 1 &&
                      ` · ${equiposPorUsuario.get(userId)!.size} equipos distintos`}
                  </p>
                </div>
                <div className="text-right text-xs">
                  <p className="font-medium text-foreground">{haceCuanto(acceso.created_at)}</p>
                  <p className="text-muted-foreground">{fechaHoraLima(acceso.created_at)}</p>
                </div>
                <div className="w-[200px] text-right text-xs">
                  <p className={cn("flex items-center justify-end gap-1 font-semibold", zona.fuera ? "text-amber-800" : "text-muted-foreground")}>
                    {zona.fuera ? <ShieldAlert className="size-3.5" /> : <MapPin className="size-3.5" />}
                    {zona.etiqueta}
                  </p>
                  {/* Dónde estaba el equipo. Cuando la IP todavía no se pudo
                      ubicar se muestra la IP a secas: es lo que hay. */}
                  <p className="text-[11px] text-foreground">
                    {(acceso.ip ? ubicaciones.get(acceso.ip)?.etiqueta : null) ?? acceso.ip ?? "sin IP"}
                  </p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {(acceso.ip ? ubicaciones.get(acceso.ip)?.proveedor : null) ?? acceso.ip ?? ""}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </SeccionPanel>

      <SeccionPanel
        titulo="Bitácora de ingresos"
        accion={
          <div className="flex items-center gap-1.5 text-xs">
            <Link
              href="/gerencia/accesos"
              className={cn(
                "rounded-md border px-2 py-0.5 font-medium",
                soloFuera ? "border-border text-muted-foreground hover:bg-accent" : "border-primary bg-primary/10 text-primary",
              )}
            >
              Todos
            </Link>
            <Link
              href="/gerencia/accesos?ver=fuera"
              className={cn(
                "rounded-md border px-2 py-0.5 font-medium",
                soloFuera ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              Fuera de la oficina ({fueraTotal})
            </Link>
          </div>
        }
      >
        {bitacora.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {soloFuera ? "Nadie entró desde fuera de la oficina en los últimos ingresos registrados." : "Todavía no hay ingresos registrados."}
          </p>
        ) : (
          <div className="space-y-1">
            {bitacora.map((a) => {
              const equipo = describirEquipo(a.user_agent);
              const zona = zonaDeAcceso(a.ip, oficina);
              const quien = persona.get(a.user_id);
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded border border-border px-2.5 py-1.5 text-xs">
                  <span className="w-[136px] flex-none font-mono tabular-nums text-muted-foreground">
                    {fechaHoraLima(a.created_at)}
                  </span>
                  <span className="min-w-[150px] flex-1 font-medium text-foreground">{quien?.nombre ?? "Usuario dado de baja"}</span>
                  <span className="w-[140px] text-muted-foreground">{equipo.resumen}</span>
                  <span className="w-[112px] font-mono text-muted-foreground">{a.ip ?? "sin IP"}</span>
                  <span className={cn("w-[124px] text-right font-medium", zona.fuera ? "text-amber-800" : "text-muted-foreground")}>
                    {zona.etiqueta}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 max-w-prose text-xs text-muted-foreground">
          {/* Desde cuándo hay registro. Se lee del dato y no está escrito a
              mano: el 28-08 se borró todo lo anterior por pedido de gerencia, y
              una pantalla que no dice desde cuándo mide hace creer que lo que
              muestra es todo lo que pasó. */}
          Registro desde el <strong>{fechaCalendario((desdeCuando ?? "").slice(0, 10))}</strong>. Se anotan los
          ingresos con correo y contraseña, que es como entra todo el mundo. Todavía no se bloquea ningún equipo: eso
          es el paso siguiente, y antes hay que decidir qué pasa cuando alguien viaja o cambia de laptop.
        </p>
      </SeccionPanel>
    </div>
  );
}
