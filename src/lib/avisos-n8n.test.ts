import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enviarCorreoN8n } from "./avisos-n8n";

const correo = { para: "x@efameinsa.com", asunto: "Prueba", html: "<p>hola</p>" };
const respuesta = (status: number, cuerpo?: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo ?? {} }) as unknown as Response;

describe("enviarCorreoN8n: gestion1@ y la Gmail de respaldo (07-10)", () => {
  let fetchSim: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv("N8N_LEAD_WEBHOOK_URL", "http://127.0.0.1:5678/webhook/crm-lead-nuevo");
    vi.stubEnv("N8N_WEBHOOK_SECRET", "secreto");
    vi.stubEnv("CORREO_REMITENTE", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchSim = vi.fn();
    vi.stubGlobal("fetch", fetchSim);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const urls = () => fetchSim.mock.calls.map((c) => String(c[0]));

  it("si gestion1@ lo manda, no toca la Gmail", async () => {
    fetchSim.mockResolvedValueOnce(respuesta(200, { ok: true, messageId: "<a@efameinsa.com>" }));
    expect(await enviarCorreoN8n(correo)).toEqual({ error: null, por: "gestion1" });
    expect(urls()).toEqual(["http://127.0.0.1:5678/webhook/crm-correo-gestion1"]);
  });

  it("si gestion1@ responde 502, sale por la Gmail", async () => {
    fetchSim.mockResolvedValueOnce(respuesta(502, { ok: false, error: "auth" })).mockResolvedValueOnce(respuesta(200));
    expect(await enviarCorreoN8n(correo)).toEqual({ error: null, por: "gmail" });
    expect(urls()).toEqual(["http://127.0.0.1:5678/webhook/crm-correo-gestion1", "http://127.0.0.1:5678/webhook/crm-correo"]);
  });

  it("si gestion1@ no contesta (red), sale por la Gmail", async () => {
    fetchSim.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(respuesta(200));
    expect((await enviarCorreoN8n(correo)).por).toBe("gmail");
  });

  it("un 200 sin ok:true no cuenta como enviado", async () => {
    fetchSim.mockResolvedValueOnce(respuesta(200, {})).mockResolvedValueOnce(respuesta(200));
    expect((await enviarCorreoN8n(correo)).por).toBe("gmail");
  });

  it("si fallan las dos vías, devuelve el error", async () => {
    fetchSim.mockResolvedValueOnce(respuesta(502, { ok: false })).mockResolvedValueOnce(respuesta(500));
    expect(await enviarCorreoN8n(correo)).toEqual({ error: "El correo no salió (500)" });
  });

  it("CORREO_REMITENTE=gmail va directo a la Gmail", async () => {
    vi.stubEnv("CORREO_REMITENTE", "gmail");
    fetchSim.mockResolvedValueOnce(respuesta(200));
    expect((await enviarCorreoN8n(correo)).por).toBe("gmail");
    expect(urls()).toEqual(["http://127.0.0.1:5678/webhook/crm-correo"]);
  });

  it("manda el nombre, cc y cco solo a gestion1@", async () => {
    fetchSim.mockResolvedValueOnce(respuesta(200, { ok: true }));
    await enviarCorreoN8n({ ...correo, deNombre: "EFAMEINSA · Postventa", cco: "gestion1@efameinsa.com" });
    const cuerpo = JSON.parse(String(fetchSim.mock.calls[0][1].body));
    expect(cuerpo).toMatchObject({ de_nombre: "EFAMEINSA · Postventa", cco: "gestion1@efameinsa.com", secreto: "secreto" });
  });

  it("sin configuración, no intenta nada", async () => {
    vi.stubEnv("N8N_LEAD_WEBHOOK_URL", "");
    expect((await enviarCorreoN8n(correo)).error).toMatch(/no está configurado/);
    expect(fetchSim).not.toHaveBeenCalled();
  });
});
