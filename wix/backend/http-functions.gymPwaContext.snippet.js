// backend/http-functions.js · agregado para gymPwaContext · v0.1.54
// NO reemplaza la función existente: sólo agrega el campo `tv` a su respuesta.
//
// 1) Al inicio de backend/http-functions.js:
import { obtenerTvGym } from 'backend/gymTvCore';

// 2) Dentro de la función existente get_gymPwaContext(request), justo antes de armar la
//    respuesta, obtener el canal (si falla, el monitor sólo muestra la espera ▶):
//
//      let tv = null;
//      try { tv = await obtenerTvGym(); } catch (e) { console.error('gymPwaContext tv', e); }
//
// 3) Agregar `tv` al objeto que ya se devuelve, por ejemplo:
//
//      return ok({
//        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
//        body: { se, us, en, nombre, nombreApp, foto, programa, slug, tv }
//      });
//
// Forma de `tv` (la que lee gym-tv.js, igual que cpcPwaContext → tv):
//   { modo: 'PARRILLA' | 'SIN_PARRILLA' | 'FUERA_DEL_AIRE', youtubeId, segundoInicio, titulo }
//
// El monitor consulta cada 10 s con el parámetro `tv=1`. Si quieres aligerar esas
// consultas, puedes responder sólo { ok: true, tv } cuando request.query.tv === '1'.
