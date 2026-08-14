import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { RegistroRapido } from "@/components/crm/registro-rapido";
import { CambiarEtapa } from "@/components/crm/cambiar-etapa";
import { Cotizador } from "@/components/crm/cotizador";
import { ListaCotizaciones } from "@/components/crm/lista-cotizaciones";

export default async function OportunidadDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: oportunidad }, { data: motivos }, { data: productos }, { data: cotizaciones }] = await Promise.all([
    supabase
      .from("oportunidades")
      .select(
        "id, etapa, intencion, proxima_accion, proxima_accion_at, cuentas(id, razon_social, tipo_doc, num_doc, direccion, contactos(nombre, cargo, telefono, email, es_principal))",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("catalogo_motivos_rechazo").select("id, nombre").eq("activo", true).order("nombre"),
    supabase
      .from("productos")
      .select("id, marca, modelo, nombre, segmento, precios_producto(tier, precio)")
      .eq("activo", true)
      .order("marca"),
    supabase
      .from("cotizaciones")
      .select("id, codigo, serie, estado, estado_aprobacion, total, moneda")
      .eq("oportunidad_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!oportunidad) notFound();

  const { data: actividades } = await supabase
    .from("actividades")
    .select("id, tipo, nota, realizada_at")
    .eq("oportunidad_id", id)
    .order("realizada_at", { ascending: false });

  const cuenta = oportunidad.cuentas as unknown as {
    id: string;
    razon_social: string;
    tipo_doc: string;
    num_doc: string | null;
    direccion: string | null;
    contactos: { nombre: string; cargo: string | null; telefono: string | null; email: string | null }[];
  } | null;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{cuenta?.razon_social ?? "Cuenta sin nombre"}</CardTitle>
              <Badge variant="secondary">{oportunidad.etapa}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {cuenta?.tipo_doc !== "SIN_DOC" ? `${cuenta?.tipo_doc}: ${cuenta?.num_doc}` : "Sin documento"}
              {cuenta?.direccion ? ` · ${cuenta.direccion}` : ""}
            </p>
            {cuenta?.contactos && cuenta.contactos.length > 0 && (
              <div className="space-y-1">
                {cuenta.contactos.map((c, i) => (
                  <p key={i}>
                    {c.nombre}
                    {c.cargo ? ` (${c.cargo})` : ""} — {c.telefono ?? "sin teléfono"}
                    {c.email ? ` · ${c.email}` : ""}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Registrar gestión</CardTitle>
          </CardHeader>
          <CardContent>
            <RegistroRapido oportunidadId={oportunidad.id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cotizaciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ListaCotizaciones cotizaciones={cotizaciones ?? []} />
            <Separator />
            <Cotizador oportunidadId={oportunidad.id} productos={productos ?? []} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Historial</CardTitle>
          </CardHeader>
          <CardContent>
            {!actividades || actividades.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin actividad registrada todavía.</p>
            ) : (
              <div className="space-y-3">
                {actividades.map((a, i) => (
                  <div key={a.id}>
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="secondary">{a.tipo}</Badge>
                      <span className="text-muted-foreground">
                        {new Date(a.realizada_at).toLocaleString("es-PE")}
                      </span>
                    </div>
                    {a.nota && <p className="mt-1 text-sm">{a.nota}</p>}
                    {i < actividades.length - 1 && <Separator className="mt-3" />}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Próxima acción</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {oportunidad.proxima_accion ? (
              <>
                <p>{oportunidad.proxima_accion}</p>
                <p className="text-muted-foreground">
                  {oportunidad.proxima_accion_at
                    ? new Date(oportunidad.proxima_accion_at).toLocaleDateString("es-PE")
                    : ""}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Sin próxima acción definida.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Etapa</CardTitle>
          </CardHeader>
          <CardContent>
            <CambiarEtapa
              oportunidadId={oportunidad.id}
              etapaActual={oportunidad.etapa}
              motivos={motivos ?? []}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
