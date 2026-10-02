import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    loading: vi.fn(() => "t"),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  }),
}));
vi.mock("@capacitor/app-launcher", () => ({ AppLauncher: { openUrl: vi.fn(async () => ({ completed: true })) } }));

const SITIO = "https://crm.efameinsa.com";

function ponerEntorno(userAgent: string) {
  const assign = vi.fn();
  vi.stubGlobal("navigator", { userAgent });
  vi.stubGlobal("window", { location: { href: `${SITIO}/comercial`, origin: SITIO, assign } });
  return { assign };
}

describe("esApp / versionDeLaApp", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reconoce la marca que la app agrega al User-Agent", async () => {
    ponerEntorno("Mozilla/5.0 (Linux; Android 15) Chrome/130 Mobile Safari/537.36 EfameinsaApp/1.2.3");
    const { esApp, versionDeLaApp } = await import("./nativo");
    expect(esApp()).toBe(true);
    expect(versionDeLaApp()).toBe("1.2.3");
  });

  it("no se activa en el navegador, en la PWA ni en el iPhone", async () => {
    const { esApp, versionDeLaApp } = await import("./nativo");
    for (const ua of [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1",
      "Mozilla/5.0 (Linux; Android 15) Chrome/130 Mobile Safari/537.36",
    ]) {
      ponerEntorno(ua);
      expect(esApp()).toBe(false);
      expect(versionDeLaApp()).toBeNull();
    }
  });
});

describe("enrutarApertura (qué pasa con lo que antes era «pestaña nueva»)", () => {
  let entorno: { assign: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    entorno = ponerEntorno("EfameinsaApp/1.0.0");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("WhatsApp, teléfono y correo se abren fuera de la app", async () => {
    const { enrutarApertura } = await import("./nativo");
    const { AppLauncher } = await import("@capacitor/app-launcher");
    const abiertas = () => vi.mocked(AppLauncher.openUrl).mock.calls.map((c) => c[0].url);
    // Una por una: el cargador de módulos de las pruebas no resuelve bien tres import() a la vez.
    const urls = ["https://wa.me/51923421229?text=Hola", "tel:+5115041695", "mailto:central@efameinsa.com"];
    for (const [i, url] of urls.entries()) {
      expect(enrutarApertura(url)).toBe(true);
      await vi.waitFor(() => expect(abiertas()).toHaveLength(i + 1));
    }
    expect(abiertas()).toEqual(urls);
    expect(entorno.assign).not.toHaveBeenCalled();
  });

  it("otra web se abre fuera; una pantalla del CRM, en la misma ventana", async () => {
    const { enrutarApertura } = await import("./nativo");
    expect(enrutarApertura("https://www.efameinsa.com/tienda")).toBe(true);
    expect(entorno.assign).not.toHaveBeenCalled();
    expect(enrutarApertura("/comercial/oportunidades?origen=central")).toBe(true);
    expect(entorno.assign).toHaveBeenCalledWith(`${SITIO}/comercial/oportunidades?origen=central`);
  });

  it("un documento de /api no navega: lo pide el puente con la sesión", async () => {
    const { enrutarApertura } = await import("./nativo");
    const pedidos: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      pedidos.push(url);
      return new Response("", { status: 404 });
    }));
    expect(enrutarApertura("/api/cotizaciones/abc/pdf")).toBe(true);
    await vi.waitFor(() => expect(pedidos).toEqual(["/api/cotizaciones/abc/pdf"]));
    expect(entorno.assign).not.toHaveBeenCalled();
  });

  it("una dirección que no se entiende no es asunto del puente", async () => {
    const { enrutarApertura } = await import("./nativo");
    expect(enrutarApertura("javascript:alert(1)")).toBe(false);
  });
});

describe("worker de pdf.js", () => {
  it("la copia de public/vendor es la de la versión instalada de pdfjs-dist", () => {
    const raiz = join(__dirname, "..", "..");
    const copia = readFileSync(join(raiz, "public", "vendor", "pdf.worker.min.mjs"));
    const instalada = readFileSync(join(raiz, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.min.mjs"));
    // Si falla: cp node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs public/vendor/
    expect(copia.equals(instalada)).toBe(true);
  });
});
