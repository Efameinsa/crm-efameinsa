import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, statSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

import { AUDIO_MAX_BYTES, extensionDeAudio, guardarAudio, LlamadaSchema, raizLlamadas, rutaEnDisco, tipoDeExtension } from "./llamadas-servidor";

let raiz: string;
beforeEach(() => {
  raiz = mkdtempSync(path.join(tmpdir(), "llamadas-prueba-"));
  vi.stubEnv("LLAMADAS_DIR", raiz);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(raiz, { recursive: true, force: true });
});

describe("raizLlamadas", () => {
  it("sin la variable, la función está apagada (copia de la nube)", () => {
    vi.stubEnv("LLAMADAS_DIR", "");
    expect(raizLlamadas()).toBeNull();
    expect(rutaEnDisco("por-dia/2026/10/a.ogg")).toBeNull();
  });
});

describe("rutaEnDisco", () => {
  it("una ruta normal queda dentro de la raíz", () => {
    expect(rutaEnDisco("por-dia/2026/10/2026-10-19/a.ogg")).toBe(path.join(raiz, "por-dia", "2026", "10", "2026-10-19", "a.ogg"));
  });
  it("no deja salirse de la raíz", () => {
    expect(rutaEnDisco("../fuera.txt")).toBeNull();
    expect(rutaEnDisco("por-dia/../../fuera.txt")).toBeNull();
    expect(rutaEnDisco("/etc/passwd")).toBeNull();
    expect(rutaEnDisco("C:\\Windows\\win.ini")).toBeNull();
  });
  it("la raíz misma o vacío no son un archivo", () => {
    expect(rutaEnDisco("")).toBeNull();
    expect(rutaEnDisco(".")).toBeNull();
  });
});

describe("extensionDeAudio", () => {
  it("los formatos admitidos, con o sin parámetros", () => {
    expect(extensionDeAudio("audio/ogg")).toBe("ogg");
    expect(extensionDeAudio("audio/mp4; codecs=mp4a.40.2")).toBe("m4a");
    expect(extensionDeAudio("AUDIO/X-MATROSKA")).toBe("mka");
    expect(tipoDeExtension("m4a")).toBe("audio/mp4");
  });
  it("lo demás se rechaza", () => {
    expect(extensionDeAudio("application/pdf")).toBeNull();
    expect(extensionDeAudio("text/html")).toBeNull();
    expect(extensionDeAudio(null)).toBeNull();
  });
});

describe("guardarAudio", () => {
  const datos = new Uint8Array([1, 2, 3, 4, 5]);
  const base = { carpetaDia: "por-dia/2026/10/2026-10-19", carpetaCliente: "por-cliente/LAVANDERIA-EL-SOL_20601234567", nombre: "2026-10-19_15h42_C5-Santos_LAVANDERIA-EL-SOL_987654321_3m25s", extension: "ogg", datos };

  it("escribe en por-dia y deja el MISMO archivo en por-cliente", async () => {
    const { ruta } = await guardarAudio(base);
    expect(ruta).toBe("por-dia/2026/10/2026-10-19/2026-10-19_15h42_C5-Santos_LAVANDERIA-EL-SOL_987654321_3m25s.ogg");
    const enDia = path.join(raiz, ruta);
    const enCliente = path.join(raiz, "por-cliente/LAVANDERIA-EL-SOL_20601234567", path.basename(ruta));
    expect([...readFileSync(enDia)]).toEqual([1, 2, 3, 4, 5]);
    expect([...readFileSync(enCliente)]).toEqual([1, 2, 3, 4, 5]);
    // Enlace duro: mismo inodo, no una copia que ocupe el doble.
    expect(statSync(enDia).ino).toBe(statSync(enCliente).ino);
  });

  it("no deja un temporal a medias", async () => {
    const { ruta } = await guardarAudio(base);
    expect(existsSync(path.join(raiz, `${ruta}.parte`))).toBe(false);
  });

  it("subir de nuevo la misma llamada reemplaza sin fallar", async () => {
    await guardarAudio(base);
    const { ruta } = await guardarAudio({ ...base, datos: new Uint8Array([9, 9]) });
    expect([...readFileSync(path.join(raiz, ruta))]).toEqual([9, 9]);
    expect([...readFileSync(path.join(raiz, "por-cliente/LAVANDERIA-EL-SOL_20601234567", path.basename(ruta)))]).toEqual([9, 9]);
  });

  it("sin raíz configurada, falla claro y no escribe", async () => {
    vi.stubEnv("LLAMADAS_DIR", "");
    await expect(guardarAudio(base)).rejects.toThrow(/LLAMADAS_DIR/);
  });
});

describe("LlamadaSchema", () => {
  const ok = { id: "6f1c2f2e-3b0a-4a5e-9c4d-0a1b2c3d4e5f", numero: "987 654 321", iniciada_at: "2026-10-19T20:42:10.000Z", duracion_s: 205 };
  it("acepta lo que manda el celular y completa el origen", () => {
    const r = LlamadaSchema.safeParse(ok);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.origen).toBe("app");
  });
  it("con la hora en -05:00 también", () => {
    expect(LlamadaSchema.safeParse({ ...ok, iniciada_at: "2026-10-19T15:42:10-05:00" }).success).toBe(true);
  });
  it("rechaza id no uuid, duración negativa o absurda, hora sin zona", () => {
    expect(LlamadaSchema.safeParse({ ...ok, id: "123" }).success).toBe(false);
    expect(LlamadaSchema.safeParse({ ...ok, duracion_s: -1 }).success).toBe(false);
    expect(LlamadaSchema.safeParse({ ...ok, duracion_s: 99999 }).success).toBe(false);
    expect(LlamadaSchema.safeParse({ ...ok, iniciada_at: "2026-10-19 15:42" }).success).toBe(false);
  });
  it("el estado del audio solo admite lo que el celular puede saber", () => {
    expect(LlamadaSchema.safeParse({ ...ok, estado_audio: "no_encontrado" }).success).toBe(true);
    expect(LlamadaSchema.safeParse({ ...ok, estado_audio: "subido" }).success).toBe(false);
  });
});

describe("tope de audio", () => {
  it("100 MB", () => expect(AUDIO_MAX_BYTES).toBe(100 * 1024 * 1024));
});
