import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

// La puerta del GPS del celular (0367; Carlos vía Santos, 01-10-2026), con
// una base de mentira: qué se escribe, qué no y qué se le responde a la app.

const TOKEN = "k7pxm-3hq9r-abcde-23456";
const BASE = "https://crm.efameinsa.com/api/campo/osmand";

interface Fila {
  dispositivo_id: string;
  registrada_at: string;
  [k: string]: unknown;
}

const db = {
  dispositivos: [] as { id: string; user_id: string; token: string; activo: boolean; trabajo_de_campo: boolean }[],
  ubicaciones: [] as Fila[],
  marcas: [] as string[],
  fallarInsert: false,
  consultas: 0,
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabla: string) {
      if (tabla === "dispositivos_campo") {
        const filtros: Record<string, unknown> = {};
        const b = {
          select: () => b,
          eq: (k: string, v: unknown) => {
            filtros[k] = v;
            return b;
          },
          maybeSingle: async () => {
            db.consultas++;
            const d = db.dispositivos.find((x) => x.token === filtros.token && x.activo === filtros.activo);
            return { data: d ? { id: d.id, user_id: d.user_id, perfiles: { trabajo_de_campo: d.trabajo_de_campo } } : null, error: null };
          },
          update: (v: { ultimo_envio_at: string }) => ({
            eq: async () => {
              db.marcas.push(v.ultimo_envio_at);
              return { error: null };
            },
          }),
        };
        return b;
      }
      if (tabla === "ubicaciones_campo") {
        return {
          upsert: async (filas: Fila[], opciones: { onConflict: string; ignoreDuplicates: boolean }) => {
            expect(opciones).toEqual({ onConflict: "dispositivo_id,registrada_at", ignoreDuplicates: true });
            if (db.fallarInsert) return { error: { message: "base caída" } };
            for (const f of filas) {
              if (!db.ubicaciones.some((u) => u.dispositivo_id === f.dispositivo_id && u.registrada_at === f.registrada_at)) {
                db.ubicaciones.push(f);
              }
            }
            return { error: null };
          },
        };
      }
      throw new Error(`tabla inesperada ${tabla}`);
    },
  }),
}));

async function ruta() {
  vi.resetModules();
  return import("./route");
}

const hace = (s: number) => new Date(Date.now() - s * 1000);

beforeEach(() => {
  db.dispositivos = [{ id: "d1", user_id: "brenda", token: TOKEN, activo: true, trabajo_de_campo: true }];
  db.ubicaciones = [];
  db.marcas = [];
  db.fallarInsert = false;
  db.consultas = 0;
});

describe("GET /api/campo/osmand (app clásica)", () => {
  test("token válido: guarda la posición con origen app y responde 200 sin cuerpo", async () => {
    const { GET } = await ruta();
    const t = Math.floor(hace(30).getTime() / 1000);
    const r = await GET(new NextRequest(`${BASE}?id=${TOKEN}&lat=-12.05&lon=-77.04&timestamp=${t}&accuracy=5&speed=10&batt=80`));
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("");
    expect(db.ubicaciones).toHaveLength(1);
    expect(db.ubicaciones[0]).toMatchObject({
      user_id: "brenda",
      dispositivo_id: "d1",
      origen: "app",
      estado: "ok",
      lat: -12.05,
      lon: -77.04,
      precision_m: 5,
      bateria: 80,
      registrada_at: new Date(t * 1000).toISOString(),
    });
    expect(db.marcas).toHaveLength(1);
  });

  test("token en mayúsculas también vale (se tipea en el celular)", async () => {
    const { GET } = await ruta();
    const r = await GET(new NextRequest(`${BASE}?id=${TOKEN.toUpperCase()}&lat=-12.05&lon=-77.04`));
    expect(r.status).toBe(200);
    expect(db.ubicaciones).toHaveLength(1);
  });

  test("token desconocido, mal formado, desactivado o persona fuera del piloto: 404 y nada escrito", async () => {
    const { GET } = await ruta();
    db.dispositivos.push(
      { id: "d2", user_id: "x", token: "aaaaa-bbbbb-ccccc-ddddd", activo: false, trabajo_de_campo: true },
      { id: "d3", user_id: "y", token: "eeeee-fffff-ggggg-hhhhh", activo: true, trabajo_de_campo: false },
    );
    for (const id of ["zzzzz-zzzzz-zzzzz-zzzzz", "123", "", "aaaaa-bbbbb-ccccc-ddddd", "eeeee-fffff-ggggg-hhhhh"]) {
      const r = await GET(new NextRequest(`${BASE}?id=${id}&lat=-12.05&lon=-77.04`));
      expect(r.status, id).toBe(404);
      expect(await r.text()).toBe("");
    }
    expect(db.ubicaciones).toHaveLength(0);
    // El mal formado ni se busca en la base.
    expect(db.consultas).toBe(3);
  });

  test("la misma posición reenviada (la app reintenta) entra una sola vez", async () => {
    const { GET } = await ruta();
    const url = `${BASE}?id=${TOKEN}&lat=-12.05&lon=-77.04&timestamp=${Math.floor(hace(60).getTime() / 1000)}`;
    expect((await GET(new NextRequest(url))).status).toBe(200);
    expect((await GET(new NextRequest(url))).status).toBe(200);
    expect(db.ubicaciones).toHaveLength(1);
    // Y la base se consultó una vez: la segunda salió de la memoria.
    expect(db.consultas).toBe(1);
  });

  test("punto imposible con token válido: 200 (que no lo reintente) y nada escrito", async () => {
    const { GET } = await ruta();
    const r = await GET(new NextRequest(`${BASE}?id=${TOKEN}&lat=0&lon=0`));
    expect(r.status).toBe(200);
    expect(db.ubicaciones).toHaveLength(0);
  });

  test("base caída: 500 para que la app guarde el punto y reintente", async () => {
    const { GET } = await ruta();
    db.fallarInsert = true;
    const r = await GET(new NextRequest(`${BASE}?id=${TOKEN}&lat=-12.05&lon=-77.04`));
    expect(r.status).toBe(500);
  });

  test("quien prueba tokens al azar se frena con 429", async () => {
    const { GET } = await ruta();
    const estados: number[] = [];
    for (let i = 0; i < 25; i++) {
      const r = await GET(new NextRequest(`${BASE}?id=zzzzz-zzzzz-zzzzz-zz${String(i).padStart(3, "2")}&lat=-12&lon=-77`, { headers: { "cf-connecting-ip": "200.1.1.1" } }));
      estados.push(r.status);
    }
    expect(estados.slice(0, 20).every((s) => s === 404)).toBe(true);
    expect(estados.slice(20).every((s) => s === 429)).toBe(true);
  });
});

