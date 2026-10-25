import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(URL_, SR, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ingest-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function sha256(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function merge(a: any, b: any): any {
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const o: any = { ...a };
    for (const k of Object.keys(b)) o[k] = k in a ? merge(a[k], b[k]) : b[k];
    return o;
  }
  return b;
}
async function op(o: any) {
  const { tipo, col, id, data } = o;
  if (!col || !id) throw new Error("col/id");
  if (tipo === "set") {
    const { error } = await admin.from("docs").upsert({ col, id, data, updated_at: new Date().toISOString(), updated_by: null });
    if (error) throw error;
  } else if (tipo === "update" || tipo === "merge") {
    const { data: cur, error: e1 } = await admin.from("docs").select("data").eq("col", col).eq("id", id).maybeSingle();
    if (e1) throw e1;
    if (!cur && tipo === "update") throw new Error("not_found " + col + "/" + id);
    const { error } = await admin.from("docs").upsert({ col, id, data: merge(cur ? cur.data : {}, data), updated_at: new Date().toISOString(), updated_by: null });
    if (error) throw error;
  } else if (tipo === "delete") {
    const { error } = await admin.from("docs").delete().eq("col", col).eq("id", id);
    if (error) throw error;
  } else throw new Error("tipo");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const u = new URL(req.url);
  const accion = u.searchParams.get("accion") || "";
  try {
    // ---------- Acceso para Claude (migración y tareas automáticas) ----------
    const tok = req.headers.get("x-ingest-token");
    if (tok) {
      const { data: ok } = await admin.rpc("ingest_ok", { p_hash: await sha256(tok) });
      if (!ok) return json({ error: "token" }, 401);
      if (accion === "subir") {
        const path = u.searchParams.get("path")!;
        const type = u.searchParams.get("type") || "application/octet-stream";
        const body = new Uint8Array(await req.arrayBuffer());
        const { error } = await admin.storage.from("files").upload(path, body, { contentType: type, upsert: true });
        if (error) throw error;
        return json({ ok: true, path });
      }
      if (accion === "leer") {
        const col = u.searchParams.get("col")!;
        const id = u.searchParams.get("id");
        let q = admin.from("docs").select("id,data,updated_at").eq("col", col);
        if (id) q = q.eq("id", id);
        const { data, error } = await q;
        if (error) throw error;
        return json({ docs: data });
      }
      if (accion === "lote") {
        const b = await req.json();
        const ops = Array.isArray(b) ? b : b.ops;
        let n = 0;
        for (const o of ops) { await op(o); n++; }
        return json({ ok: true, n });
      }
      return json({ error: "accion" }, 400);
    }

    // ---------- Acciones del dueño de la app ----------
    const auth = req.headers.get("authorization") || "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    const { data: ud, error: ue } = await admin.auth.getUser(jwt);
    if (ue || !ud.user) return json({ error: "Inicia sesión de nuevo." }, 401);
    if (accion === "leerContratos") {
      // Pone en marcha la tarea «Lectura de contratos» (solo si hay una lectura pedida)
      const b0 = await req.json().catch(() => ({}));
      const jid = String(b0.jid || "");
      const { data: c } = await admin.from("docs").select("data").eq("col", "privado/contratos/items").eq("id", jid).maybeSingle();
      if (!c || !c.data || !c.data.lectura || c.data.lectura.estado !== "pendiente") return json({ error: "No hay ninguna lectura pedida para este jugador." }, 400);
      const furl = Deno.env.get("ROUTINE_FIRE_URL"), ftok = Deno.env.get("ROUTINE_FIRE_TOKEN");
      if (!furl || !ftok) return json({ error: "sin_token" }, 503);
      const r = await fetch(furl, { method: "POST", headers: { Authorization: "Bearer " + ftok, "anthropic-version": "2026-10-21", "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Lectura pedida desde la app (botón «Leer con Claude») para el jugador con id " + jid + "." }) });
      if (!r.ok) { const t = await r.text(); console.error("fire", r.status, t); return json({ error: r.status === 429 ? "Demasiadas lecturas en la última hora; prueba más tarde." : "No se pudo poner en marcha la lectura (" + r.status + ")." }, 502); }
      return json({ ok: true });
    }
    const email = (ud.user.email || "").toLowerCase();
    const { data: own } = await admin.from("app_owners").select("email").eq("email", email).maybeSingle();
    if (!own) return json({ error: "Solo Josemi puede hacer esto." }, 403);
    const b = await req.json().catch(() => ({}));
    if (accion === "crearUsuario") {
      const em = String(b.email || "").trim().toLowerCase();
      const pw = String(b.password || "");
      if (!em || pw.length < 8) return json({ error: "Falta el correo o la contraseña (mínimo 8 caracteres)." }, 400);
      const { data, error } = await admin.auth.admin.createUser({ email: em, password: pw, email_confirm: true });
      if (error) {
        if (/already|registered|exists/i.test(error.message)) {
          const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const ex = list?.users.find((x) => (x.email || "").toLowerCase() === em);
          if (ex) {
            const { error: e2 } = await admin.auth.admin.updateUserById(ex.id, { password: pw, email_confirm: true });
            if (e2) throw e2;
            return json({ ok: true, id: ex.id, existia: true });
          }
        }
        throw error;
      }
      return json({ ok: true, id: data.user!.id });
    }
    if (accion === "usuarios") {
      const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      return json({ usuarios: (data?.users || []).map((x) => ({ id: x.id, email: x.email, ultimo: x.last_sign_in_at })) });
    }
    return json({ error: "accion" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
