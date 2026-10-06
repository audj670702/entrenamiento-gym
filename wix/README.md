# Canal GYM · Panel ADM en Wix

Código Velo del sitio SCaD (`www.scad.mx`) para configurar el **Canal GYM** desde el Panel GYM (sección `#seccTV`, componente `#htmlTV`). Mismo concepto que TV Capacitación en el Panel CPC y el canal EO en NEXUS. Estos archivos no los publica GitHub Pages; se copian a Wix.

## Datos

Usa las colecciones existentes, filtradas por `app = "GYM"` y `enteOperador = "GYM"`. GYM todavía no está en el modelo SYS y no tiene EO; para cambiarlo después, edita `GYM_TV_EO` en `gymTvCore.js`.

- `TV_SCaD_Canal`: un registro (`alAire`, `inicioEmision`). Se crea solo la primera vez que se abre el panel.
- `TV_SCaD_Parrilla`: los videos (`youtubeId`, `titulo`, `duracionSegundos`, `orden`, `activo`).

Con el canal al aire, la parrilla activa se reproduce en ciclo desde `inicioEmision`. Todos los usuarios ven el mismo video en el mismo segundo.

## Instalación

| Archivo del repo | Dónde va en Wix |
|---|---|
| `backend/gymTvCore.js` | Backend → nuevo archivo `gymTvCore.js` |
| `backend/gymTv.web.js` | Backend → nuevo archivo `gymTv.web.js` (Web Module) |
| `pages/panel-gym-tv.js` | Código de la página Panel GYM (si ya hay `$w.onReady`, llama `initPanelTv()` dentro) |
| `html/htmlTV.html` | Componente HTML `#htmlTV` → Editar código → pegar completo |
| `backend/http-functions.gymPwaContext.snippet.js` | Agregar `tv` a la respuesta de `get_gymPwaContext` en `http-functions.js` |

**Permiso:** los métodos del panel son `Permissions.Admin`. Si el Panel GYM lo operan miembros con un rol propio, ajusta `gymTv.web.js`.

**Altura sugerida de `#htmlTV`:** unos 820 px en escritorio. La lista se extiende hacia abajo.

## Respuesta para la app

`gymPwaContext` → `tv`, la misma forma que `cpcPwaContext` → `tv`:

```json
{ "modo": "PARRILLA", "youtubeId": "XUf6Mz5Zfaw", "segundoInicio": 100, "titulo": "Cardio" }
```

`modo` puede ser `PARRILLA`, `SIN_PARRILLA` o `FUERA_DEL_AIRE`. En los dos últimos casos `youtubeId` va vacío y el monitor muestra la espera (▶).
