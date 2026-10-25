/* ONLY FOOTBALL — capa web: sustituye el entorno de Claude por Supabase (datos, acceso, archivos). */
(function(){
"use strict";
const SB_URL="https://kqbfeztcddpuesygjihg.supabase.co";
const SB_KEY="sb_publishable_rDQ6f_V1f66UA2_aTs9H7w_Zy3JzRT3";
const sb=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,storageKey:"of_auth"}});

/* ---------- utilidades ---------- */
const clone=o=>o==null?o:JSON.parse(JSON.stringify(o));
const isObj=v=>v&&typeof v==="object"&&!Array.isArray(v);
function merge(a,b){if(isObj(a)&&isObj(b)){const o={...a};for(const k of Object.keys(b))o[k]=k in a?merge(a[k],b[k]):clone(b[k]);return o}return clone(b)}
function err(code,msg){const e=new Error(msg||code);e.code=code;return e}
function mapErr(e){if(!e)return e;const m=String(e.message||e);if(/not_found/.test(m))return err("invalid_argument","El documento no existe");if(/row-level security|permission|42501/i.test(m)||e.code==="42501")return err("invalid_argument","Sin permiso");return err("unavailable",m)}
function splitPath(p){const i=p.lastIndexOf("/");return[p.slice(0,i),p.slice(i+1)]}
function rid(n=20){const a=new Uint8Array(n);crypto.getRandomValues(a);return[...a].map(x=>"abcdefghijklmnopqrstuvwxyz0123456789"[x%36]).join("")}

/* ---------- caché en memoria + tiempo real ---------- */
const cache=new Map();      // col -> Map(id -> data)
const loading=new Map();    // col -> Promise
const colSubs=new Map();    // col -> Set(cb)
const docSubs=new Map();    // "col/id" -> Set(cb)
function snapOf(c){const m=cache.get(c)||new Map();const docs=[...m.entries()].map(([id,d])=>({id,exists:true,data:()=>clone(d)}));return{docs,size:docs.length,empty:!docs.length}}
function docSnap(c,id){const m=cache.get(c);const d=m&&m.get(id);return{id,exists:d!==undefined,data:()=>d===undefined?undefined:clone(d)}}
function emit(c,id){const s=colSubs.get(c);if(s)s.forEach(cb=>{try{cb(snapOf(c))}catch(e){console.error(e)}});const k=c+"/"+id;const d=docSubs.get(k);if(d)d.forEach(cb=>{try{cb(docSnap(c,id))}catch(e){console.error(e)}})}
function emitAll(c){const s=colSubs.get(c);if(s)s.forEach(cb=>{try{cb(snapOf(c))}catch(e){console.error(e)}});for(const [k,set] of docSubs){const [cc,id]=splitPath(k);if(cc===c)set.forEach(cb=>{try{cb(docSnap(c,id))}catch(e){console.error(e)}})}}
async function load(c){
  if(cache.has(c))return;
  if(!loading.has(c))loading.set(c,(async()=>{const m=new Map();let from=0;const step=1000;
    for(;;){const {data,error}=await sb.from("docs").select("id,data").eq("col",c).range(from,from+step-1);if(error)throw mapErr(error);data.forEach(r=>m.set(r.id,r.data));if(data.length<step)break;from+=step}
    cache.set(c,m)})().finally(()=>loading.delete(c)));
  return loading.get(c);
}
function applyLocal(c,id,data){const m=cache.get(c);if(!m)return;if(data===undefined)m.delete(id);else m.set(id,data);emit(c,id)}
let channel=null;
function startRealtime(){
  if(channel)return;
  channel=sb.channel("docs-all").on("postgres_changes",{event:"*",schema:"public",table:"docs"},p=>{
    const row=p.eventType==="DELETE"?p.old:p.new;if(!row||!row.col)return;
    if(!cache.has(row.col))return;
    applyLocal(row.col,row.id,p.eventType==="DELETE"?undefined:row.data);
    if(row.col==="miembros")checkMembership();
  }).subscribe(st=>{if(st==="CHANNEL_ERROR"||st==="TIMED_OUT")console.warn("tiempo real:",st)});
}
/* si cambian mis permisos (me dan acceso o me lo quitan), recargo para leerlo todo de nuevo */
let myMemberKey=null;
function memberKey(){const m=cache.get("miembros");if(!m||!ME)return"";for(const [id,d] of m)if(d&&d.userId===ME.id)return id+"|"+(d.activo!==false)+"|"+JSON.stringify(d.permisos||{});return""}
function checkMembership(){const k=memberKey();if(myMemberKey===null){myMemberKey=k;return}if(k!==myMemberKey){myMemberKey=k;setTimeout(()=>location.reload(),600)}}
/* al volver a la app tras un rato, refresco todo por si el tiempo real se cortó */
let hiddenAt=0;
document.addEventListener("visibilitychange",async()=>{if(document.hidden){hiddenAt=Date.now();return}if(Date.now()-hiddenAt<60000)return;for(const c of [...cache.keys()]){cache.delete(c);try{await load(c);emitAll(c)}catch(e){console.warn(e)}}});

