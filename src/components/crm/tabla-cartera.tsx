"use client";

import { useRouter } from "next/navigation";
import { Building2, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MarcaServidor } from "@/components/crm/marca-servidor";
import { TrabajarHistoricaBoton } from "@/components/crm/trabajar-historica-boton";
import { OfrecerMantenimientoBoton } from "@/components/crm/ofrecer-mantenimiento-boton";
import { RegistrarSeguimientoBoton } from "@/components/crm/registrar-seguimiento-boton";
import { fechaLima } from "@/lib/fechas";

export interface FilaCartera {
  id: string;
  razonSocial: string;
  documento: string;
  distrito: string | null;
  /** Cuántas veces compró. Reemplazó al conteo de contactos: para decidir a
      quién llamar importa más si el cliente ya compró que cuántos teléfonos
      tiene guardados. */
  compras: number;
  totalUsd: number;
  oportunidadesActivas: number;
  ultimaVentaAt: string | null;
  /** Tiene su carpeta del servidor vinculada: la fila lo marca (0137). */
  conServidor?: boolean;
  /** Su oportunidad archivada más reciente (0155). Si no tiene ninguna
      abierta, la fila ofrece «Retomar» ahí mismo: Santos encontró a Becerra
      Rojas por Mi cartera y el botón solo estaba en la ficha (02-09). */
  historicaId?: string | null;
  /** De qué comercial es el cliente. Solo se dibuja para postventa. */
  duenoCodigo?: string | null;
  /**
   * El teléfono del contacto principal (0219). Ariana, 11-09, desde su
   * cuenta de postventa: «no visualiza algunos teléfonos». Es una lista para
   * llamar: abrir la ficha solo para ver el número era el trabajo que la
   * lista tenía que ahorrar.
   */
  telefono?: string | null;
  /** La última gestión real (llamada, WhatsApp, visita…) de los últimos 30 días (19-09): se muestra junto a «Retomar». */
  ultimaGestionAt?: string | null;
  ultimaGestionTipo?: string | null;
}

const ETIQUETA_GESTION: Record<string, string> = {
  llamada: "llamada",
  whatsapp: "WhatsApp",
  email: "correo",
  visita: "visita",
  showroom: "visita a planta",
  reunion_online: "reunión",
  filtro: "filtro",
  otro: "gestión",
};

