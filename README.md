[🇷🇺 Русский](README.ru.md) · [🇬🇧 English](README.en.md) · [🇪🇸 Español](README.md)

# NewTab Dashboard

**NewTab Dashboard** reemplaza la nueva pestaña de Firefox con un dashboard personal, minimalista y completamente configurable. Todo desde el navegador, sin servidores, sin cuentas, sin API keys.

Disponible en la **Firefox Add-ons Store**:
**https://addons.mozilla.org/es-ES/firefox/addon/newtab-dashboard/**

![My Dashboard screenshot](images/screenshot1.png)

---

## Qué incluye

El dashboard se divide en tres columnas:

**Columna izquierda — Sidebar**
- Reloj y fecha en tiempo real
- Feeds RSS con tabs por fuente (Hacker News, The Verge, Ars Technica y cualquier otro feed)
- Monitor de servicios via **Uptime Kuma** (estado global + grid de monitores)

**Columna central — Main**
- Barra de búsqueda con 8 motores configurables (Google, DuckDuckGo, Brave, Kagi, Perplexity…)
- Links organizados en **Secciones → Grupos → Links** con iconos automáticos
- Vídeos recientes de canales de YouTube (sin API key de Google)

**Columna derecha — Panel**
- Clima en tiempo real via Open-Meteo (sin API key)
- Calendario mensual con navegación
- Precios de criptomonedas en tiempo real via CoinGecko (sin API key)
- Bloc de notas persistente

---

## Características principales

- **Sin API keys** — Clima, crypto y vídeos de YouTube funcionan sin registro
- **Firefox Sync** — La configuración se sincroniza entre dispositivos automáticamente
- **Iconos automáticos** — Los links sugieren su icono desde Simple Icons al escribir el nombre
- **Fondos** — URL de imagen, wallpaper diario de **Bing**, explorador de **Wallhaven** o gradientes predefinidos, con controles de opacidad, desenfoque, oscurecimiento y tono
- **Widgets configurables** — Activa, desactiva, mueve entre barras y reordena los widgets del panel (reloj, feeds, clima, calendario, mercados, notas, Uptime Kuma, Proxmox, Docker, Pi-hole)
- **Monitorización de tu homelab** — Estado de VMs de Proxmox, contenedores Docker (vía Portainer) y estadísticas de Pi-hole, con uso de CPU y RAM. Las credenciales solo se envían a tus propios servidores
- **Import / Export** — Guarda y restaura toda tu configuración en un JSON
- **Multiidioma** — Interfaz en Español, Inglés y Ruso
- **Sin dependencias** — Vanilla JS, sin frameworks ni bundler

---

## Instalación

### Desde la store (recomendado)

Instala directamente desde la Firefox Add-ons Store:
https://addons.mozilla.org/es-ES/firefox/addon/newtab-dashboard/

### Modo desarrollador (desde el código fuente)

1. Clona o descarga este repositorio.
2. Abre Firefox y ve a `about:debugging`.
3. Haz clic en **"Este Firefox"** → **"Cargar complemento temporal..."**.
4. Selecciona el archivo `manifest.json` de la carpeta del proyecto.

> Las extensiones temporales se desactivan al cerrar Firefox. Para una instalación permanente usa la store.

---

## Archivos

```
newtab-dashboard/
├── manifest.json      — configuración de la extensión (Manifest v2)
├── dashboard.html     — estructura del dashboard
├── dashboard.css      — estilos (glassmorphism, variables CSS, wallpaper)
├── dashboard.js       — toda la lógica (~2.300 líneas, Vanilla JS)
├── background.js      — reservado para uso futuro
├── icon.svg / icon48.png / icon128.png
├── LICENSE            — licencia MIT
└── README.md
```

---

## Personalización

Toda la configuración se hace desde el botón **⚙** de la interfaz, sin tocar código:

- Añadir / reordenar / eliminar secciones, grupos y links
- Gestionar feeds RSS (con presets populares)
- Añadir activos de crypto (con presets)
- Añadir canales de YouTube por Channel ID o @handle
- Cambiar el motor de búsqueda
- Aplicar wallpaper (URL o gradiente) y ajustar sus efectos
- Gestionar los widgets del panel: activarlos, moverlos entre barras (izquierda/derecha) y reordenarlos
- Conectar servicios self-hosted: Proxmox (API Token), Docker vía Portainer (API Key) y Pi-hole v6
- Cambiar el idioma
- Exportar e importar la configuración completa
- Consultar la información del proyecto, versión y licencia en la pestaña **Acerca de**

Para cambiar la ciudad del clima, edita las coordenadas en `dashboard.js` (busca `open-meteo.com`).

---

## Tecnología

| Capa | Detalle |
|---|---|
| Almacenamiento | `browser.storage.sync` (Firefox Sync) con fallback a `localStorage` |
| Clima | [Open-Meteo](https://open-meteo.com/) — gratuito, sin API key |
| Crypto | [CoinGecko API](https://www.coingecko.com/en/api) — gratuito, sin API key |
| YouTube | Feed Atom XML directo — sin Google API key |
| RSS | Proxy CORS [rss2json](https://rss2json.com/) |
| Iconos | [Simple Icons](https://simpleicons.org/) CDN + favicon como fallback |
| Uptime | [Uptime Kuma](https://github.com/louislam/uptime-kuma) Status Page pública |

---

## Colaboradores

Gracias a quienes han contribuido — la lista completa está en [CONTRIBUTORS.md](CONTRIBUTORS.md).

- **[@Nikitamce](https://github.com/Nikitamce)** — traducción al ruso e internacionalización (i18n).

---

## Licencia

[MIT](LICENSE) © Francisco Martínez — software libre y gratuito. Puedes usarlo, modificarlo y redistribuirlo sin restricciones, conservando el aviso de copyright.
