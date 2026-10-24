"use client";

// «← Volver al pedido» del informe (Santos 24-10: Lesly pulsó «atrás» y se fue
// lejos, no a donde estaba). El informe se abre en otra pestaña desde el pedido:
// si esa pestaña sigue abierta, se vuelve a ella (y se pone al día sola) y esta
// se cierra. Si no, se va al pedido de su área: almacén a /almacen/pedidos.

export function VolverAlPedido({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="text-xs text-muted-foreground hover:underline"
      onClick={(ev) => {
        try {
          const origen = window.opener as Window | null;
          if (origen && !origen.closed && origen.location.origin === window.location.origin && origen.location.pathname.includes("/pedidos/")) {
            ev.preventDefault();
            origen.focus();
            window.close();
          }
        } catch {
          // Otra ventana u otro sitio: se sigue el enlace.
        }
      }}
    >
      {children}
    </a>
  );
}
