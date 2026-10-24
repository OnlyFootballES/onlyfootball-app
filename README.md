# ONLY FOOTBALL · app de la agencia

- `site/` — la web que se publica (Cloudflare Pages, carpeta de salida `site`).
- `site/shim.js` — conexión con Supabase (datos, acceso y archivos).
- `supabase/functions/api` — función para crear accesos y para las tareas automáticas.
- `tools/build_web.py` — genera `site/index.html` a partir de la versión de Claude.
