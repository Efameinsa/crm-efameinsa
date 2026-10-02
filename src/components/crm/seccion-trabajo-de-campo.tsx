import Link from "@/components/enlace";
import { ExternalLink, MapPinOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { MapaRecorridoCampo, type RecorridoCampo } from "@/components/crm/mapa-recorrido-campo";
import { CelularDeCampo, type CelularVinculado } from "@/components/crm/celular-de-campo";
import { fechaCalendario, fechaHoraLima } from "@/lib/fechas";
import { haceCuanto } from "@/lib/accesos";
import { hoyLima } from "@/lib/periodo";
import {
  HUECO_MIN,
  INTERVALO_MIN,
  duracion,
  esDeLaApp,
  horaDeLectura,
  llegoEnCola,
  precisionDudosa,
  textoEstado,
  textoPrecision,
  textoVelocidad,
  tramosSinSenal,
  urlGoogleMaps,
  type RegistroUbicacion,
} from "@/lib/ubicacion-campo";
import { cn } from "@/lib/utils";

/**
 * «TRABAJO DE CAMPO» EN ACCESOS Y EQUIPOS (0363).
 *
 * Ing. Carlos, reunión 01-10-2026 11:05, piloto de 15 días de Brenda (martes
 * y viernes en campo): «hacer que lo más preciso sea posible … después si
 * entra o no entra a su CRM ya lo puedes medir todo». Por cada persona marcada
 * con `trabajo_de_campo`: el último punto conocido y el recorrido del día, con
 * la precisión que declaró el equipo (en rojo si pasa de 100 m: ya no dice en
 * qué cuadra está), y los tramos sin señal, que son el CRM cerrado o la laptop
 * dormida.
 *
 * 0367 (Carlos vía Santos, 01-10-2026: «como Uber o inDrive»): además, el GPS
 * del celular con Traccar Client. Esos puntos se marcan «GPS», traen la hora
 * del GPS (la app manda en cola lo que juntó sin señal), velocidad y batería,
 * y el recorrido se ordena por la hora de la lectura, no por la de llegada.
 */

const COLUMNAS =
  "id, user_id, lat, lon, precision_m, origen, estado, detalle, ip, user_agent, created_at, registrada_at, velocidad_mps, rumbo, bateria, dispositivo_id";

const COLORES = ["#7E1210", "#1D4ED8", "#047857", "#B45309", "#6D28D9"];
const DIA_VALIDO = /^\d{4}-\d{2}-\d{2}$/;

function horaLima(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" });
}

function moverDia(dia: string, delta: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + delta)).toISOString().slice(0, 10);
}