describe("POST /api/campo/osmand", () => {
  test("app nueva: JSON con device_id y location; un lote con repetidos", async () => {
    const { POST } = await ruta();
    const loc = (seg: number) => ({
      timestamp: hace(seg).toISOString(),
      coords: { latitude: -12.09, longitude: -77.02, accuracy: 4, speed: 8.3, heading: 90 },
      battery: { level: 0.5 },
      is_moving: true,
    });
    const r = await POST(
      new NextRequest(BASE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ device_id: TOKEN, location: [loc(120), loc(60), loc(60)] }),
      }),
    );
    expect(r.status).toBe(200);
    expect(db.ubicaciones).toHaveLength(2);
    expect(db.ubicaciones[0]).toMatchObject({ origen: "app", bateria: 50, velocidad_mps: 8.3, rumbo: 90, detalle: "en movimiento" });
  });

  test("JSON sin content-type también se entiende", async () => {
    const { POST } = await ruta();
    const r = await POST(
      new NextRequest(BASE, {
        method: "POST",
        body: JSON.stringify({ device_id: TOKEN, location: { coords: { latitude: -12.09, longitude: -77.02 } } }),
      }),
    );
    expect(r.status).toBe(200);
    expect(db.ubicaciones).toHaveLength(1);
  });

  test("app clásica: POST con los parámetros en la URL y cuerpo vacío, o en formulario", async () => {
    const { POST } = await ruta();
    const r1 = await POST(new NextRequest(`${BASE}?id=${TOKEN}&lat=-12.05&lon=-77.04&timestamp=${Math.floor(hace(10).getTime() / 1000)}`, { method: "POST" }));
    expect(r1.status).toBe(200);
    const r2 = await POST(
      new NextRequest(BASE, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `id=${TOKEN}&lat=-12.06&lon=-77.05&timestamp=${Math.floor(hace(5).getTime() / 1000)}`,
      }),
    );
    expect(r2.status).toBe(200);
    expect(db.ubicaciones.map((u) => u.lat)).toEqual([-12.05, -12.06]);
  });

  test("JSON roto: 400; token inválido en JSON: 404", async () => {
    const { POST } = await ruta();
    expect((await POST(new NextRequest(BASE, { method: "POST", headers: { "content-type": "application/json" }, body: "{roto" }))).status).toBe(400);
    expect(
      (
        await POST(
          new NextRequest(BASE, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ device_id: "nadie", location: { coords: { latitude: -12, longitude: -77 } } }),
          }),
        )
      ).status,
    ).toBe(404);
    expect(db.ubicaciones).toHaveLength(0);
  });
});