function etiquetaGestion(at: string | null | undefined, tipo: string | null | undefined): string | null {
  if (!at) return null;
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const dia = new Date(at).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const dias = Math.round((Date.parse(hoy) - Date.parse(dia)) / 864e5);
  const cuando = dias === 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} días`;
  return `Gestionado ${cuando} · ${ETIQUETA_GESTION[tipo ?? ""] ?? "gestión"}`;
}

// Misma corrección que tabla-clientes.tsx / historial-cuenta.tsx (B9.3): la
// fila entera es el objetivo de clic, sin botón "Ver" que perseguir ni
// columna "Cliente" tan ancha que empuje la tabla a scroll horizontal.
/**
 * `mostrarDueno` es para postventa. Su lista dejó de ser «los clientes que me
 * pertenecen» y pasó a ser «los que atiendo» (migración 0183): de los 480, más
 * de 400 están en la cartera de otro comercial. Sin decirlo en la fila, alguien
 * puede creer que le traspasaron la cartera — y eso ya causó un problema real
 * cuando Ariana apareció con ventas que no eran suyas.
 */
/**
 * `seguimientoComercial` (23-09, 0281): el comercial anota la llamada desde la
 * fila, sin abrir la ficha. Va a SU expediente comercial con el cliente —el
 * abierto, el histórico retomado o uno nuevo—, así que reemplaza a «Retomar»
 * con un clic menos y le cuenta en la meta.
 */
export function TablaCartera({
  filas,
  mostrarDueno = false,
  seguimientoComercial = false,
}: {
  filas: FilaCartera[];
  mostrarDueno?: boolean;
  seguimientoComercial?: boolean;
}) {
  const router = useRouter();

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Documento</TableHead>
            <TableHead>Zona</TableHead>
            <TableHead>Teléfono</TableHead>
            {mostrarDueno && <TableHead>Comercial</TableHead>}
            <TableHead className="text-right">Compras</TableHead>
            <TableHead className="text-right">{seguimientoComercial ? "Seguimiento" : "Abiertas"}</TableHead>
            <TableHead>Última venta</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((c) => (
            <TableRow
              key={c.id}
              role="link"
              tabIndex={0}
              onClick={() => router.push(`/comercial/cartera/${c.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter") router.push(`/comercial/cartera/${c.id}`);
              }}
              className="cursor-pointer transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <TableCell className="max-w-[280px] whitespace-normal">
                <span className="flex items-start gap-2 font-medium text-foreground">
                  <Building2 className="mt-0.5 size-3.5 flex-none text-muted-foreground" />
                  <span className="line-clamp-2 min-w-0" title={c.razonSocial}>
                    {c.razonSocial}
                  </span>
                  {c.conServidor && <MarcaServidor />}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{c.documento}</TableCell>
              <TableCell className="text-muted-foreground">{c.distrito ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap font-mono text-xs">
                {c.telefono ? (
                  // El enlace detiene el clic de la fila: tocar el número es
                  // para llamar, no para abrir la ficha.
                  <a
                    href={`tel:${c.telefono.replace(/[^\d+]/g, "")}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-foreground hover:text-primary hover:underline"
                  >
                    {c.telefono}
                  </a>
                ) : (
                  <span className="text-muted-foreground" title="Este cliente no tiene ningún teléfono cargado">sin teléfono</span>
                )}
              </TableCell>
              {mostrarDueno && (
                <TableCell className="whitespace-nowrap text-muted-foreground">{c.duenoCodigo ?? "—"}</TableCell>
              )}
              <TableCell className="text-right tabular-nums">
                {c.compras > 0 ? (
                  <>
                    {c.compras}
                    {c.totalUsd > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        US$ {Math.round(c.totalUsd).toLocaleString("es-PE")}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {seguimientoComercial ? (
                  // El botón detiene el clic; Enter sobre él tampoco debe abrir la ficha.
                  <span className="inline-flex flex-col items-end gap-0.5" onKeyDown={(e) => e.stopPropagation()}>
                    {c.oportunidadesActivas > 0 && (
                      <span className="font-semibold text-primary" title="Expedientes abiertos">
                        {c.oportunidadesActivas}
                      </span>
                    )}
                    {etiquetaGestion(c.ultimaGestionAt, c.ultimaGestionTipo) && (
                      <span className="whitespace-nowrap text-[10px] font-semibold text-[#1E7F4F]">{etiquetaGestion(c.ultimaGestionAt, c.ultimaGestionTipo)}</span>
                    )}
                    <RegistrarSeguimientoBoton cuentaId={c.id} compacto comercial />
                  </span>
                ) : c.oportunidadesActivas > 0 ? (
                  <span className="font-semibold text-primary">{c.oportunidadesActivas}</span>
                ) : c.historicaId ? (
                  // El botón detiene el clic; Enter sobre él tampoco debe abrir la ficha.
                  <span className="inline-flex flex-col items-end gap-0.5" onKeyDown={(e) => e.stopPropagation()}>
                    {etiquetaGestion(c.ultimaGestionAt, c.ultimaGestionTipo) && (
                      <span className="whitespace-nowrap text-[10px] font-semibold text-[#1E7F4F]">{etiquetaGestion(c.ultimaGestionAt, c.ultimaGestionTipo)}</span>
                    )}
                    <TrabajarHistoricaBoton oportunidadId={c.historicaId} compacto />
                  </span>
                ) : mostrarDueno ? (
                  // POSTVENTA TOMA AL CLIENTE DESDE LA LISTA (11-09). Ariana:
                  // «¿en su lista hay un botón de retomar para que pase a
                  // oportunidad?». Lo había solo para lo archivado; para el
                  // cliente sin ningún expediente tenía que abrir la ficha, y
                  // en una campaña de llamadas ese clic de más se paga 500
                  // veces. Mismo botón que en la ficha y en «Las ventas de la
                  // empresa»: abre (o retoma) el expediente de mantenimiento a
                  // su nombre y la lleva a registrar la llamada.
                  <span className="inline-flex" onKeyDown={(e) => e.stopPropagation()}>
                    <OfrecerMantenimientoBoton cuentaId={c.id} compacto />
                  </span>
                ) : etiquetaGestion(c.ultimaGestionAt, c.ultimaGestionTipo) ? (
                  <span className="whitespace-nowrap text-[10px] font-semibold text-[#1E7F4F]">{etiquetaGestion(c.ultimaGestionAt, c.ultimaGestionTipo)}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {c.ultimaVentaAt ? fechaLima(c.ultimaVentaAt) : "Nunca"}
              </TableCell>
              <TableCell>
                <ChevronRight className="size-4 text-muted-foreground" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
