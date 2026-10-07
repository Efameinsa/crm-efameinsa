import { describe, expect, it } from "vitest";
import { armarCorreo, armarCorreoTexto, escaparHtml, urlSegura } from "./plantilla";

const base = { titulo: "Apertura por confirmar · HOTEL <b>X</b>", parrafos: ["Línea uno & dos", "Segunda\nlínea"] };

describe("armarCorreo (HTML de correo con la marca)", () => {
  it("escapa el texto que viene de afuera", () => {
    const h = armarCorreo({ ...base, tabla: [{ etiqueta: "Cliente", valor: '<script>alert("x")</script>' }], nota: "<i>nota</i>" });
    expect(h).not.toContain("<script>");
    expect(h).not.toContain("<b>X</b>");
    expect(h).toContain("&lt;b&gt;X&lt;/b&gt;");
    expect(h).toContain("Línea uno &amp; dos");
    expect(h).toContain("Segunda<br>línea");
    expect(h).toContain("&lt;i&gt;nota&lt;/i&gt;");
  });

  it("es HTML de correo: tablas y estilos en línea, sin <style>, flex ni grid", () => {
    const h = armarCorreo({ ...base, boton: { texto: "Abrir", url: "https://crm.efameinsa.com/x" }, tabla: [{ etiqueta: "a", valor: "b" }] });
    expect(h).not.toMatch(/<style/i);
    expect(h).not.toMatch(/display:\s*(flex|grid)/i);
    expect(h).not.toMatch(/var\(--/);
    expect(h).toContain('role="presentation"');
    expect(h).toContain('width="600"');
    expect(h).toContain("max-width:600px");
  });

  it("el logo cambia por empresa y tiene tamaño fijo", () => {
    const efa = armarCorreo({ titulo: "t" });
    expect(efa).toContain("https://crm.efameinsa.com/logo-efameinsa.png");
    expect(efa).toMatch(/<img[^>]*width="200"[^>]*height="33"[^>]*alt="Corporación Efameinsa"/);
    const open = armarCorreo({ titulo: "t", empresa: "OPEN" });
    expect(open).toContain("OPEN INVESTMENTS S.A.C.");
    expect(open).not.toContain("logo-efameinsa.png");
  });

  it("el botón solo acepta https", () => {
    expect(armarCorreo({ titulo: "t", boton: { texto: "Ir", url: "https://crm.efameinsa.com/a?b=1&c=2" } })).toContain('href="https://crm.efameinsa.com/a?b=1&amp;c=2"');
    for (const mala of ["http://x.com", "javascript:alert(1)", "data:text/html,hola", "//x.com", "https://x.com/a\"onclick=\"x", ""]) {
      expect(armarCorreo({ titulo: "t", boton: { texto: "Ir", url: mala } })).not.toContain("<a href");
    }
    expect(urlSegura("https://a.com/b c")).toBeNull();
  });

  it("lleva el texto oculto de vista previa y la firma por defecto", () => {
    const h = armarCorreo({ titulo: "t", preheader: "Resumen visible en Gmail" });
    expect(h).toContain("Resumen visible en Gmail");
    expect(h).toContain("display:none");
    expect(h).toContain("(01) 504-1695");
    expect(armarCorreo({ titulo: "t", firma: null })).not.toContain("(01) 504-1695");
  });

  it("deja pasar el contenido de confianza sin tocarlo", () => {
    expect(armarCorreo({ titulo: "t", contenidoHtml: '<table id="visita"><tr><td>FECHA</td></tr></table>' })).toContain('<table id="visita"><tr><td>FECHA</td></tr></table>');
  });

  it("escaparHtml cubre comillas", () => {
    expect(escaparHtml(`a"b'c<d>&`)).toBe("a&quot;b&#39;c&lt;d&gt;&amp;");
  });
});

describe("armarCorreoTexto", () => {
  it("trae lo mismo en texto plano", () => {
    const t = armarCorreoTexto({
      pretitulo: "Finanzas",
      titulo: "Guía autorizada",
      parrafos: ["El almacén ya puede emitirla."],
      tabla: [{ etiqueta: "Cliente", valor: "HOTEL X\nLima" }],
      boton: { texto: "Abrir en el CRM", url: "https://crm.efameinsa.com/a" },
    });
    expect(t).toContain("FINANZAS");
    expect(t).toContain("Cliente: HOTEL X / Lima");
    expect(t).toContain("Abrir en el CRM: https://crm.efameinsa.com/a");
    expect(t).toContain("(01) 504-1695");
    expect(t).not.toMatch(/<[a-z]/i);
  });
});
