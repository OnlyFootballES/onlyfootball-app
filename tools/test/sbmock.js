(function(){
const d=n=>{const x=new Date(Date.now()+n*864e5);return x.toISOString().slice(0,10)};
const rows={}; // "col\u0000id" -> data
function put(c,id,v){rows[c+"\u0000"+id]=v}
const SEED=window.SEED||{};for(const c in SEED)for(const id in SEED[c])put(c,id,SEED[c][id]);
let session=window.NOLOGIN?null:{user:{id:"uid-josemi",email:"info@onlyfootball.es"},access_token:"t"};
const authCbs=[];const chCbs=[];
function merge(a,b){if(a&&b&&typeof a=="object"&&typeof b=="object"&&!Array.isArray(a)&&!Array.isArray(b)){const o={...a};for(const k in b)o[k]=k in a?merge(a[k],b[k]):b[k];return o}return b}
function q(){const f={};const api={select(){return api},eq(k,v){f[k]=v;return api},range(a,b){const out=Object.entries(rows).filter(([k])=>k.split("\u0000")[0]===f.col).map(([k,v])=>({id:k.split("\u0000")[1],data:JSON.parse(JSON.stringify(v))})).slice(a,b+1);return Promise.resolve({data:out,error:null})},
 delete(){api._del=true;return api},then(res){if(api._del){const k=f.col+"\u0000"+f.id;const had=rows[k];delete rows[k];chCbs.forEach(cb=>setTimeout(()=>cb({eventType:"DELETE",old:{col:f.col,id:f.id}}),30));res({error:null})}}};return api}
window.supabase={createClient(){return{
 auth:{getSession:async()=>({data:{session}}),onAuthStateChange(cb){authCbs.push(cb);return{data:{subscription:{unsubscribe(){}}}}},
  signInWithPassword:async({email,password})=>{if(password!=="secreto")return{error:{message:"Invalid login credentials"}};session={user:{id:"uid-josemi",email},access_token:"t"};authCbs.forEach(cb=>cb("SIGNED_IN",session));return{data:{session},error:null}},
  signOut:async()=>{session=null},signUp:async()=>({data:{session:null},error:null})},
 rpc:async(n,a)=>{if(n==="whoami")return{data:{id:session.user.id,isOwner:true},error:null};
  const k=a.p_col+"\u0000"+a.p_id;
  if(n==="doc_set"){rows[k]=a.p_data}else if(n==="doc_update"){if(!(k in rows))return{error:{message:"not_found"}};rows[k]=merge(rows[k],a.p_data)}
  const nv=JSON.parse(JSON.stringify(rows[k]));chCbs.forEach(cb=>setTimeout(()=>cb({eventType:"UPDATE",new:{col:a.p_col,id:a.p_id,data:nv}}),30));return{error:null}},
 from(){return q()},
 channel(){const c={on(_,__,cb){chCbs.push(cb);return c},subscribe(){return c}};return c},
 storage:{from(){return{upload:async()=>({error:null}),download:async()=>({data:new Blob(["x"],{type:"image/png"}),error:null}),remove:async()=>({error:null})}}}
}}};
window.__rows=rows;
})();
