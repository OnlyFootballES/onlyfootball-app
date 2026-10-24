#!/usr/bin/env python3
"""Genera la versión web (site/index.html) a partir de la app de Claude (only-football.html)."""
import re, sys
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "tools", "only-football-claude.html")
OUT = os.path.join(ROOT, "site", "index.html")
s = open(SRC, encoding="utf-8").read()

def rep(a, b, n=1):
    global s
    c = s.count(a)
    if c != n:
        sys.exit(f"ERROR: esperaba {n} y hay {c}: {a[:90]!r}")
    s = s.replace(a, b)

# 1. Documento completo + librerías
rep('<title>Only Football</title>\n', '')
rep('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
head = ('<!doctype html>\n<html lang="es"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<title>Only Football</title><meta name="theme-color" content="#000000">'
        '<link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon-192.png">'
        '<link rel="apple-touch-icon" href="icon-192.png"><meta name="apple-mobile-web-app-capable" content="yes">'
        '<meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Only Football">'
        '<meta name="robots" content="noindex,nofollow"></head><body>\n')
s = head + s
rep('<script>\n', '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>\n<script src="shim.js?v=__V__"></script>\n<script>\n')
s += '\n</body></html>\n'

# 2. Mensaje si no carga
rep('<strong>Abre la app desde Claude</strong><span>Los datos compartidos solo se cargan cuando abres esta página con tu cuenta de Claude.</span>',
    '<strong>No se ha podido conectar</strong><span>Revisa la conexión a internet y recarga la página.</span>')

# 3. Cerrar sesión (barra lateral y cabecera móvil)
rep('${isMercadoAbierto()?"mercado abierto":"mercado cerrado"}</div>`;',
    '${isMercadoAbierto()?"mercado abierto":"mercado cerrado"}${window.OF_WEB?`<br><button data-act="salir" style="background:none;border:0;color:inherit;text-decoration:underline;padding:0;margin-top:6px;cursor:pointer;font:inherit">Cerrar sesión</button>`:""}</div>`;')
rep('${isMercadoAbierto()?"Mercado abierto":"Mercado cerrado"}</span></div>`;',
    '${isMercadoAbierto()?"Mercado abierto":"Mercado cerrado"}</span>${window.OF_WEB?`<button class="btn sm ghost" data-act="salir" style="margin-left:6px">Salir</button>`:""}</div>`;')

# 4. Equipo: dar acceso con correo y contraseña
rep('<div class="callout">Para que alguien entre: comparte esta app con su correo desde el botón Compartir de Claude. Al abrirla verá «Solicitar acceso»; aquí eliges quién es y qué secciones ve.',
    '<div class="callout">Para que alguien entre: en su ficha, pon su correo y una contraseña y pulsa «Crear acceso». Luego mándale el enlace de la app, su correo y la contraseña. También puede crearse la cuenta él mismo y te aparecerá aquí como solicitud.')
rep('''<div class="form-actions">${m.userId&&!isMe?`<button type="button" class="btn sm ghost" data-act="unlink" data-id="${esc(m.id)}">Desvincular cuenta</button>`:""}''',
    '''${window.OF_WEB&&!isMe?`<div class="fld span"><div class="sep"></div></div><div class="fld span"><label>${m.userId?"Acceso: "+esc(m.email||"cuenta vinculada")+" · cambiar contraseña":"Crear acceso"}</label><div class="row" style="gap:8px;flex-wrap:wrap"><input id="ca_e_${esc(m.id)}" type="email" placeholder="correo@ejemplo.com" value="${esc(m.email||"")}" aria-label="Correo de ${esc(m.nombre)}" style="flex:1 1 200px"><input id="ca_p_${esc(m.id)}" type="text" placeholder="Contraseña (8+)" aria-label="Contraseña" style="flex:1 1 140px" autocomplete="off"><button type="button" class="btn sm" data-act="crearAcceso" data-id="${esc(m.id)}">${m.userId?"Cambiar contraseña":"Crear acceso"}</button></div></div>`:""}
      <div class="form-actions">${m.userId&&!isMe?`<button type="button" class="btn sm ghost" data-act="unlink" data-id="${esc(m.id)}">Desvincular cuenta</button>`:""}''')

# 5. Acciones nuevas
rep('    case"unlink":{', '''    case"salir":{if(window.OF_WEB)window.OF_WEB.salir();break}
    case"crearAcceso":{const id=el.dataset.id;const m=S.miembros[id];const em=(document.getElementById("ca_e_"+id)||{}).value||"";const pw=(document.getElementById("ca_p_"+id)||{}).value||"";
      if(!/.+@.+\\..+/.test(em.trim()))return toast("Escribe su correo.");if(pw.length<8)return toast("La contraseña necesita al menos 8 caracteres.");
      el.disabled=true;try{const r=await window.OF_WEB.crearUsuario(em.trim(),pw);await S.db.doc("miembros/"+id).update({userId:r.id,email:em.trim().toLowerCase(),activo:true});toast((m.userId?"Contraseña cambiada":"Acceso creado")+": "+em.trim()+" / "+pw)}catch(e){console.error(e);toast(e.message||"No se pudo crear el acceso.")}el.disabled=false;render();break}
    case"unlink":{''')

# 7. Contratos: en la web no hay IA dentro; al subirlos quedan pendientes y los lee una tarea de Claude por la noche
rep('function lecturaPanel(j){\n  const p=perms();if(!p.contratos||!S.sample)return"";',
    'function lecturaPanel(j){\n  const p=perms();if(p.contratos&&!S.sample&&window.OF_WEB)return lecturaPanelWeb(j);if(!p.contratos||!S.sample)return"";')
rep('  if((kind==="club"||kind==="agencia")&&S.sample&&perms()&&perms().contratos){setTimeout(()=>leerContratos(jid,{solo:kind,docId:r.id,auto:true}),400)}',
    '  if((kind==="club"||kind==="agencia")&&S.sample&&perms()&&perms().contratos){setTimeout(()=>leerContratos(jid,{solo:kind,docId:r.id,auto:true}),400)}\n  else if((kind==="club"||kind==="agencia")&&window.OF_WEB&&perms()&&perms().contratos){await pedirLectura(jid,r.id)}')
rep('    case"lectLeer":leerContratos(el.dataset.id);break;',
    '    case"lectLeer":if(!S.sample&&window.OF_WEB)pedirLectura(el.dataset.id);else leerContratos(el.dataset.id);break;')
WEBFN = r"""
async function pedirLectura(jid,docId){
  const ref=S.db.doc("privado/contratos/items/"+jid);const c=S.contratos[jid];
  const prev=c&&c.lectura&&c.lectura.estado==="pendiente"&&Array.isArray(c.lectura.docs)?c.lectura.docs:null;
  const docs=!docId?[]:prev===null?[docId]:prev.length===0?[]:[...new Set([...prev,docId])];
  const lec={estado:"pendiente",docs,pedida:new Date().toISOString(),por:mySlug()||"",hecha:null,nota:"",notas:[]};
  try{await ref.update({lectura:lec})}catch(e){try{await ref.set({lectura:lec,club:{},comisiones:[]})}catch(e2){console.error(e2);toast("No se pudo pedir la lectura del contrato.");return}}
  toast(docId?"Contrato subido: se leerá esta noche":"Lectura pedida: se hará esta noche");render();
}
function lecturaPanelWeb(j){
  const c=S.contratos[j.id]||{};const hay=(j.docsAgencia||[]).length||((c.club||{}).docs||[]).length;if(!hay)return"";
  const L=c.lectura||{};const pend=L.estado==="pendiente";
  const est=pend?`<span class="pill warn">Pendiente: se leerá esta noche</span>`:L.estado==="hecho"?`<span class="pill ok">Leído el ${esc(fmtDate(String(L.hecha||"").slice(0,10)))}</span>`:L.estado==="error"?`<span class="pill bad">No se pudo leer</span>`:"";
  return`<section class="panel span2"><div class="panel-h"><div><h3>Lectura automática del contrato</h3><div class="muted small">Al subir un contrato, Claude lo lee esa misma noche y rellena fechas, categoría, salario (bruto o neto), cláusula y quién paga la comisión.</div></div><div class="row">${est}<button class="btn" data-act="lectLeer" data-id="${esc(j.id)}"${pend?" disabled":""}>${L.estado==="hecho"||L.estado==="error"?"Volver a leer":"Leer contratos"}</button></div></div>${L.nota?`<div class="callout${L.estado==="error"?" warn":""}">${esc(L.nota)}</div>`:""}${(L.notas||[]).length?`<div class="callout">${L.notas.map(esc).join("<br>")}</div>`:""}${L.estado==="hecho"?`<div class="small muted">Revisa los datos en la ficha y en el contrato y corrige lo que haga falta.</div>`:""}</section>`;
}
"""

# 6. Logo para la pantalla de acceso y funciones de la web
rep('\nboot();\n</script>', WEBFN + '\nwindow.ON_SVG_WEB=ON_SVG;\nboot();\n</script>')

import time
s = s.replace("__V__", str(int(time.time())))
open(OUT, "w", encoding="utf-8").write(s)
print("OK", OUT, len(s))
