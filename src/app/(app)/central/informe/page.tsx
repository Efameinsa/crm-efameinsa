import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { fechaCalendarioLarga, fechaHoraLima } from "@/lib/fechas";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { BitacoraDia, type ActividadDia } from "@/components/crm/bitacora-dia";
import { SolicitudLead } from "@/components/crm/solicitud-lead";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BotonInformeCentral } from "@/components/crm/boton-informe-central";

export const dynamic = "force-dynamic";

// Informe del día de Central.
//
// Calcado del documento que Alondra venía armando a mano (AGENDA ALONDRA
// PALMA.pdf, enviado por correo el 24-08): mismas cinco secciones y el mismo
// orden, porque gerencia lo lee todos los días y busca cada cosa en su sitio.
//
// De las cinco, cuatro las arma el sistema con lo que ya se registró al
// trabajar. La primera —las actividades del día— se escribe a mano, porque es
// lo único que el sistema no puede saber.
//
// Es el mismo trato que recibió el comercial con su reporte diario: el sistema
// pone lo que ya sabe, la persona solo agrega lo que solo ella sabe.

const ETIQUETA_CANAL: Record<string, string> = {
  whatsapp: "WhatsApp",
  llamada: "Llamada",
  formulario_web: "Formulario web",
  facebook: "Facebook",
  instagram: "Instagram",
  email: "Correo",
  presencial: "Presencial",
  referido: "Referido",
  otro: "Otro",
};

const ETIQUETA_AREA: Record<string, string> = {
  comercial: "Comercial",
  servicio_tecnico: "Servicio técnico",
  postventa: "Postventa",
  rrhh: "RR. HH.",
  proveedores: "Proveedores",
  administracion: "Administración",
  otros: "Otros",
};

interface ContactoInforme {
  codigo: string | null;
  canal: string;
  area: string;
  estado: string;
  nombre: string | null;
  razon_social: string | null;
  telefono: string | null;
  solicita: string | null;
  recibido_at: string;
  asignado_a: string | null;
  codigo_comercial: string | null;
}

interface PresupuestoInforme {
  codigo: string | null;
  serie: string;
  estado: string;
  total: number;
  moneda: string;
  cliente: string | null;
  comercial: string | null;
  codigo_comercial: string | null;
  creada_at: string;
}

export default async function InformeCentralPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const [perfil, sp] = await Promise.all([requerirPerfil(), searchParams]);
  const hoy = hoyLima();
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha ?? "") ? (sp.fecha as string) : hoy;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("informe_central", { p_fecha: fecha });

  if (error || !data) {
    return (
      <SeccionPanel titulo="Informe del día">
        <p className="text-sm text-muted-foreground">No se pudo cargar el informe: {error?.message}</p>
      </SeccionPanel>
    );
  }

  const informe = data as unknown as {
    fecha: string;
    bitacora: ActividadDia[];
    contactos: ContactoInforme[];
    presupuestos: PresupuestoInforme[];
    totales: Record<string, number>;
  };

  const porSerie = (serie: string) => informe.presupuestos.filter((p) => p.serie === serie);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-foreground">Informe del día</h1>
          <p className="text-xs text-muted-foreground">
            {perfil.nombre} · {fechaCalendarioLarga(fecha)}
          </p>
        </div>
        <BotonInformeCentral fecha={fecha} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Dato etiqueta="Contactos del día" valor={informe.totales.contactos} />
        <Dato etiqueta="Derivados" valor={informe.totales.derivados} />
        <Dato etiqueta="Presupuestos" valor={informe.totales.presupuestos} />
        <Dato etiqueta="Sin asignar" valor={informe.totales.sin_asignar} alerta={informe.totales.sin_asignar > 0} />
      </div>

      <SeccionPanel titulo="1. Actividades realizadas">
        <BitacoraDia fecha={fecha} actividades={informe.bitacora} />
      </SeccionPanel>

      {/* Sus secciones 2 y 3 van juntas: en el Word eran dos tablas del mismo
          registro —las llamadas y el ingreso de prospectos— y acá es una sola
          lista con el canal por el que entró cada uno. */}
      <SeccionPanel
        titulo="2. Contactos registrados"
        accion={
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
            {informe.contactos.length}
          </span>
        }
      >
        {informe.contactos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no entró ningún contacto este día.</p>
        ) : (
          <div className="space-y-2">
            {informe.contactos.map((c) => (
              <div key={c.codigo} className="rounded-lg border border-border bg-background p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-xs font-semibold text-foreground">{c.codigo}</span>
                  <span className="text-sm font-medium text-foreground">{c.nombre ?? "—"}</span>
                  {c.razon_social && <span className="text-xs text-muted-foreground">{c.razon_social}</span>}
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-foreground">
                    {ETIQUETA_CANAL[c.canal] ?? c.canal}
                  </span>
                  {c.area !== "comercial" && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                      {ETIQUETA_AREA[c.area] ?? c.area}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">{fechaHoraLima(c.recibido_at)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.asignado_a ? (
                    <>
                      Derivado a <b className="text-foreground">{c.asignado_a}</b>
                      {c.codigo_comercial ? ` (${c.codigo_comercial})` : ""}
                    </>
                  ) : c.area === "comercial" ? (
                    "Pendiente de asignar"
                  ) : (
                    "Derivado a otra área"
                  )}
                  {c.telefono ? ` · ${c.telefono}` : ""}
                </p>
                <SolicitudLead mensaje={c.solicita} compacto />
              </div>
            ))}
          </div>
        )}
      </SeccionPanel>

      <SeccionPanel
        titulo="3. Presupuestos del día"
        accion={
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
            {informe.presupuestos.length}
          </span>
        }
      >
        {informe.presupuestos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No se emitieron presupuestos este día.</p>
        ) : (
          <div className="space-y-4">
            {/* Separados por razón social, como en su formato: eran dos
                bloques distintos, OPEN y EFAMEINSA. */}
            {(["EFAMEINSA", "OPEN"] as const).map((serie) => {
              const filas = porSerie(serie);
              if (filas.length === 0) return null;
              return (
                <div key={serie}>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {serie === "OPEN" ? "Open Investments" : "Efameinsa"} · {filas.length}
                  </p>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-32">N.º</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Comercial</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filas.map((p) => (
                          <TableRow key={p.codigo}>
                            <TableCell className="whitespace-nowrap font-mono text-xs">{p.codigo ?? "borrador"}</TableCell>
                            <TableCell className="text-sm">{p.cliente ?? "—"}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {p.comercial ?? "—"}
                              {p.codigo_comercial ? ` (${p.codigo_comercial})` : ""}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right tabular-nums">
                              {p.moneda} {Number(p.total).toLocaleString("es-PE")}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SeccionPanel>
    </div>
  );
}

function Dato({ etiqueta, valor, alerta = false }: { etiqueta: string; valor: number; alerta?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className={`mt-0.5 text-2xl font-bold tabular-nums ${alerta ? "text-amber-700" : "text-foreground"}`}>
        {(valor ?? 0).toLocaleString("es-PE")}
      </p>
    </div>
  );
}
