// Espera a que el despliegue del commit SHA=xxxxxxx esté READY en Vercel:
//   SHA=abc1234 node --env-file=.env.local scripts/_esperar-despliegue.mjs
const H = { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` };
const PRJ = "prj_7C0VvRlSJWtHZHYXMT2Am0sYBfKe";
for (let i = 0; i < 60; i++) {
  const r = await (await fetch(`https://api.vercel.com/v6/deployments?projectId=${PRJ}&limit=5`, { headers: H })).json();
  const d = (r.deployments ?? []).find((x) => (x.meta?.githubCommitSha ?? "").startsWith(process.env.SHA));
  const ahora = new Date().toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" });
  if (!d) console.log(`${ahora} aún no aparece el despliegue de ${process.env.SHA} (último: ${r.deployments?.[0]?.meta?.githubCommitSha?.slice(0,7)} ${r.deployments?.[0]?.state})`);
  else {
    console.log(`${ahora} ${d.state} ${d.url}`);
    if (d.state === "READY") { console.log("LISTO en producción."); process.exit(0); }
    if (d.state === "ERROR" || d.state === "CANCELED") { console.log("FALLÓ el build. Revisar en Vercel."); process.exit(1); }
  }
  await new Promise((res) => setTimeout(res, 15000));
}
console.log("No terminó en 15 minutos."); process.exit(1);