/* ---------- API tipo Firestore que espera la app ---------- */
function docRef(c,id){
  return{id,path:c+"/"+id,
    async get(){await load(c);return docSnap(c,id)},
    async set(data){const {error}=await sb.rpc("doc_set",{p_col:c,p_id:id,p_data:data});if(error)throw mapErr(error);applyLocal(c,id,clone(data))},
    async update(data){const {error}=await sb.rpc("doc_update",{p_col:c,p_id:id,p_data:data});if(error)throw mapErr(error);const m=cache.get(c);if(m&&m.has(id))applyLocal(c,id,merge(m.get(id),data))},
    async delete(){const {error}=await sb.from("docs").delete().eq("col",c).eq("id",id);if(error)throw mapErr(error);applyLocal(c,id,undefined)},
    onSnapshot(cb,onErr){const k=c+"/"+id;if(!docSubs.has(k))docSubs.set(k,new Set());docSubs.get(k).add(cb);
      load(c).then(()=>cb(docSnap(c,id))).catch(e=>{console.warn(c,e);onErr&&onErr(e)});
      return()=>docSubs.get(k)&&docSubs.get(k).delete(cb)}
  };
}
const db={
  collection(c){return{
    path:c,
    doc(id){return docRef(c,id||rid())},
    async add(data){const ref=docRef(c,rid());await ref.set(data);return ref},
    async get(){await load(c);return snapOf(c)},
    onSnapshot(cb,onErr){if(!colSubs.has(c))colSubs.set(c,new Set());colSubs.get(c).add(cb);
      load(c).then(()=>{cb(snapOf(c));if(c==="miembros")checkMembership()}).catch(e=>{console.warn(c,e);onErr&&onErr(e)});
      return()=>colSubs.get(c)&&colSubs.get(c).delete(cb)}
  }},
  doc(p){const [c,id]=splitPath(p);return docRef(c,id)}
};

/* ---------- archivos ---------- */
async function blobOf(id){const {data,error}=await sb.storage.from("files").download(id);if(error)throw error;return data}
const assets={
  async upload(file,opt){if(file.size>45*1024*1024)throw err("too_large");const id=rid(32).replace(/[^a-f0-9]/g,()=>"abcdef0123456789"[Math.floor(Math.random()*16)]);
    const type=(opt&&opt.type)||file.type||"application/octet-stream";
    const {error}=await sb.storage.from("files").upload(id,file,{contentType:type,upsert:false});if(error)throw mapErr(error);
    return{id,url:"/_blob/"+id,type,size:file.size}},
  async delete(id){await sb.storage.from("files").remove([id])}
};
/* fetch("/_blob/…") -> Supabase Storage (por si el service worker aún no controla la página) */
const ofetch=window.fetch.bind(window);
window.fetch=async function(input,init){const u=typeof input==="string"?input:input&&input.url;
  if(u&&/^\/_blob\/[A-Za-z0-9_-]+$/.test(u)){try{const b=await blobOf(u.slice(7));return new Response(b,{status:200,headers:{"Content-Type":b.type||"application/octet-stream"}})}catch(e){return new Response("",{status:404})}}
  return ofetch(input,init)};
/* <img src="/_blob/…"> y enlaces: si no hay service worker, los resuelvo yo */
const blobUrls=new Map();
async function fixBlobs(root){
  const imgs=[...root.querySelectorAll('img[src^="/_blob/"]')];if(root.matches&&root.matches('img[src^="/_blob/"]'))imgs.push(root);
  imgs.forEach(async img=>{const id=img.getAttribute("src").slice(7);img.dataset.blob=id;img.removeAttribute("src");try{if(!blobUrls.has(id))blobUrls.set(id,URL.createObjectURL(await blobOf(id)));img.src=blobUrls.get(id)}catch(e){}});
}
document.addEventListener("click",async e=>{const a=e.target.closest&&e.target.closest('a[href^="/_blob/"]');if(!a)return;e.preventDefault();const w=window.open("","_blank");try{const b=await blobOf(a.getAttribute("href").slice(7));const u=URL.createObjectURL(b);if(w)w.location=u;else location.href=u}catch(_){if(w)w.close()}},true);
new MutationObserver(ms=>{for(const m of ms)m.addedNodes.forEach(n=>{if(n.nodeType===1)fixBlobs(n)})}).observe(document.documentElement,{childList:true,subtree:true});

/* ---------- descargas ---------- */
const downloads={async save({filename,data}){const blob=data instanceof Blob?data:new Blob([data]);const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download=filename||"archivo";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000)}};

/* ---------- usuario ---------- */
let ME=null;
const user={async me(){return{id:ME.id,isOwner:ME.isOwner,canEdit:true,name:ME.email,email:ME.email}}};

/* ---------- acciones del propietario (crear accesos) ---------- */
async function callApi(accion,body){const {data:{session}}=await sb.auth.getSession();
  const r=await ofetch(SB_URL+"/functions/v1/api?accion="+encodeURIComponent(accion),{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+(session&&session.access_token),apikey:SB_KEY},body:JSON.stringify(body||{})});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||("Error "+r.status));return j}