export async function SeccionTrabajoDeCampo({ dia: diaPedido, otrosParametros }: { dia?: string; otrosParametros?: string }) {
  const hoy = hoyLima();
  const dia = diaPedido && DIA_VALIDO.test(diaPedido) ? diaPedido : hoy;
  const esHoy = dia === hoy;
  const supabase = await createClient();

  // Consulta aparte: si la 0363 todavía no está aplicada, la columna no existe
  // y esto falla solo, sin tumbar el resto de «Accesos y equipos».
  const { data: perfilesCampo, error } = await supabase
    .from("perfiles")
    .select("id, nombre, codigo_comercial")
    .eq("trabajo_de_campo", true)
    .order("codigo_comercial");
  if (error) return null;

  const enlaceDia = (d: string) => `/gerencia/accesos?${otrosParametros ? `${otrosParametros}&` : ""}campo=${d}`;
  const navegacion = (
    <div className="flex items-center gap-1.5 text-xs">
      <Link href={enlaceDia(moverDia(dia, -1))} className="rounded-md border border-border px-2 py-0.5 hover:bg-accent">
        ← Día anterior
      </Link>
      <span className="font-medium text-foreground">{esHoy ? "Hoy" : fechaCalendario(dia)}</span>
      {!esHoy && (
        <Link href={enlaceDia(moverDia(dia, 1))} className="rounded-md border border-border px-2 py-0.5 hover:bg-accent">
          Día siguiente →
        </Link>
      )}
    </div>
  );

  if (!perfilesCampo?.length) {
    return (
      <SeccionPanel titulo="Trabajo de campo">
        <p className="max-w-prose text-sm text-muted-foreground">
          Nadie está marcado para el piloto de trabajo de campo. Cuando admin marque a alguien, aquí aparecen su último
          punto y su recorrido del día.
        </p>
      </SeccionPanel>
    );
  }

  const ids = perfilesCampo.map((p) => p.id as string);
  // Los celulares vinculados (0367). Si la migración todavía no está, la
  // sección no se muestra: sin `registrada_at` las consultas de abajo fallarían
  // y se leería «no abrió el CRM», que sería mentira.
  const { data: celulares, error: errorCelulares } = await supabase
    .from("dispositivos_campo")
    .select("id, user_id, token, ultimo_envio_at")
    .in("user_id", ids)
    .eq("activo", true)
    .order("created_at", { ascending: false });
  if (errorCelulares) return null;
  const celularPor = new Map<string, CelularVinculado>();
  for (const c of celulares ?? []) {
    if (celularPor.has(c.user_id as string)) continue;
    celularPor.set(c.user_id as string, {
      id: c.id as string,
      token: c.token as string,
      ultimoEnvio: c.ultimo_envio_at
        ? `${fechaHoraLima(c.ultimo_envio_at as string)} (${haceCuanto(c.ultimo_envio_at as string)})`
        : "todavía no envió nada",
    });
  }

  const [{ data: delDia }, ...ultimos] = await Promise.all([
    // Con el GPS cada minuto un día son ~600 puntos por persona.
    supabase
      .from("ubicaciones_campo")
      .select(COLUMNAS)
      .in("user_id", ids)
      .gte("registrada_at", `${dia}T00:00:00-05:00`)
      .lt("registrada_at", `${moverDia(dia, 1)}T00:00:00-05:00`)
      .order("registrada_at", { ascending: true })
      .limit(5000),
    // El último punto CON ubicación de cada uno, aunque sea de otro día.
    ...ids.map((id) =>
      supabase
        .from("ubicaciones_campo")
        .select(COLUMNAS)
        .eq("user_id", id)
        .eq("estado", "ok")
        .order("registrada_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
  ]);
  const registros = (delDia ?? []) as unknown as RegistroUbicacion[];
  const ultimoPor = new Map(ultimos.map((u, i) => [ids[i], (u.data ?? null) as RegistroUbicacion | null]));

  const personas = perfilesCampo.map((p, i) => {
    const suyos = registros.filter((r) => r.user_id === p.id);
    const conUbicacion = suyos.filter((r) => r.estado === "ok" && r.lat != null && r.lon != null);
    const delGps = conUbicacion.filter(esDeLaApp);
    const precisiones = conUbicacion.map((r) => r.precision_m ?? Infinity).sort((a, b) => a - b);
    return {
      id: p.id as string,
      nombre: (p.nombre as string) ?? "—",
      codigo: (p.codigo_comercial as string | null) ?? null,
      color: COLORES[i % COLORES.length],
      suyos,
      conUbicacion,
      delGps,
      celular: celularPor.get(p.id as string) ?? null,
      mediana: precisiones.length ? precisiones[Math.floor(precisiones.length / 2)] : null,
      fallas: suyos.filter((r) => r.estado !== "ok"),
      huecos: tramosSinSenal(suyos, { esHoy }),
      ultimo: ultimoPor.get(p.id as string) ?? null,
    };
  });

  const recorridos: RecorridoCampo[] = personas.map((p) => ({
    nombre: p.nombre,
    color: p.color,
    puntos: p.conUbicacion.map((r) => ({
      lat: r.lat!,
      lon: r.lon!,
      precision: r.precision_m,
      hora: horaLima(horaDeLectura(r)),
      gps: esDeLaApp(r),
      velocidad: textoVelocidad(r.velocidad_mps),
      bateria: r.bateria ?? null,
    })),
  }));

  return (
    <SeccionPanel titulo="Trabajo de campo" accion={navegacion}>
      <p className="mb-3 max-w-prose text-xs text-muted-foreground">
        Dos fuentes. <strong className="text-foreground">GPS</strong>: el celular con Traccar Client, cada minuto
        aunque la pantalla esté apagada (típicamente ±3-15 m al aire libre). <strong className="text-foreground">Navegador</strong>:
        la laptop con el CRM abierto, al ingresar y cada {INTERVALO_MIN} min, ubicada por las redes wifi cercanas (sin
        GPS: ±20-100 m o más). Cada lectura trae el radio de error que declara el propio equipo:{" "}
        <strong className="text-destructive">en rojo</strong> si pasa de 100 m. Más de {HUECO_MIN} min sin lecturas es
        «sin señal»: el CRM cerrado y el celular apagado, sin batería o sin permiso.
      </p>

      <MapaRecorridoCampo recorridos={recorridos} />

      <div className="mt-4 space-y-3">
        {personas.map((p) => (
          <div key={p.id} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">
                <span className="mr-1.5 inline-block size-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                {p.nombre}
                {p.codigo && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{p.codigo}</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {p.suyos.length} lecturas · {p.conUbicacion.length} con ubicación
                {p.delGps.length > 0 && ` (${p.delGps.length} del GPS)`}
                {p.mediana != null && Number.isFinite(p.mediana) && ` · precisión típica ${textoPrecision(p.mediana)}`}
                {p.fallas.length > 0 && ` · ${p.fallas.length} sin ubicación`}
              </p>
            </div>

            {/* El último punto conocido, de cualquier día. */}
            <p className="mt-1.5 text-xs text-foreground">
              Último punto:{" "}
              {p.ultimo && p.ultimo.lat != null && p.ultimo.lon != null ? (
                <>
                  {fechaHoraLima(horaDeLectura(p.ultimo))} ({haceCuanto(horaDeLectura(p.ultimo))}) ·{" "}
                  <FuenteLectura gps={esDeLaApp(p.ultimo)} /> ·{" "}
                  <span className={cn("font-semibold", precisionDudosa(p.ultimo.precision_m) && "text-destructive")}>
                    {textoPrecision(p.ultimo.precision_m)}
                  </span>{" "}
                  {p.ultimo.bateria != null && <>· batería {Math.round(p.ultimo.bateria)} % </>}·{" "}
                  <a
                    href={urlGoogleMaps(p.ultimo.lat, p.ultimo.lon)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                  >
                    Ver en Google Maps <ExternalLink className="size-3" />
                  </a>
                </>
              ) : (
                <span className="text-muted-foreground">todavía ninguno con ubicación.</span>
              )}
            </p>

            <CelularDeCampo userId={p.id} nombre={p.nombre} celular={p.celular} />

            {/* Lo último que pasó si no fue una ubicación: que gerencia vea «no dio permiso», no un silencio. */}
            {p.suyos.length > 0 && p.suyos[p.suyos.length - 1].estado !== "ok" && (
              <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-800">
                <MapPinOff className="size-3.5" />
                {horaLima(horaDeLectura(p.suyos[p.suyos.length - 1]))} · {textoEstado(p.suyos[p.suyos.length - 1].estado)}
              </p>
            )}

            {p.huecos.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {p.huecos.map((h) => (
                  <p key={h.desde} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Sin señal</span> {horaLima(h.desde)} –{" "}
                    {h.hasta ? horaLima(h.hasta) : "ahora"} ({duracion(h.minutos)})
                  </p>
                ))}
              </div>
            )}

            {p.suyos.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {esHoy ? "Hoy" : "Ese día"} no abrió el CRM o no llegó ninguna lectura.
              </p>
            ) : (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-primary">
                  Recorrido del día ({p.suyos.length})
                </summary>
                <div className="mt-1.5 max-h-80 space-y-0.5 overflow-y-auto">
                  {p.suyos.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center gap-x-3 rounded border border-border px-2 py-1 text-xs">
                      <span className="w-12 font-mono tabular-nums text-muted-foreground">{horaLima(horaDeLectura(r))}</span>
                      <FuenteLectura gps={esDeLaApp(r)} />
                      {r.estado === "ok" && r.lat != null && r.lon != null ? (
                        <>
                          <span className={cn("w-20 font-semibold", precisionDudosa(r.precision_m) ? "text-destructive" : "text-foreground")}>
                            {textoPrecision(r.precision_m)}
                          </span>
                          <a href={urlGoogleMaps(r.lat, r.lon)} target="_blank" rel="noreferrer" className="font-mono text-primary hover:underline">
                            {r.lat.toFixed(5)}, {r.lon.toFixed(5)}
                          </a>
                          {textoVelocidad(r.velocidad_mps) && <span className="text-foreground">{textoVelocidad(r.velocidad_mps)}</span>}
                          {r.bateria != null && (
                            <span className={cn(r.bateria < 15 ? "font-semibold text-destructive" : "text-muted-foreground")}>
                              bat. {Math.round(r.bateria)} %
                            </span>
                          )}
                          {r.detalle && esDeLaApp(r) && (
                            <span className={cn(r.detalle.includes("SIMULADA") ? "font-semibold text-destructive" : "text-muted-foreground")}>
                              {r.detalle}
                            </span>
                          )}
                          {llegoEnCola(r) && (
                            <span className="text-muted-foreground" title="La app la guardó sin señal y la mandó después">
                              llegó {horaLima(r.created_at)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="font-medium text-amber-800">{textoEstado(r.estado)}</span>
                      )}
                      <span className="ml-auto text-muted-foreground">{r.origen === "ingreso" ? "al ingresar" : r.origen === "manual" ? "manual" : ""}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        ))}
      </div>
    </SeccionPanel>
  );
}

/** «GPS» (celular, Traccar Client) o «Navegador» (laptop, wifi): no se leen igual. */
function FuenteLectura({ gps }: { gps: boolean }) {
  return gps ? (
    <span className="rounded bg-emerald-100 px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-800">GPS</span>
  ) : (
    <span className="rounded bg-muted px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Navegador</span>
  );
}
