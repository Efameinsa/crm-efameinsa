import { createClient } from "@/lib/supabase/client";
import { COOKIE_DEMO } from "@/lib/solo-lectura";
import { urlSupabaseNavegador } from "@/lib/supabase/urls";

/**
 * SUBIR UN ARCHIVO AL BUCKET CON SU AVANCE (Ariana, almacén 15-10: «no sabe
 * cuánto demora en subir las imágenes… debería tener su propia barrita de
 * carga para que no recargue la página por desesperada y pierda todo»).
 * storage.upload() no informa el avance; esto hace el mismo POST con XHR, que
 * sí lo da. La cuenta de demostración sigue por el cliente normal (solo lectura).
 */
export async function subirConProgreso(
  bucket: string,
  path: string,
  file: File,
  tipo: string,
  alAvanzar: (fraccion: number) => void,
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const demo = document.cookie.split("; ").includes(`${COOKIE_DEMO}=1`);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (demo || !token) {
    const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: tipo });
    alAvanzar(1);
    return { error: error?.message ?? null };
  }
  const url = `${urlSupabaseNavegador()}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
  return new Promise((resolver) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    xhr.setRequestHeader("Content-Type", tipo);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && ev.total > 0) alAvanzar(Math.min(0.99, ev.loaded / ev.total));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        alAvanzar(1);
        resolver({ error: null });
        return;
      }
      let mensaje = `error ${xhr.status}`;
      try {
        const cuerpo = JSON.parse(xhr.responseText);
        mensaje = cuerpo.message ?? cuerpo.error ?? mensaje;
      } catch {}
      resolver({ error: mensaje });
    };
    xhr.onerror = () => resolver({ error: "se cortó la conexión" });
    xhr.send(file);
  });
}