window.OF_WEB={
  crearUsuario:(email,password)=>callApi("crearUsuario",{email,password}),
  usuarios:()=>callApi("usuarios",{}),
  leerContratos:(jid)=>callApi("leerContratos",{jid}),
  async salir(){await sb.auth.signOut();try{localStorage.removeItem("of_auth")}catch(_){}location.reload()},
  get email(){return ME&&ME.email},
  async cambiarClave(pw){const {error}=await sb.auth.updateUser({password:pw});if(error)throw error}
};

/* ---------- pantalla de acceso ---------- */
function loginScreen(){return new Promise(resolve=>{
  const css=`.lg{position:fixed;inset:0;z-index:99;display:grid;place-items:center;background:var(--bg,#000);color:var(--fg,#fff);padding:16px;font-family:inherit}
  .lg form{width:100%;max-width:360px;display:flex;flex-direction:column;gap:12px}
  .lg h1{font-size:1.4rem;margin:12px 0 0;letter-spacing:.02em}.lg p{margin:0;color:var(--muted,#999);font-size:.9rem}
  .lg input{font:inherit;padding:12px;border-radius:10px;border:1px solid var(--line,#333);background:var(--surface,#111);color:inherit}
  .lg button{font:inherit;font-weight:600;padding:12px;border-radius:10px;border:0;background:var(--fg,#fff);color:var(--bg,#000);cursor:pointer}
  .lg .alt{background:none;color:var(--muted,#aaa);font-weight:500;text-decoration:underline;padding:4px}
  .lg .e{color:#f87171;font-size:.9rem;min-height:1.2em}`;
  const st=document.createElement("style");st.textContent=css;document.head.appendChild(st);
  const d=document.createElement("div");d.className="lg";let modo="entrar";
  const draw=()=>{d.innerHTML=`<form><div style="width:72px">${(window.ON_SVG_WEB||"")}</div><h1>ONLY FOOTBALL</h1><p>${modo==="entrar"?"Entra con tu correo y tu contraseña.":"Crea tu cuenta. Josemi tendrá que darte acceso después."}</p>
    <input name="email" type="email" autocomplete="email" placeholder="Correo" required aria-label="Correo">
    <input name="pw" type="password" autocomplete="${modo==="entrar"?"current-password":"new-password"}" placeholder="Contraseña${modo==="crear"?" (mínimo 8 caracteres)":""}" required minlength="${modo==="crear"?8:1}" aria-label="Contraseña">
    <div class="e" role="alert"></div><button type="submit">${modo==="entrar"?"Entrar":"Crear cuenta"}</button>
    <button type="button" class="alt">${modo==="entrar"?"¿Primera vez? Crear cuenta":"Ya tengo cuenta: entrar"}</button>
    ${modo==="entrar"?`<p style="font-size:.8rem">¿Has olvidado la contraseña? Pídele a Josemi que te ponga una nueva.</p>`:""}</form>`;
    const f=d.querySelector("form"),e=d.querySelector(".e");
    d.querySelector(".alt").onclick=()=>{modo=modo==="entrar"?"crear":"entrar";draw()};
    f.onsubmit=async ev=>{ev.preventDefault();e.textContent="";const email=f.email.value.trim(),pw=f.pw.value;const b=f.querySelector("button[type=submit]");b.disabled=true;
      try{if(modo==="entrar"){const {error}=await sb.auth.signInWithPassword({email,password:pw});if(error)throw error}
        else{const {data,error}=await sb.auth.signUp({email,password:pw,options:{emailRedirectTo:location.origin}});if(error)throw error;if(!data.session){e.style.color="var(--fg,#fff)";e.textContent="Te hemos mandado un correo para confirmar la cuenta. Ábrelo y luego vuelve aquí para entrar.";b.disabled=false;modo="entrar";return}}
      }catch(x){e.textContent=/invalid login/i.test(x.message)?"Correo o contraseña incorrectos.":/already registered/i.test(x.message)?"Ese correo ya tiene cuenta: entra con tu contraseña.":/email not confirmed/i.test(x.message)?"Aún no has confirmado tu correo. Busca el mensaje en tu bandeja (y en spam).":x.message;b.disabled=false}};
  };
  draw();document.body.appendChild(d);
  const {data:{subscription}}=sb.auth.onAuthStateChange((ev,s)=>{if(s&&s.user){subscription.unsubscribe();d.remove();resolve(s)}});
})}

let ready=null;
async function init(){
  let {data:{session}}=await sb.auth.getSession();
  if(!session)session=await loginScreen();
  const {data:w,error}=await sb.rpc("whoami");
  ME={id:session.user.id,email:session.user.email,isOwner:!!(w&&w.isOwner)};
  sb.auth.onAuthStateChange(ev=>{if(ev==="SIGNED_OUT")location.reload()});
  startRealtime();
  return true;
}
window.claude={use(n){if(!ready)ready=init();return ready.then(()=>({db,user,assets,downloads})[n]||null).catch(e=>{console.error(e);return null})}};
})();
