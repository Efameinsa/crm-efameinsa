import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/enlace", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) =>
    createElement("a", { href, className }, children),
}));

const { TextoAsistente } = await import("@/components/crm/texto-asistente");
const html = (t: string) => renderToStaticMarkup(createElement(TextoAsistente, { texto: t }));

describe("TextoAsistente", () => {
  it("negrita con formato por dentro no cuelga la página (14-10)", () => {
    const t0 = Date.now();
    const h = html("**Lavadoras 1 a 4** (ADC *EWS80MR*) y **la de *17 kg* lista** y ***las dos***");
    expect(Date.now() - t0).toBeLessThan(500);
    expect(h).toContain("<strong");
    expect(h).toContain("<em>EWS80MR</em>");
    expect(h).toContain("<em>17 kg</em>");
  });

  it("negrita con espacios por dentro y cursiva de un asterisco", () => {
    const h = html("Estado: ** Pago parcial ** y el tambor (*tumbler*).");
    expect(h).toMatch(/<strong[^>]*>Pago parcial<\/strong>/);
    expect(h).toContain("<em>tumbler</em>");
    expect(h).not.toContain("**");
  });

  it("no toma por formato una multiplicación ni un guion bajo dentro de palabra", () => {
    const h = html("5 * 3 * 2 = 30 y el campo precio_lista");
    expect(h).not.toContain("<em>");
    expect(h).toContain("precio_lista");
  });

  it("tabla con encabezado y filas", () => {
    const h = html("| Máquina | Le falta |\n|---|---|\n| Lavadora 1 | **fotos** |\n| Secadora 5 | PDF |\n\nDespués de la tabla.");
    expect(h).toContain("<table");
    expect(h).toContain("<th");
    expect(h.match(/<tr/g)?.length).toBe(3);
    expect(h).toContain("Después de la tabla.");
  });

  it("listas numeradas, anidadas y títulos", () => {
    const h = html("### Qué falta\n1. Subir fotos\n   - de cada máquina\n2. Marcar el técnico\n\n- suelta");
    expect(h).toContain("<ol");
    expect(h).toContain("<ul");
    expect(h).toContain("de cada máquina");
    expect(h).toContain("font-bold");
  });

  it("solo enlaza rutas internas del CRM", () => {
    const h = html("Vea [el pedido](/almacen/pedidos/1) o [esto](https://otro.sitio/x)");
    expect(h).toContain('href="/almacen/pedidos/1"');
    expect(h).not.toContain("otro.sitio/x\"");
  });

  it("texto largo con muchos formatos termina rápido", () => {
    const largo = Array.from({ length: 300 }, (_, i) => `- **Ítem ${i}** con *detalle* y \`código\` | x`).join("\n");
    const t0 = Date.now();
    html(largo);
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});
