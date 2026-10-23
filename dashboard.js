// ════════════════════════════════════════════════
//  STORAGE — Firefox Sync + localStorage fallback
// ════════════════════════════════════════════════
function uid() { return Math.random().toString(36).slice(2,9); }

// Safe innerHTML alternative — avoids unsafe dynamic assignment warnings
function setMsg(container, cls, text) {
  container.textContent = '';
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  container.appendChild(d);
}
function mkSvgIcon(svgPath) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('fill', 'currentColor'); svg.setAttribute('viewBox', '0 0 24 24');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', svgPath);
  svg.appendChild(path); return svg;
}
const USE_SYNC = typeof browser !== 'undefined' && browser.storage && browser.storage.sync;

const Store = {
  async get(k, def) {
    if (USE_SYNC) { try { const r = await browser.storage.sync.get(k); return r[k] !== undefined ? r[k] : def; } catch {} }
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; }
  },
  async set(k, v) {
    if (USE_SYNC) { try { await browser.storage.sync.set({[k]:v}); showSyncBadge('synced'); return; } catch { showSyncBadge('error'); } }
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  }
};

let _syncTimer = null;
function showSyncBadge(state) {
  const b = document.getElementById('syncBadge'); if (!b) return;
  clearTimeout(_syncTimer);
  b.textContent = state==='synced' ? t.synced : state==='syncing' ? t.syncing : t.syncError;
  b.style.color  = state==='synced' ? 'var(--green)' : state==='syncing' ? 'var(--text-muted)' : 'var(--red)';
  b.style.opacity = '1';
  _syncTimer = setTimeout(() => { b.style.opacity='0'; }, 3000);
}

if (USE_SYNC) {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.gd_sections) { sections = changes.gd_sections.newValue; renderSections(); renderSectionModal(); }
    if (changes.gd_feeds)    { feeds    = changes.gd_feeds.newValue;    renderFeedTabs(); renderFeedModal(); }
    if (changes.gd_note && document.getElementById('notepad')) document.getElementById('notepad').value = changes.gd_note.newValue||'';
    if (changes.gd_wall)     applyWallSettings(changes.gd_wall.newValue);
    if (changes.gd_markets)  { markets  = changes.gd_markets.newValue;  renderMarketModal(); loadMarkets(); }
    if (changes.gd_channels) { channels = changes.gd_channels.newValue; renderVideoChannelModal(); loadVideos(); }
    if (changes.gd_engine)   applyEngine(changes.gd_engine.newValue, false);
    if (changes.gd_lang)     applyLang(changes.gd_lang.newValue, false);
    if (changes.gd_theme)    applyTheme(changes.gd_theme.newValue, false);
    if (changes.gd_fontsize) applyFontSize(changes.gd_fontsize.newValue, false);
    if (changes.gd_uptime)   { uptimeConfig = changes.gd_uptime.newValue; loadUptime(); }
    if (changes.gd_proxmox)  { proxmoxConfig = changes.gd_proxmox.newValue; loadProxmox(); }
    if (changes.gd_docker)   { dockerConfig = changes.gd_docker.newValue; loadDocker(); }
    if (changes.gd_pihole)   { piholeConfig = changes.gd_pihole.newValue; piholeSid = null; loadPihole(); }
    if (changes.gd_widgets)  { widgets = normalizeWidgets(changes.gd_widgets.newValue); renderWidgetLayout(); renderModalNav(); renderWidgetsModal(); }
    showSyncBadge('synced');
  });
}

// ════════════════════════════════════════════════
//  DATA MODEL
//  sections: [ { id, name, groups: [ { id, name, links: [ { id, name, url } ] } ] } ]
//  feeds:    [ { id, name, url, count } ]
// ════════════════════════════════════════════════
const DEFAULT_SECTIONS = [
  {
    id: uid(), name: 'Main',
    groups: [
      { id: uid(), name: 'Dev', links: [
        { id: uid(), name: 'GitHub',    url: 'https://github.com' },
        { id: uid(), name: 'MDN',       url: 'https://developer.mozilla.org' },
        { id: uid(), name: 'Can I use', url: 'https://caniuse.com' },
      ]},
      { id: uid(), name: 'Design', links: [
        { id: uid(), name: 'Figma',    url: 'https://figma.com' },
        { id: uid(), name: 'Dribbble', url: 'https://dribbble.com' },
      ]},
    ]
  }
];
const DEFAULT_FEEDS = [
  { id: uid(), name: 'Hacker News', url: 'https://hnrss.org/frontpage', count: 8 },
  { id: uid(), name: 'Lobste.rs',   url: 'https://lobste.rs/rss',       count: 8 },
];
const DEFAULT_WALL = { opacity:100, dim:45, blur:0, tint:0, glass:18, src:null, type:'none', grad:null, source:'url' };
const FEED_PRESETS = [
  { name:'Hacker News',  url:'https://hnrss.org/frontpage' },
  { name:'Lobste.rs',    url:'https://lobste.rs/rss' },
  { name:'The Verge',    url:'https://www.theverge.com/rss/index.xml' },
  { name:'Ars Technica', url:'https://feeds.arstechnica.com/arstechnica/index' },
  { name:'CSS-Tricks',   url:'https://css-tricks.com/feed/' },
  { name:'Smashing Mag', url:'https://www.smashingmagazine.com/feed/' },
  { name:'Dev.to',       url:'https://dev.to/feed' },
  { name:'TechCrunch',   url:'https://techcrunch.com/feed/' },
  { name:'Wired',        url:'https://www.wired.com/feed/rss' },
  { name:'El País Tech', url:'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/tecnologia/portada' },
];
const GRADIENT_PRESETS = [
  { label:'Midnight', grad:'linear-gradient(135deg,#0a0a14 0%,#0d1a2e 50%,#0a0a14 100%)' },
  { label:'Aurora',   grad:'linear-gradient(135deg,#061a14 0%,#0a1e2a 40%,#120a20 100%)' },
  { label:'Ember',    grad:'linear-gradient(135deg,#1a0a06 0%,#2e1408 50%,#0e0a14 100%)' },
  { label:'Dusk',     grad:'linear-gradient(135deg,#14081e 0%,#1e0e2a 50%,#0a1018 100%)' },
  { label:'Storm',    grad:'linear-gradient(135deg,#080e14 0%,#101820 50%,#060a10 100%)' },
  { label:'Void',     grad:'linear-gradient(135deg,#04040a 0%,#080810 100%)' },
];

const DEFAULT_MARKETS = [
  { id:'bitcoin',  symbol:'BTC', name:'Bitcoin' },
  { id:'ethereum', symbol:'ETH', name:'Ethereum' },
  { id:'solana',   symbol:'SOL', name:'Solana' },
  { id:'ripple',   symbol:'XRP', name:'XRP' },
];
const MARKET_PRESETS = [
  { id:'bitcoin',        symbol:'BTC',  name:'Bitcoin' },
  { id:'ethereum',       symbol:'ETH',  name:'Ethereum' },
  { id:'solana',         symbol:'SOL',  name:'Solana' },
  { id:'ripple',         symbol:'XRP',  name:'XRP' },
  { id:'cardano',        symbol:'ADA',  name:'Cardano' },
  { id:'dogecoin',       symbol:'DOGE', name:'Dogecoin' },
  { id:'polkadot',       symbol:'DOT',  name:'Polkadot' },
  { id:'chainlink',      symbol:'LINK', name:'Chainlink' },
  { id:'avalanche-2',    symbol:'AVAX', name:'Avalanche' },
  { id:'matic-network',  symbol:'MATIC',name:'Polygon' },
  { id:'the-open-network',symbol:'TON', name:'Toncoin' },
  { id:'pepe',           symbol:'PEPE', name:'Pepe' },
];

const DEFAULT_CHANNELS = [];
let channels  = DEFAULT_CHANNELS;
let uptimeConfig = { url: '', slug: 'default' }; // Uptime Kuma
let proxmoxConfig = { url: '', tokenId: '', tokenSecret: '', name: '', selected: [] }; // Proxmox VE (selected = vmids to detail)
let proxmoxVms = []; // last fetched guest list, for the config selection UI
let dockerConfig  = { url: '', apiKey: '', endpointId: '', name: '' };   // Portainer (endpointId auto-detected if empty)
let piholeConfig  = { url: '', password: '' };                 // Pi-hole v6
let piholeSid = null; // Pi-hole v6 session id — kept in memory only, never persisted
let videoCache = {};   // channelId → [{title,link,thumb,age}]

let markets   = DEFAULT_MARKETS;
let sections  = DEFAULT_SECTIONS;
let feeds     = DEFAULT_FEEDS;
let wallSettings = { ...DEFAULT_WALL };
let activeFeedId = null;
let feedCache    = {};

// ════════════════════════════════════════════════
//  WIDGETS registry & state
//  To add a new widget: wrap its block in <section class="widget" id="w-<id>">,
//  add an entry here and in DEFAULT_WIDGETS. `i18n` is the label key, `configTab`
//  the settings tab id (or null if the widget has no configuration).
// ════════════════════════════════════════════════
const WIDGETS = [
  { id:'clock',    i18n:'clockWidget',   configTab:null },
  { id:'feeds',    i18n:'news',          configTab:'feeds' },
  { id:'uptime',   i18n:'uptime',        configTab:'uptime' },
  { id:'proxmox',  i18n:'proxmoxWidget', configTab:'proxmox' },
  { id:'docker',   i18n:'dockerWidget',  configTab:'docker' },
  { id:'pihole',   i18n:'piholeWidget',  configTab:'pihole' },
  { id:'weather',  i18n:'weather',       configTab:null },
  { id:'calendar', i18n:'calendar',      configTab:null },
  { id:'markets',  i18n:'markets',       configTab:'markets' },
  { id:'note',     i18n:'quickNote',     configTab:null },
];
// Default layout replicates the pre-widget-manager dashboard exactly.
// Uptime and the homelab widgets start inactive (they need configuration first).
const DEFAULT_WIDGETS = [
  { id:'clock',    active:true,  col:'left'  },
  { id:'feeds',    active:true,  col:'left'  },
  { id:'uptime',   active:false, col:'left'  },
  { id:'proxmox',  active:false, col:'left'  },
  { id:'docker',   active:false, col:'left'  },
  { id:'pihole',   active:false, col:'right' },
  { id:'weather',  active:true,  col:'right' },
  { id:'calendar', active:true,  col:'right' },
  { id:'markets',  active:true,  col:'right' },
  { id:'note',     active:true,  col:'right' },
];
let widgets = DEFAULT_WIDGETS.map(w => ({ ...w }));

// pending add state
let pendingSection = null; // section id waiting for a new group
let pendingGroup   = null; // {sectionId, groupId} waiting for a new link
let renameTarget   = null; // {sectionId, groupId?} when the section/group dialog is renaming

async function save() {
  showSyncBadge('syncing');
  await Store.set('gd_sections', sections);
}
async function saveFeeds() {
  showSyncBadge('syncing');
  await Store.set('gd_feeds', feeds);
}
async function saveMarkets() {
  showSyncBadge('syncing');
  await Store.set('gd_markets', markets);
}
async function saveChannels() {
  showSyncBadge('syncing');
  await Store.set('gd_channels', channels);
}
async function saveWall() {
  await Store.set('gd_wall', wallSettings);
}
async function saveWidgets() {
  showSyncBadge('syncing');
  await Store.set('gd_widgets', widgets);
}
async function saveProxmoxStore() { showSyncBadge('syncing'); await Store.set('gd_proxmox', proxmoxConfig); }
async function saveDockerStore()  { showSyncBadge('syncing'); await Store.set('gd_docker',  dockerConfig); }
async function savePiholeStore()  { showSyncBadge('syncing'); await Store.set('gd_pihole',  piholeConfig); }


// ════════════════════════════════════════════════
//  i18n — Internationalization
// ════════════════════════════════════════════════
const LANGUAGES = {
  es: {
    // General
    settings:       'Configuración',
    welcomeTitle: 'Te damos la bienvenida',
    welcomeLead: 'NewTab Dashboard convierte tu nueva pestaña de Firefox en un panel minimalista con tus enlaces favoritos, noticias, vídeos, mercados y el estado de tus servicios.',
    welcomeStep1Title: 'Abre la configuración',
    welcomeStep1Text: 'Pulsa el engranaje de la esquina superior derecha (aparece al mover el ratón).',
    welcomeStep2Title: 'Añade tus enlaces',
    welcomeStep2Text: 'Crea secciones, grupos y enlaces. Arrastra para ordenarlos y haz clic en un nombre para editarlo.',
    welcomeStep3Title: 'Personaliza tu página',
    welcomeStep3Text: 'Activa los widgets que quieras y elige el tema, el fondo y el idioma.',
    welcomePrivacy: 'Todo se guarda en tu navegador y se sincroniza con tu cuenta de Firefox. No se envía ningún dato personal.',
    welcomeStart: 'Empezar',
    welcomeOpenSettings: 'Abrir configuración',
    close:          'Cerrar',
    cancel:         'Cancelar',
    add:            'Añadir',
    apply:          'Aplicar',
    restore:        'Restaurar',
    refresh:        'Actualizar',
    manage:         'Gestionar',
    name:           'Nombre',
    items:          'Ítems',
    popular:        'Populares…',
    clickToSelect:  'Clic para seleccionar',
    clickToAdd:     'Clic para añadir',
    loading:        'Cargando...',
    symbol:         'Símbolo',
    displayName:    'Nombre para mostrar',
    export:         'Exportar',
    import:         'Importar',
    // Sidebar
    news:           'Noticias',
    feedEmpty:      'Añade un feed RSS desde Links.',
    // Greetings
    goodMorning:    'Buenos días',
    goodAfternoon:  'Buenas tardes',
    goodEvening:    'Buenas noches',
    // Panel
    weather:        'Clima',
    wind:           'Viento',
    humidity:       'Humedad',
    feelsLike:      'Sensac.',
    calendar:       'Calendario',
    markets:        'Markets',
    quickNote:      'Nota rápida',
    writeSomething: 'Escribe algo...',
    // Search
    searchPlaceholder: 'Buscar o ir a una URL...',
    // Modal tabs
    links:          'Links',
    videos:         'Vídeos',
    searchEngine:   'Buscador',
    background:     'Fondo',
    language:       'Idioma',
    // Tab Links
    linksHint:      'Los grupos se organizan en <strong>secciones</strong>. Cada sección es una fila de columnas en el dashboard. Arrastra para reordenar y haz clic en un nombre para editarlo.',
    newSection:     'Nueva sección',
    sectionName:    'Nombre de sección',
    sectionPlaceholder: 'Trabajo, Dev, Casa…',
    createSection:  'Crear sección',
    newGroupIn:     'Nuevo grupo en:',
    groupName:      'Nombre del grupo',
    groupPlaceholder: 'Gmail, GitHub, Proxmox…',
    createGroup:    'Crear grupo',
    addLinkTo:      'Añadir link en:',
    addLink:        'Añadir link',
    linkOpenLabel:  'Abrir en', linkOpenNew: 'Pestaña nueva', linkOpenSame: 'Pestaña actual', editSection: 'Editar sección', dragToReorder: 'Arrastra para reordenar', dropHere: 'Soltar aquí', dropLinksHere: 'Arrastra un link aquí', dropGroupsHere: 'Arrastra un grupo aquí', slotNewSection: 'Nueva sección', slotNewGroup: 'Nuevo grupo', slotNewLink: 'Nuevo link', slotNewFeed: 'Nuevo feed', slotNewAsset: 'Nuevo activo', editFeed: 'Editar feed', editAsset: 'Editar activo', dropWidgetsHere: 'Arrastra un widget aquí', slotNewChannel: 'Nuevo canal', editChannel: 'Editar canal', videosWord: 'vídeos', channelDefaultName: 'Canal', clickToEdit: 'Haz clic para editar', editGroup: 'Editar grupo', linkOpenWindow: 'Ventana nueva',
    general: 'General',
    appearanceTab: 'Tema y texto',
    grpContent: 'Mi página',
    grpPersonalize: 'Personalizar',
    grpWidgetSettings: 'Ajustes de widgets',
    grpHelp: 'Ayuda',
    desc_links: 'Organiza tus enlaces favoritos en secciones y grupos.',
    desc_videos: 'Añade canales de YouTube para ver sus últimos vídeos.',
    desc_widgets: 'Elige qué paneles ver en tu página, en qué lado y en qué orden.',
    desc_appearance: 'Cambia los colores y el tamaño del texto.',
    desc_background: 'Elige una imagen o un degradado de fondo y ajusta su aspecto.',
    desc_general: 'Elige tu buscador por defecto y el idioma de la interfaz.',
    desc_feeds: 'Añade las webs de noticias (RSS) que quieres leer.',
    desc_uptime: 'Conecta tu Uptime Kuma para ver el estado de tus servicios.',
    desc_proxmox: 'Conecta tu servidor Proxmox para ver su estado.',
    desc_docker: 'Conecta Portainer para ver tus contenedores Docker.',
    desc_pihole: 'Conecta Pi-hole para ver las estadísticas de bloqueo.',
    desc_markets: 'Elige las criptomonedas que quieres seguir.',
    desc_about: 'Versión de la extensión, novedades y enlaces.',
    iconLabel:      'Icono — URL personalizada <span style="color:var(--text-dim);font-weight:300">(opcional, se sugiere automáticamente)</span>',
    // Tab Feeds
    addFeed:        'Añadir feed',
    // Tab Markets
    marketsHint:    'Precios en tiempo real via CoinGecko (gratuito, sin API key). Introduce el <strong>ID de CoinGecko</strong> de cada activo (ej: <em>bitcoin</em>, <em>ethereum</em>, <em>solana</em>).',
    addAsset:       'Añadir activo',
    // Tab Videos
    videosHint:     'Añade canales de YouTube por su <strong>Channel ID</strong> o por su <strong>@handle</strong>.',
    videosHintHandle:'💡 Puedes usar el @ directamente: <em>@naseros</em>, <em>@SoyITPro</em>… El ID se resuelve automáticamente.',
    addChannel:     'Añadir canal',
    videosToShow:   'Vídeos a mostrar',
    manageChannels: 'Gestionar canales',
    // Tab Engine
    engineHint:     'Selecciona el buscador por defecto. Las URLs directas siempre se abren sin buscador.',
    // Tab Wall
    wallHint:       'Introduce una URL de imagen abajo',
    imageUrl:       'URL de imagen',
    wallUrlHint:    'Unsplash, Picsum, cualquier URL pública directa · se sincroniza entre dispositivos',
    wallType:       'Tipo de fondo',
    wallTypeUrl:    'URL',
    wallTypeBing:   'Bing',
    wallTypeWallhaven: 'Wallhaven',
    wallTypeGradient: 'Gradientes',
    bingApply:      'Usar el wallpaper de Bing de hoy',
    bingHint:       'Imagen diaria de Bing. Se actualiza sola cada día.',
    wallhavenSearchPh: 'Buscar wallpapers…',
    wallhavenHint:  'Wallhaven (solo SFW). Busca y haz clic en uno para aplicarlo.',
    search:         'Buscar',
    presetGradients:'Gradientes predefinidos',
    opacity:        'Opacidad',
    darken:         'Oscurecer',
    blur:           'Desenfoque',
    tint:           'Tono',
    glass:          'Cristal',
    removeBackground:'Quitar fondo',
    // Tab Lang
    langHint:       'Selecciona el idioma de la interfaz.',
    // Sync badge
    synced:         '↑ sincronizado',
    syncing:        '↑ sincronizando…',
    syncError:      '⚠ sin sync',
    // Videos section
    videosLabel:    'VÍDEOS',
    // Calendar days/months handled separately
    days:    ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'],
    months:  ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
    monthsShort: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
    dow:     ['Lu','Ma','Mi','Ju','Vi','Sá','Do'],
    // Weather codes
    weatherCodes: {0:'Despejado',1:'Casi despejado',2:'Parcialmente nublado',3:'Nublado',45:'Niebla',48:'Niebla',51:'Llovizna',61:'Lluvia',63:'Lluvia',65:'Lluvia',71:'Nieve',80:'Chubascos',81:'Chubascos',95:'Tormenta'},
    // Appearance
    appearance:     'Apariencia',
    theme:          'Tema',
    themeHint:      'Personaliza la paleta de colores de la interfaz.',
    fontSize:       'Tamaño de fuente',
    editLink:       'Editar link',
    // Alert Add link
    alertAddLink:   'Rellena nombre y URL.',
    // Uptime Kuma
    uptime:         'Uptime',
    uptimeHint:     'Conecta con tu instancia de Uptime Kuma a través de una Status Page pública. No requiere credenciales.',
    uptimeUrl:      'URL de Uptime Kuma',
    uptimeMode:     'Formato',
    uptimeExtended: 'Extendido',
    uptimeCompact:  'Compacto',
    save:           'Guardar',
    remove:         'Eliminar',
    uptimeAllUp:    'Todos operativos',
    uptimePartial:  'Degradado',
    uptimeDown:     'Incidente activo',
    uptimeError:    'Error al conectar',
    uptimeLoading:  'Conectando…',
    // Tab Widgets
    widgets:          'Widgets',
    widgetsHint:      'Arrastra cada widget a la columna Izquierda o Derecha y ordénalos como quieras. Usa el interruptor para activarlo o desactivarlo; solo los widgets activos se muestran en el dashboard.',
    clockWidget:      'Reloj',
    colLeft:          'Izquierda',
    colRight:         'Derecha',
    // Homelab widgets
    proxmoxWidget:    'Proxmox',
    dockerWidget:     'Docker',
    piholeWidget:     'Pi-hole',
    proxmoxHint:      'Estado de las VMs y contenedores LXC de tu clúster Proxmox VE mediante un API Token (solo lectura). Requiere HTTPS accesible desde el navegador.',
    proxmoxSetup:     '<strong>Cómo generar el token</strong><ol class="svc-steps"><li>En Proxmox: <em>Centro de datos → Permisos → Tokens de API → Añadir</em>.</li><li>Elige el usuario (p. ej. <em>root@pam</em>) y un nombre de token. <strong>Desmarca «Separación de privilegios»</strong> y copia el secreto (solo se muestra una vez).</li><li>El <strong>ID del Token</strong> es <em>usuario@realm!nombre</em> (p. ej. <em>root@pam!dashboard</em>); el <strong>Secreto</strong> es el UUID mostrado.</li><li>Si ves <em>0/0</em>, el token no tiene permisos: en <em>Permisos → Añadir → Permiso de token de API</em>, ruta <em>/</em>, rol <strong>PVEAuditor</strong>.</li></ol>',
    dockerHint:       'Estado de los contenedores Docker a través de la API de Portainer, usando una API Key.',
    dockerSetup:      '<strong>Cómo obtener la API Key</strong><ol class="svc-steps"><li>En Portainer, arriba a la derecha: <em>tu usuario → My account → Access tokens → Add access token</em>.</li><li>Copia el token generado (empieza por <em>ptr_</em>). <strong>Ese</strong> es la API Key — no una URL.</li><li><strong>Endpoint ID</strong>: es el número del entorno en Portainer (normalmente <em>1</em>). <strong>Déjalo vacío para detectarlo automáticamente.</strong></li></ol>',
    piholeHint:       'Estadísticas de Pi-hole v6 (consultas y bloqueos). Introduce la contraseña de la aplicación de Pi-hole.',
    proxmoxTokenId:   'ID del Token (usuario@realm!nombre)',
    proxmoxSecret:    'Secreto del Token',
    dockerApiKey:     'API Key',
    dockerEndpoint:   'Endpoint ID',
    piholePassword:   'Contraseña de la app',
    proxmoxVms:       'VMs/CT encontrados',
    dockerContainers: 'contenedores',
    dockerRunning:    'Contenedores',
    dockerStopped:    'Parados',
    dockerImages:     'Imágenes',
    proxmoxVmsLabel:  'VMs',
    proxmoxMonitor:   'Monitorizar VMs (opcional)',
    proxmoxSelectHint:'Selecciona qué VMs mostrar en detalle bajo las estadísticas.',
    piholeQueries:    'Consultas',
    piholeBlocked:    'Bloqueadas',
    piholeDomains:    'Dominios',
    piholeBlockPct:   'Bloqueo',
    // Service (self-hosted) shared
    svcUrl:           'URL del servidor',
    svcName:          'Nombre (opcional)',
    svcFillFields:    'Rellena la URL y las credenciales.',
    svcConnError:     'No se pudo conectar (¿certificado o URL?)',
    svcHttpError:     'Error del servidor',
    svcAuthError:     'Credenciales no válidas',
    svcTimeout:       'Tiempo de espera agotado',
    svcOpenUrl:       'Abrir URL y aceptar el certificado',
    // Tab Acerca de
    about:            'Acerca de',
    aboutTagline:     'Nueva pestaña minimalista para Firefox',
    aboutProject:     'Proyecto',
    aboutDeveloper:   'Desarrollador',
    aboutContributors:'Colaboradores',
    aboutContributorsLink:'Ver colaboradores',
    aboutChangelog:   'Novedades',
    aboutVersionLabel:'Versión',
    aboutLicense:     'Licencia',
    aboutLicenseHint: 'Publicado bajo licencia MIT: software libre y gratuito. Puedes usarlo, modificarlo y redistribuirlo sin restricciones, conservando el aviso de copyright.',
    aboutPrivacy:     'Toda tu configuración se guarda <strong>en tu propio navegador</strong> y se sincroniza con tu cuenta de Firefox. La extensión no recopila ni envía datos personales, y no necesita ninguna API key.',
    // Alerts & status
    noItems:          'Sin ítems.',
    noSections:       'Sin secciones aún.',
    noFeeds:          'Sin feeds.',
    noAssets:         'Sin activos.',
    noChannels:       'Sin canales. Añade uno abajo.',
    noVideos:         'Sin vídeos. Añade canales desde ⚙',
    noMarketsAdded:   'Añade activos desde ⚙',
    loadingDots:      'Cargando…',
    loadingVideos:    'Cargando vídeos…',
    errorFeed:        'Error cargando feed.',
    errorMarkets:     'Error al cargar — CoinGecko puede tener límite de peticiones. Inténtalo en un momento.',
    errorChannel:     'No se pudo cargar el canal.',
    errorImageLoad:   '⚠ No se pudo cargar la imagen',
    wallPreview:      'Vista previa',
    wallEnterUrl:     'Introduce una URL de imagen abajo',
    searchWith:       'Buscar con',
    searchOrUrl:      'o ir a una URL…',
    // alerts
    alertFillFields:  'Rellena al menos el ID de CoinGecko y el símbolo.',
    alertAssetExists: 'Ya existe ese activo.',
    alertFillChannel: 'Introduce el Channel ID.',
    alertChannelExists:'Canal ya añadido.',
    alertInvalidFile: 'Archivo no válido. Asegúrate de que es un export de Dashboard.',
    alertImportOk:    '✓ Configuración importada correctamente.',
    alertImportError: 'Error al leer el archivo. Asegúrate de que es un JSON válido.',
    alertAddLink:     'Rellena nombre y URL.',
    alertAddFeed:     'Rellena nombre y URL.',
    alertAddGroup:    'Introduce un nombre para el grupo.',
    alertAddSection:  'Introduce un nombre para la sección.',
    // import confirm
    importConfirmTitle: '¿Importar configuración del',
    importConfirmSections: 'secciones de links',
    importConfirmFeeds:    'feeds RSS',
    importConfirmMarkets:  'activos de mercado',
    importConfirmChannels: 'canales de vídeo',
    importConfirmWarning:  'Esto reemplazará tu configuración actual.',
    // export filename
    exportFilename:   'dashboard-config',
    // sync
    syncActiveMsg:    '⇅ Firefox Sync activo',
    syncLocalMsg:     'local (sin sync)',
    // i18n (PR #1) — etiquetas RSS/mercados/vídeos, formularios, botones y meses en genitivo
    monthsGen: ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'],
    feedsRss: 'Feeds RSS',
    newLinkIn: 'Nuevo link en:',
    rssUrl: 'URL RSS',
    coingeckoId: 'ID CoinGecko',
    channelId: 'Channel ID',
    slug: 'Slug',
    videosTip: '💡 Tip: si el canal tiene URL con <em>@usuario</em>, busca el Channel ID en <a href="https://www.youtube.com/@usuario/about" target="_blank" style="color:var(--accent-warm)">su página About</a> → Compartir → Copiar ID del canal.',
    groups: 'grupos',
    linksWord: 'links',
    addGroupBtn: '+ Grupo',
    addLinkBtn: '+ Link',
    noBackground: 'Sin fondo',
    monitorsFound: 'monitores encontrados',
    weekShort: 'sem',
  },
  en: {
    // General
    settings:       'Settings',
    welcomeTitle: 'Welcome',
    welcomeLead: 'NewTab Dashboard turns your Firefox new tab into a minimal panel with your favorite links, news, videos, markets and the status of your services.',
    welcomeStep1Title: 'Open the settings',
    welcomeStep1Text: 'Click the gear in the top-right corner (it shows up when you move the mouse).',
    welcomeStep2Title: 'Add your links',
    welcomeStep2Text: 'Create sections, groups and links. Drag to reorder them and click a name to edit it.',
    welcomeStep3Title: 'Make it yours',
    welcomeStep3Text: 'Turn on the widgets you want and pick the theme, background and language.',
    welcomePrivacy: 'Everything is stored in your browser and synced through your Firefox account. No personal data is sent anywhere.',
    welcomeStart: 'Get started',
    welcomeOpenSettings: 'Open settings',
    close:          'Close',
    cancel:         'Cancel',
    add:            'Add',
    apply:          'Apply',
    restore:        'Restore',
    refresh:        'Refresh',
    manage:         'Manage',
    name:           'Name',
    items:          'Items',
    popular:        'Popular…',
    clickToSelect:  'Click to select',
    clickToAdd:     'Click to add',
    loading:        'Loading...',
    symbol:         'Symbol',
    displayName:    'Display name',
    export:         'Export',
    import:         'Import',
    // Sidebar
    news:           'News',
    feedEmpty:      'Add an RSS feed from Links.',
    // Greetings
    goodMorning:    'Good morning',
    goodAfternoon:  'Good afternoon',
    goodEvening:    'Good evening',
    // Panel
    weather:        'Weather',
    wind:           'Wind',
    humidity:       'Humidity',
    feelsLike:      'Feels like',
    calendar:       'Calendar',
    markets:        'Markets',
    quickNote:      'Quick note',
    writeSomething: 'Write something...',
    // Search
    searchPlaceholder: 'Search or go to a URL...',
    // Modal tabs
    links:          'Links',
    videos:         'Videos',
    searchEngine:   'Search engine',
    background:     'Background',
    language:       'Language',
    // Tab Links
    linksHint:      'Groups are organized into <strong>sections</strong>. Each section is a row of columns in the dashboard. Drag to reorder and click a name to edit it.',
    newSection:     'New section',
    sectionName:    'Section name',
    sectionPlaceholder: 'Work, Dev, Home…',
    createSection:  'Create section',
    newGroupIn:     'New group in:',
    groupName:      'Group name',
    groupPlaceholder: 'Gmail, GitHub, Proxmox…',
    createGroup:    'Create group',
    addLinkTo:      'Add link to:',
    addLink:        'Add link',
    linkOpenLabel:  'Open in', linkOpenNew: 'New tab', linkOpenSame: 'Current tab', editSection: 'Edit section', dragToReorder: 'Drag to reorder', dropHere: 'Drop here', dropLinksHere: 'Drag a link here', dropGroupsHere: 'Drag a group here', slotNewSection: 'New section', slotNewGroup: 'New group', slotNewLink: 'New link', slotNewFeed: 'New feed', slotNewAsset: 'New asset', editFeed: 'Edit feed', editAsset: 'Edit asset', dropWidgetsHere: 'Drag a widget here', slotNewChannel: 'New channel', editChannel: 'Edit channel', videosWord: 'videos', channelDefaultName: 'Channel', clickToEdit: 'Click to edit', editGroup: 'Edit group', linkOpenWindow: 'New window',
    general: 'General',
    appearanceTab: 'Theme & text',
    grpContent: 'My page',
    grpPersonalize: 'Customize',
    grpWidgetSettings: 'Widget settings',
    grpHelp: 'Help',
    desc_links: 'Organize your favorite links into sections and groups.',
    desc_videos: 'Add YouTube channels to see their latest videos.',
    desc_widgets: 'Choose which panels to show, on which side and in what order.',
    desc_appearance: 'Change the colors and the text size.',
    desc_background: 'Pick a background image or gradient and adjust how it looks.',
    desc_general: 'Choose your default search engine and the interface language.',
    desc_feeds: 'Add the news sites (RSS) you want to read.',
    desc_uptime: 'Connect your Uptime Kuma to see the status of your services.',
    desc_proxmox: 'Connect your Proxmox server to see its status.',
    desc_docker: 'Connect Portainer to see your Docker containers.',
    desc_pihole: 'Connect Pi-hole to see blocking statistics.',
    desc_markets: 'Choose the cryptocurrencies you want to follow.',
    desc_about: 'Extension version, what\'s new and links.',
    iconLabel:      'Icon — custom URL <span style="color:var(--text-dim);font-weight:300">(optional, suggested automatically)</span>',
    // Tab Feeds
    addFeed:        'Add feed',
    // Tab Markets
    marketsHint:    'Real-time prices via CoinGecko (free, no API key). Enter the <strong>CoinGecko ID</strong> of each asset (e.g. <em>bitcoin</em>, <em>ethereum</em>, <em>solana</em>).',
    addAsset:       'Add asset',
    // Tab Videos
    videosHint:     'Add YouTube channels by their <strong>Channel ID</strong> or <strong>@handle</strong>.',
    videosHintHandle:'💡 You can use the @ handle directly: <em>@naseros</em>, <em>@SoyITPro</em>… The ID is resolved automatically.',
    addChannel:     'Add channel',
    videosToShow:   'Videos to show',
    manageChannels: 'Manage channels',
    // Tab Engine
    engineHint:     'Select the default search engine. Direct URLs always open without a search engine.',
    // Tab Wall
    wallHint:       'Enter an image URL below',
    imageUrl:       'Image URL',
    wallUrlHint:    'Unsplash, Picsum, any public direct URL · syncs across devices',
    wallType:       'Background type',
    wallTypeUrl:    'URL',
    wallTypeBing:   'Bing',
    wallTypeWallhaven: 'Wallhaven',
    wallTypeGradient: 'Gradients',
    bingApply:      "Use today's Bing wallpaper",
    bingHint:       'Bing daily image. Refreshes automatically every day.',
    wallhavenSearchPh: 'Search wallpapers…',
    wallhavenHint:  'Wallhaven (SFW only). Search and click one to apply it.',
    search:         'Search',
    presetGradients:'Preset gradients',
    opacity:        'Opacity',
    darken:         'Darken',
    blur:           'Blur',
    tint:           'Tint',
    glass:          'Glass',
    removeBackground:'Remove background',
    // Tab Lang
    langHint:       'Select the interface language.',
    // Sync badge
    synced:         '↑ synced',
    syncing:        '↑ syncing…',
    syncError:      '⚠ sync error',
    // Videos section
    videosLabel:    'VIDEOS',
    // Calendar
    days:    ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
    months:  ['January','February','March','April','May','June','July','August','September','October','November','December'],
    monthsShort: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    dow:     ['Mo','Tu','We','Th','Fr','Sa','Su'],
    // Weather codes
    weatherCodes: {0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Fog',51:'Drizzle',61:'Rain',63:'Rain',65:'Rain',71:'Snow',80:'Showers',81:'Showers',95:'Thunderstorm'},
    // Appearance
    appearance:     'Appearance',
    theme:          'Theme',
    themeHint:      'Customize the interface color palette.',
    fontSize:       'Font size',
    editLink:       'Edit link',
    // Alert Add link
    alertAddLink:   'Please fill in name and URL.',
    // Uptime Kuma
    uptime:         'Uptime',
    uptimeHint:     'Connect to your Uptime Kuma instance via a public Status Page. No credentials required.',
    uptimeUrl:      'Uptime Kuma URL',
    uptimeMode:     'Layout',
    uptimeExtended: 'Extended',
    uptimeCompact:  'Compact',
    save:           'Save',
    remove:         'Remove',
    uptimeAllUp:    'All operational',
    uptimePartial:  'Degraded',
    uptimeDown:     'Active incident',
    uptimeError:    'Connection error',
    uptimeLoading:  'Connecting…',
    // Tab Widgets
    widgets:          'Widgets',
    widgetsHint:      'Drag each widget to the Left or Right column and order them as you like. Use the switch to turn it on or off; only active widgets are shown on the dashboard.',
    clockWidget:      'Clock',
    colLeft:          'Left',
    colRight:         'Right',
    // Homelab widgets
    proxmoxWidget:    'Proxmox',
    dockerWidget:     'Docker',
    piholeWidget:     'Pi-hole',
    proxmoxHint:      'Status of your Proxmox VE cluster VMs and LXC containers via a (read-only) API Token. Requires HTTPS reachable from the browser.',
    proxmoxSetup:     '<strong>How to generate the token</strong><ol class="svc-steps"><li>In Proxmox: <em>Datacenter → Permissions → API Tokens → Add</em>.</li><li>Pick the user (e.g. <em>root@pam</em>) and a token name. <strong>Uncheck “Privilege Separation”</strong> and copy the secret (shown only once).</li><li>The <strong>Token ID</strong> is <em>user@realm!name</em> (e.g. <em>root@pam!dashboard</em>); the <strong>Secret</strong> is the shown UUID.</li><li>If you see <em>0/0</em>, the token has no permissions: under <em>Permissions → Add → API Token Permission</em>, path <em>/</em>, role <strong>PVEAuditor</strong>.</li></ol>',
    dockerHint:       'Status of your Docker containers through the Portainer API, using an API key.',
    dockerSetup:      '<strong>How to get the API key</strong><ol class="svc-steps"><li>In Portainer, top-right: <em>your user → My account → Access tokens → Add access token</em>.</li><li>Copy the generated token (starts with <em>ptr_</em>). <strong>That</strong> is the API key — not a URL.</li><li><strong>Endpoint ID</strong>: the environment number in Portainer (usually <em>1</em>). <strong>Leave it blank to auto-detect.</strong></li></ol>',
    piholeHint:       'Pi-hole v6 statistics (queries and blocking). Enter your Pi-hole app password.',
    proxmoxTokenId:   'Token ID (user@realm!name)',
    proxmoxSecret:    'Token secret',
    dockerApiKey:     'API key',
    dockerEndpoint:   'Endpoint ID',
    piholePassword:   'App password',
    proxmoxVms:       'VMs/CTs found',
    dockerContainers: 'containers',
    dockerRunning:    'Containers',
    dockerStopped:    'Stopped',
    dockerImages:     'Images',
    proxmoxVmsLabel:  'VMs',
    proxmoxMonitor:   'Monitor VMs (optional)',
    proxmoxSelectHint:'Choose which VMs to show in detail below the stats.',
    piholeQueries:    'Queries',
    piholeBlocked:    'Blocked',
    piholeDomains:    'Domains',
    piholeBlockPct:   'Blocked',
    // Service (self-hosted) shared
    svcUrl:           'Server URL',
    svcName:          'Name (optional)',
    svcFillFields:    'Fill in the URL and credentials.',
    svcConnError:     'Could not connect (certificate or URL?)',
    svcHttpError:     'Server error',
    svcAuthError:     'Invalid credentials',
    svcTimeout:       'Request timed out',
    svcOpenUrl:       'Open URL and accept the certificate',
    // Tab About
    about:            'About',
    aboutTagline:     'A minimal new tab for Firefox',
    aboutProject:     'Project',
    aboutDeveloper:   'Developer',
    aboutContributors:'Contributors',
    aboutContributorsLink:'View contributors',
    aboutChangelog:   "What's new",
    aboutVersionLabel:'Version',
    aboutLicense:     'License',
    aboutLicenseHint: 'Released under the MIT license: free and open source software. You may use, modify and redistribute it without restrictions, keeping the copyright notice.',
    aboutPrivacy:     'All your settings are stored <strong>in your own browser</strong> and synced through your Firefox account. The extension does not collect or send any personal data, and needs no API keys.',
    // Alerts & status
    noItems:          'No items.',
    noSections:       'No sections yet.',
    noFeeds:          'No feeds.',
    noAssets:         'No assets.',
    noChannels:       'No channels. Add one below.',
    noVideos:         'No videos. Add channels from ⚙',
    noMarketsAdded:   'Add assets from ⚙',
    loadingDots:      'Loading…',
    loadingVideos:    'Loading videos…',
    errorFeed:        'Error loading feed.',
    errorMarkets:     'Error loading — CoinGecko may be rate-limited. Try again in a moment.',
    errorChannel:     'Could not load channel.',
    errorImageLoad:   '⚠ Could not load image',
    wallPreview:      'Preview',
    wallEnterUrl:     'Enter an image URL below',
    searchWith:       'Search with',
    searchOrUrl:      'or go to a URL…',
    // alerts
    alertFillFields:  'Please fill in the CoinGecko ID and symbol.',
    alertAssetExists: 'This asset already exists.',
    alertFillChannel: 'Please enter the Channel ID.',
    alertChannelExists:'Channel already added.',
    alertInvalidFile: 'Invalid file. Make sure it is a Dashboard export.',
    alertImportOk:    '✓ Configuration imported successfully.',
    alertImportError: 'Error reading file. Make sure it is valid JSON.',
    alertAddLink:     'Please fill in name and URL.',
    alertAddFeed:     'Please fill in name and URL.',
    alertAddGroup:    'Please enter a group name.',
    alertAddSection:  'Please enter a section name.',
    // import confirm
    importConfirmTitle: 'Import configuration from',
    importConfirmSections: 'link sections',
    importConfirmFeeds:    'RSS feeds',
    importConfirmMarkets:  'market assets',
    importConfirmChannels: 'video channels',
    importConfirmWarning:  'This will replace your current configuration.',
    // export filename
    exportFilename:   'dashboard-config',
    // sync
    syncActiveMsg:    '⇅ Firefox Sync active',
    syncLocalMsg:     'local (no sync)',
    // i18n (PR #1) — RSS/markets/videos labels, forms, buttons
    feedsRss: 'RSS Feeds',
    newLinkIn: 'New link in:',
    rssUrl: 'RSS URL',
    coingeckoId: 'CoinGecko ID',
    channelId: 'Channel ID',
    slug: 'Slug',
    videosTip: '💡 Tip: if the channel has a URL with <em>@user</em>, find the Channel ID on <a href="https://www.youtube.com/@user/about" target="_blank" style="color:var(--accent-warm)">its About page</a> → Share → Copy channel ID.',
    groups: 'groups',
    linksWord: 'links',
    addGroupBtn: '+ Group',
    addLinkBtn: '+ Link',
    noBackground: 'No background',
    monitorsFound: 'monitors found',
    weekShort: 'w',
  },
  ru: {
    settings: 'Настройки', close: 'Закрыть', cancel: 'Отмена', add: 'Добавить', apply: 'Применить', restore: 'Сбросить',
    welcomeTitle: 'Добро пожаловать',
    welcomeLead: 'NewTab Dashboard превращает новую вкладку Firefox в минималистичную панель с любимыми ссылками, новостями, видео, рынками и состоянием ваших сервисов.',
    welcomeStep1Title: 'Откройте настройки',
    welcomeStep1Text: 'Нажмите на шестерёнку в правом верхнем углу (она появляется при движении мыши).',
    welcomeStep2Title: 'Добавьте ссылки',
    welcomeStep2Text: 'Создавайте разделы, группы и ссылки. Перетаскивайте для изменения порядка и нажимайте на название, чтобы изменить его.',
    welcomeStep3Title: 'Настройте под себя',
    welcomeStep3Text: 'Включите нужные виджеты и выберите тему, фон и язык.',
    welcomePrivacy: 'Всё хранится в вашем браузере и синхронизируется через аккаунт Firefox. Личные данные никуда не отправляются.',
    welcomeStart: 'Начать',
    welcomeOpenSettings: 'Открыть настройки',
    refresh: 'Обновить', manage: 'Управлять', name: 'Название', items: 'Элементы', popular: 'Популярные…',
    clickToSelect: 'Нажмите, чтобы выбрать', clickToAdd: 'Нажмите, чтобы добавить', loading: 'Загрузка...',
    symbol: 'Символ', displayName: 'Отображаемое имя', export: 'Экспорт', import: 'Импорт',
    news: 'Новости', feedEmpty: 'Добавьте RSS-ленту во вкладке Links.',
    goodMorning: 'Доброе утро', goodAfternoon: 'Добрый день', goodEvening: 'Добрый вечер',
    weather: 'Погода', wind: 'Ветер', humidity: 'Влажность', feelsLike: 'Ощущ.', calendar: 'Календарь',
    markets: 'Рынки', quickNote: 'Быстрая заметка', writeSomething: 'Напишите что-нибудь...',
    searchPlaceholder: 'Поиск или переход по URL...', links: 'Ссылки', videos: 'Видео',
    searchEngine: 'Поисковик', background: 'Фон', language: 'Язык',
    linksHint: 'Группы организованы в <strong>разделы</strong>. Каждый раздел — это ряд колонок на дашборде. Перетаскивайте для изменения порядка и нажмите на название, чтобы изменить его.',
    newSection: 'Новый раздел', sectionName: 'Название раздела', sectionPlaceholder: 'Работа, Dev, Дом…',
    createSection: 'Создать раздел', newGroupIn: 'Новая группа в:', groupName: 'Название группы',
    groupPlaceholder: 'Gmail, GitHub, Proxmox…', createGroup: 'Создать группу', addLinkTo: 'Добавить ссылку в:',
    linkOpenLabel: 'Открывать в', linkOpenNew: 'Новой вкладке', linkOpenSame: 'Текущей вкладке', editSection: 'Изменить раздел', dragToReorder: 'Перетащите, чтобы изменить порядок', dropHere: 'Отпустите здесь', dropLinksHere: 'Перетащите ссылку сюда', dropGroupsHere: 'Перетащите группу сюда', slotNewSection: 'Новый раздел', slotNewGroup: 'Новая группа', slotNewLink: 'Новая ссылка', slotNewFeed: 'Новая лента', slotNewAsset: 'Новый актив', editFeed: 'Изменить ленту', editAsset: 'Изменить актив', dropWidgetsHere: 'Перетащите виджет сюда', slotNewChannel: 'Новый канал', editChannel: 'Изменить канал', videosWord: 'видео', channelDefaultName: 'Канал', clickToEdit: 'Нажмите, чтобы изменить', editGroup: 'Изменить группу', linkOpenWindow: 'Новом окне',
    general: 'Общие',
    appearanceTab: 'Тема и текст',
    grpContent: 'Моя страница',
    grpPersonalize: 'Персонализация',
    grpWidgetSettings: 'Настройки виджетов',
    grpHelp: 'Справка',
    desc_links: 'Организуйте любимые ссылки по разделам и группам.',
    desc_videos: 'Добавьте каналы YouTube, чтобы видеть их новые видео.',
    desc_widgets: 'Выберите, какие панели показывать, с какой стороны и в каком порядке.',
    desc_appearance: 'Измените цвета и размер текста.',
    desc_background: 'Выберите фоновое изображение или градиент и настройте его вид.',
    desc_general: 'Выберите поисковик по умолчанию и язык интерфейса.',
    desc_feeds: 'Добавьте новостные сайты (RSS), которые хотите читать.',
    desc_uptime: 'Подключите Uptime Kuma, чтобы видеть состояние сервисов.',
    desc_proxmox: 'Подключите сервер Proxmox, чтобы видеть его состояние.',
    desc_docker: 'Подключите Portainer, чтобы видеть контейнеры Docker.',
    desc_pihole: 'Подключите Pi-hole, чтобы видеть статистику блокировки.',
    desc_markets: 'Выберите криптовалюты, за которыми хотите следить.',
    desc_about: 'Версия расширения, новости и ссылки.',
    addLink: 'Добавить ссылку', iconLabel: 'Иконка — свой URL <span style="color:var(--text-dim);font-weight:300">(необязательно, подставляется автоматически)</span>',
    addFeed: 'Добавить ленту',
    marketsHint: 'Цены в реальном времени через CoinGecko (бесплатно, без API key). Введите <strong>ID CoinGecko</strong> каждого актива (например: <em>bitcoin</em>, <em>ethereum</em>, <em>solana</em>).',
    addAsset: 'Добавить актив',
    videosHint: 'Добавляйте YouTube-каналы по <strong>Channel ID</strong> или <strong>@handle</strong>.',
    videosHintHandle: '💡 Можно использовать @ напрямую: <em>@naseros</em>, <em>@SoyITPro</em>… ID определяется автоматически.',
    addChannel: 'Добавить канал', videosToShow: 'Видео для показа', manageChannels: 'Управление каналами',
    engineHint: 'Выберите поисковик по умолчанию. Прямые URL всегда открываются без поисковика.',
    wallHint: 'Введите URL изображения ниже', imageUrl: 'URL изображения',
    wallUrlHint: 'Unsplash, Picsum, любой публичный прямой URL · синхронизируется между устройствами',
    wallType: 'Тип фона', wallTypeUrl: 'URL', wallTypeBing: 'Bing', wallTypeWallhaven: 'Wallhaven', wallTypeGradient: 'Градиенты',
    bingApply: 'Обои Bing на сегодня',
    bingHint: 'Ежедневное изображение Bing. Обновляется автоматически каждый день.',
    wallhavenSearchPh: 'Поиск обоев…',
    wallhavenHint: 'Wallhaven (только SFW). Найдите и нажмите на обои, чтобы применить.',
    search: 'Поиск',
    presetGradients: 'Готовые градиенты', opacity: 'Прозрачность', darken: 'Затемнение', blur: 'Размытие',
    tint: 'Тон', glass: 'Стекло', removeBackground: 'Убрать фон',
    langHint: 'Выберите язык интерфейса.',
    synced: '↑ синхронизировано', syncing: '↑ синхронизация…', syncError: '⚠ ошибка sync',
    videosLabel: 'ВИДЕО',
    days: ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'],
    months: ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'],
    monthsGen: ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'],
    monthsShort: ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'],
    dow: ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'],
    weatherCodes: {0:'Ясно',1:'Преимущественно ясно',2:'Переменная облачность',3:'Пасмурно',45:'Туман',48:'Туман',51:'Морось',61:'Дождь',63:'Дождь',65:'Дождь',71:'Снег',80:'Ливень',81:'Ливень',95:'Гроза'},
    appearance: 'Внешний вид', theme: 'Тема', themeHint: 'Настройте цветовую палитру интерфейса.',
    fontSize: 'Размер шрифта', editLink: 'Редактировать ссылку', alertAddLink: 'Заполните название и URL.',
    uptime: 'Uptime', uptimeHint: 'Подключите свой экземпляр Uptime Kuma через публичную Status Page. Учётные данные не требуются.',
    uptimeUrl: 'URL Uptime Kuma', uptimeMode: 'Формат', uptimeExtended: 'Расширенный', uptimeCompact: 'Компактный',
    save: 'Сохранить', remove: 'Удалить',
    uptimeAllUp: 'Все работают', uptimePartial: 'Частичные сбои', uptimeDown: 'Активный инцидент',
    uptimeError: 'Ошибка подключения', uptimeLoading: 'Подключение…',
    widgets: 'Виджеты',
    widgetsHint: 'Перетаскивайте виджеты в левую или правую колонку и располагайте их как нужно. Переключатель включает и отключает виджет; на дашборде показываются только активные.',
    clockWidget: 'Часы', colLeft: 'Слева', colRight: 'Справа',
    proxmoxWidget: 'Proxmox', dockerWidget: 'Docker', piholeWidget: 'Pi-hole',
    proxmoxHint: 'Состояние ВМ и LXC-контейнеров кластера Proxmox VE через API-токен (только чтение). Требуется HTTPS, доступный из браузера.',
    proxmoxSetup: '<strong>Как создать токен</strong><ol class="svc-steps"><li>В Proxmox: <em>Датацентр → Разрешения → Токены API → Добавить</em>.</li><li>Выберите пользователя (напр. <em>root@pam</em>) и имя токена. <strong>Снимите «Разделение привилегий»</strong> и скопируйте секрет (показывается один раз).</li><li><strong>ID токена</strong> — это <em>user@realm!name</em> (напр. <em>root@pam!dashboard</em>); <strong>Секрет</strong> — показанный UUID.</li><li>Если видите <em>0/0</em>, у токена нет прав: в <em>Разрешения → Добавить → Разрешение токена API</em>, путь <em>/</em>, роль <strong>PVEAuditor</strong>.</li></ol>',
    dockerHint: 'Состояние Docker-контейнеров через API Portainer с помощью API-ключа.',
    dockerSetup: '<strong>Как получить API-ключ</strong><ol class="svc-steps"><li>В Portainer, справа вверху: <em>ваш пользователь → My account → Access tokens → Add access token</em>.</li><li>Скопируйте токен (начинается с <em>ptr_</em>). <strong>Это</strong> и есть API-ключ — не URL.</li><li><strong>Endpoint ID</strong>: номер окружения в Portainer (обычно <em>1</em>). <strong>Оставьте пустым для автоопределения.</strong></li></ol>',
    piholeHint: 'Статистика Pi-hole v6 (запросы и блокировки). Введите пароль приложения Pi-hole.',
    proxmoxTokenId: 'ID токена (user@realm!name)', proxmoxSecret: 'Секрет токена',
    dockerApiKey: 'API-ключ', dockerEndpoint: 'Endpoint ID', piholePassword: 'Пароль приложения',
    proxmoxVms: 'ВМ/CT найдено', dockerContainers: 'контейнеров',
    dockerRunning: 'Контейнеры', dockerStopped: 'Остановлено', dockerImages: 'Образы',
    proxmoxVmsLabel: 'ВМ', proxmoxMonitor: 'Мониторинг ВМ (опц.)',
    proxmoxSelectHint: 'Выберите, какие ВМ показывать подробно под статистикой.',
    piholeQueries: 'Запросы', piholeBlocked: 'Заблокировано', piholeDomains: 'Домены', piholeBlockPct: 'Блокировка',
    svcUrl: 'URL сервера',
    svcName: 'Имя (опц.)',
    svcFillFields: 'Заполните URL и учётные данные.',
    svcConnError: 'Не удалось подключиться (сертификат или URL?)',
    svcHttpError: 'Ошибка сервера', svcAuthError: 'Неверные учётные данные',
    svcTimeout: 'Превышено время ожидания', svcOpenUrl: 'Открыть URL и принять сертификат',
    about: 'О программе', aboutTagline: 'Минималистичная новая вкладка для Firefox',
    aboutProject: 'Проект', aboutDeveloper: 'Разработчик', aboutVersionLabel: 'Версия',
    aboutContributors: 'Соавторы', aboutContributorsLink: 'Посмотреть соавторов', aboutChangelog: 'Что нового',
    aboutLicense: 'Лицензия',
    aboutLicenseHint: 'Опубликовано под лицензией MIT: свободное и открытое ПО. Вы можете использовать, изменять и распространять его без ограничений, сохраняя уведомление об авторских правах.',
    aboutPrivacy: 'Все ваши настройки хранятся <strong>в вашем браузере</strong> и синхронизируются через аккаунт Firefox. Расширение не собирает и не отправляет персональные данные и не требует API-ключей.',
    noItems: 'Нет элементов.', noSections: 'Разделов пока нет.', noFeeds: 'Нет лент.', noAssets: 'Нет активов.',
    noChannels: 'Нет каналов. Добавьте ниже.', noVideos: 'Нет видео. Добавьте каналы через ⚙',
    noMarketsAdded: 'Добавьте активы через ⚙', loadingDots: 'Загрузка…', loadingVideos: 'Загрузка видео…',
    errorFeed: 'Ошибка загрузки ленты.', errorMarkets: 'Ошибка загрузки — у CoinGecko может быть лимит запросов. Попробуйте чуть позже.',
    errorChannel: 'Не удалось загрузить канал.', errorImageLoad: '⚠ Не удалось загрузить изображение',
    wallPreview: 'Предпросмотр', wallEnterUrl: 'Введите URL изображения ниже',
    searchWith: 'Искать через', searchOrUrl: 'или перейти по URL…',
    alertFillFields: 'Заполните как минимум ID CoinGecko и символ.', alertAssetExists: 'Такой актив уже добавлен.',
    alertFillChannel: 'Введите Channel ID.', alertChannelExists: 'Канал уже добавлен.',
    alertInvalidFile: 'Неверный файл. Убедитесь, что это экспорт Dashboard.',
    alertImportOk: '✓ Конфигурация успешно импортирована.', alertImportError: 'Ошибка чтения файла. Убедитесь, что это корректный JSON.',
    alertAddFeed: 'Заполните название и URL.', alertAddGroup: 'Введите название группы.',
    alertAddSection: 'Введите название раздела.',
    importConfirmTitle: 'Импортировать конфигурацию от',
    importConfirmSections: 'разделов ссылок', importConfirmFeeds: 'RSS-лент',
    importConfirmMarkets: 'рыночных активов', importConfirmChannels: 'видеоканалов',
    importConfirmWarning: 'Это заменит текущую конфигурацию.', exportFilename: 'dashboard-config',
    syncActiveMsg: '⇅ Firefox Sync активен', syncLocalMsg: 'локально (без sync)',
    feedsRss: 'RSS-ленты', newLinkIn: 'Новая ссылка в:', rssUrl: 'URL RSS', coingeckoId: 'ID CoinGecko',
    channelId: 'Channel ID', slug: 'Slug',
    videosTip: '💡 Совет: если у канала URL с <em>@пользователь</em>, Channel ID можно найти на <a href="https://www.youtube.com/@пользователь/about" target="_blank" style="color:var(--accent-warm)">странице About</a> → Поделиться → Скопировать ID канала.',
    groups: 'групп', linksWord: 'ссылок', addGroupBtn: '+ Группа', addLinkBtn: '+ Ссылка',
    noBackground: 'Без фона', monitorsFound: 'мониторов найдено', weekShort: 'нед',
  },
  fr: {
    settings: 'Paramètres',
    welcomeTitle: 'Bienvenue',
    welcomeLead: 'NewTab Dashboard transforme votre nouvel onglet Firefox en un tableau de bord minimaliste avec vos liens favoris, actualités, vidéos, marchés et l\'état de vos services.',
    welcomeStep1Title: 'Ouvrez les paramètres',
    welcomeStep1Text: 'Cliquez sur l\'engrenage en haut à droite (il apparaît quand vous bougez la souris).',
    welcomeStep2Title: 'Ajoutez vos liens',
    welcomeStep2Text: 'Créez des sections, des groupes et des liens. Faites glisser pour les réorganiser et cliquez sur un nom pour le modifier.',
    welcomeStep3Title: 'Personnalisez votre page',
    welcomeStep3Text: 'Activez les widgets que vous voulez et choisissez le thème, l\'arrière-plan et la langue.',
    welcomePrivacy: 'Tout est enregistré dans votre navigateur et synchronisé via votre compte Firefox. Aucune donnée personnelle n\'est envoyée.',
    welcomeStart: 'Commencer',
    welcomeOpenSettings: 'Ouvrir les paramètres',
    close: 'Fermer',
    cancel: 'Annuler',
    add: 'Ajouter',
    apply: 'Appliquer',
    restore: 'Rétablir',
    refresh: 'Actualiser',
    manage: 'Gérer',
    name: 'Nom',
    items: 'Éléments',
    popular: 'Populaires…',
    clickToSelect: 'Cliquez pour sélectionner',
    clickToAdd: 'Cliquez pour ajouter',
    loading: 'Chargement...',
    symbol: 'Symbole',
    displayName: 'Nom affiché',
    export: 'Exporter',
    import: 'Importer',
    news: 'Actualités',
    feedEmpty: 'Ajoutez un flux RSS depuis Liens.',
    goodMorning: 'Bonjour',
    goodAfternoon: 'Bon après-midi',
    goodEvening: 'Bonsoir',
    weather: 'Météo',
    wind: 'Vent',
    humidity: 'Humidité',
    feelsLike: 'Ressenti',
    calendar: 'Calendrier',
    markets: 'Marchés',
    quickNote: 'Note rapide',
    writeSomething: 'Écrivez quelque chose...',
    searchPlaceholder: 'Rechercher ou saisir une URL...',
    links: 'Liens',
    videos: 'Vidéos',
    searchEngine: 'Moteur de recherche',
    background: 'Arrière-plan',
    language: 'Langue',
    linksHint: 'Les groupes sont organisés en <strong>sections</strong>. Chaque section est une ligne de colonnes dans le tableau de bord. Faites glisser pour réorganiser et cliquez sur un nom pour le modifier.',
    newSection: 'Nouvelle section',
    sectionName: 'Nom de la section',
    sectionPlaceholder: 'Travail, Dev, Maison…',
    createSection: 'Créer la section',
    newGroupIn: 'Nouveau groupe dans :',
    groupName: 'Nom du groupe',
    groupPlaceholder: 'Gmail, GitHub, Proxmox…',
    createGroup: 'Créer le groupe',
    addLinkTo: 'Ajouter un lien à :',
    addLink: 'Ajouter un lien',
    linkOpenLabel: 'Ouvrir dans',
    linkOpenNew: 'Nouvel onglet',
    linkOpenSame: 'Onglet actuel',
    editSection: 'Modifier la section',
    dragToReorder: 'Faites glisser pour réorganiser',
    dropHere: 'Déposer ici',
    dropLinksHere: 'Faites glisser un lien ici',
    dropGroupsHere: 'Faites glisser un groupe ici',
    slotNewSection: 'Nouvelle section',
    slotNewGroup: 'Nouveau groupe',
    slotNewLink: 'Nouveau lien',
    slotNewFeed: 'Nouveau flux',
    slotNewAsset: 'Nouvel actif',
    editFeed: 'Modifier le flux',
    editAsset: 'Modifier l\'actif',
    dropWidgetsHere: 'Faites glisser un widget ici',
    slotNewChannel: 'Nouvelle chaîne',
    editChannel: 'Modifier la chaîne',
    videosWord: 'vidéos',
    channelDefaultName: 'Chaîne',
    clickToEdit: 'Cliquez pour modifier',
    editGroup: 'Modifier le groupe',
    linkOpenWindow: 'Nouvelle fenêtre',
    general: 'Général',
    appearanceTab: 'Thème et texte',
    grpContent: 'Ma page',
    grpPersonalize: 'Personnaliser',
    grpWidgetSettings: 'Réglages des widgets',
    grpHelp: 'Aide',
    desc_links: 'Organisez vos liens favoris en sections et en groupes.',
    desc_videos: 'Ajoutez des chaînes YouTube pour voir leurs dernières vidéos.',
    desc_widgets: 'Choisissez les panneaux à afficher, de quel côté et dans quel ordre.',
    desc_appearance: 'Changez les couleurs et la taille du texte.',
    desc_background: 'Choisissez une image ou un dégradé d\'arrière-plan et ajustez son apparence.',
    desc_general: 'Choisissez votre moteur de recherche par défaut et la langue de l\'interface.',
    desc_feeds: 'Ajoutez les sites d\'actualités (RSS) que vous voulez lire.',
    desc_uptime: 'Connectez votre Uptime Kuma pour voir l\'état de vos services.',
    desc_proxmox: 'Connectez votre serveur Proxmox pour voir son état.',
    desc_docker: 'Connectez Portainer pour voir vos conteneurs Docker.',
    desc_pihole: 'Connectez Pi-hole pour voir les statistiques de blocage.',
    desc_markets: 'Choisissez les cryptomonnaies que vous voulez suivre.',
    desc_about: 'Version de l\'extension, nouveautés et liens.',
    iconLabel: 'Icône — URL personnalisée <span style="color:var(--text-dim);font-weight:300">(facultatif, suggérée automatiquement)</span>',
    addFeed: 'Ajouter un flux',
    marketsHint: 'Prix en temps réel via CoinGecko (gratuit, sans clé API). Saisissez l\'<strong>ID CoinGecko</strong> de chaque actif (p. ex. <em>bitcoin</em>, <em>ethereum</em>, <em>solana</em>).',
    addAsset: 'Ajouter un actif',
    videosHint: 'Ajoutez des chaînes YouTube grâce à leur <strong>ID de chaîne</strong> ou leur <strong>@pseudo</strong>.',
    videosHintHandle: '💡 Vous pouvez utiliser directement le @pseudo : <em>@naseros</em>, <em>@SoyITPro</em>… L\'ID est résolu automatiquement.',
    addChannel: 'Ajouter une chaîne',
    videosToShow: 'Vidéos à afficher',
    manageChannels: 'Gérer les chaînes',
    engineHint: 'Sélectionnez le moteur de recherche par défaut. Les URL directes s\'ouvrent toujours sans moteur de recherche.',
    wallHint: 'Saisissez une URL d\'image ci-dessous',
    imageUrl: 'URL de l\'image',
    wallUrlHint: 'Unsplash, Picsum, toute URL directe publique · synchronisé entre vos appareils',
    wallType: 'Type d\'arrière-plan',
    wallTypeUrl: 'URL',
    wallTypeBing: 'Bing',
    wallTypeWallhaven: 'Wallhaven',
    wallTypeGradient: 'Dégradés',
    bingApply: 'Utiliser le fond d\'écran Bing du jour',
    bingHint: 'Image du jour de Bing. Se renouvelle automatiquement chaque jour.',
    wallhavenSearchPh: 'Rechercher des fonds d\'écran…',
    wallhavenHint: 'Wallhaven (SFW uniquement). Recherchez, puis cliquez sur une image pour l\'appliquer.',
    search: 'Rechercher',
    presetGradients: 'Dégradés prédéfinis',
    opacity: 'Opacité',
    darken: 'Assombrir',
    blur: 'Flou',
    tint: 'Teinte',
    glass: 'Verre',
    removeBackground: 'Supprimer l\'arrière-plan',
    langHint: 'Sélectionnez la langue de l\'interface.',
    synced: '↑ synchronisé',
    syncing: '↑ synchronisation…',
    syncError: '⚠ erreur de synchronisation',
    videosLabel: 'VIDÉOS',
    days: ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'],
    months: ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'],
    monthsGen: ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],
    monthsShort: ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'],
    dow: ['Lu','Ma','Me','Je','Ve','Sa','Di'],
    weatherCodes: {0:'Ciel dégagé',1:'Plutôt dégagé',2:'Partiellement nuageux',3:'Couvert',45:'Brouillard',48:'Brouillard',51:'Bruine',61:'Pluie',63:'Pluie',65:'Pluie',71:'Neige',80:'Averses',81:'Averses',95:'Orage'},
    appearance: 'Apparence',
    theme: 'Thème',
    themeHint: 'Personnalisez la palette de couleurs de l\'interface.',
    fontSize: 'Taille du texte',
    editLink: 'Modifier le lien',
    alertAddLink: 'Veuillez renseigner le nom et l\'URL.',
    uptime: 'Uptime',
    uptimeHint: 'Connectez-vous à votre instance Uptime Kuma via une page d\'état publique. Aucun identifiant requis.',
    uptimeUrl: 'URL d\'Uptime Kuma',
    uptimeMode: 'Affichage',
    uptimeExtended: 'Étendu',
    uptimeCompact: 'Compact',
    save: 'Enregistrer',
    remove: 'Supprimer',
    uptimeAllUp: 'Tout est opérationnel',
    uptimePartial: 'Dégradé',
    uptimeDown: 'Incident en cours',
    uptimeError: 'Erreur de connexion',
    uptimeLoading: 'Connexion…',
    widgets: 'Widgets',
    widgetsHint: 'Faites glisser chaque widget vers la colonne Gauche ou Droite et ordonnez-les comme vous voulez. Utilisez l\'interrupteur pour l\'activer ou le désactiver ; seuls les widgets actifs s\'affichent sur le tableau de bord.',
    clockWidget: 'Horloge',
    colLeft: 'Gauche',
    colRight: 'Droite',
    proxmoxWidget: 'Proxmox',
    dockerWidget: 'Docker',
    piholeWidget: 'Pi-hole',
    proxmoxHint: 'État des VM et des conteneurs LXC de votre cluster Proxmox VE via un jeton d\'API (lecture seule). Nécessite un accès HTTPS depuis le navigateur.',
    proxmoxSetup: '<strong>Comment générer le jeton</strong><ol class="svc-steps"><li>Dans Proxmox : <em>Datacenter → Permissions → API Tokens → Add</em>.</li><li>Choisissez l\'utilisateur (p. ex. <em>root@pam</em>) et un nom de jeton. <strong>Décochez « Privilege Separation »</strong> et copiez le secret (affiché une seule fois).</li><li>L\'<strong>ID du jeton</strong> est <em>utilisateur@realm!nom</em> (p. ex. <em>root@pam!dashboard</em>) ; le <strong>Secret</strong> est l\'UUID affiché.</li><li>Si vous voyez <em>0/0</em>, le jeton n\'a aucune permission : dans <em>Permissions → Add → API Token Permission</em>, chemin <em>/</em>, rôle <strong>PVEAuditor</strong>.</li></ol>',
    dockerHint: 'État de vos conteneurs Docker via l\'API de Portainer, avec une clé d\'API.',
    dockerSetup: '<strong>Comment obtenir la clé d\'API</strong><ol class="svc-steps"><li>Dans Portainer, en haut à droite : <em>votre utilisateur → My account → Access tokens → Add access token</em>.</li><li>Copiez le jeton généré (il commence par <em>ptr_</em>). <strong>C\'est</strong> la clé d\'API — pas une URL.</li><li><strong>ID du endpoint</strong> : le numéro de l\'environnement dans Portainer (généralement <em>1</em>). <strong>Laissez vide pour le détecter automatiquement.</strong></li></ol>',
    piholeHint: 'Statistiques de Pi-hole v6 (requêtes et blocage). Saisissez le mot de passe d\'application de votre Pi-hole.',
    proxmoxTokenId: 'ID du jeton (utilisateur@realm!nom)',
    proxmoxSecret: 'Secret du jeton',
    dockerApiKey: 'Clé d\'API',
    dockerEndpoint: 'ID du endpoint',
    piholePassword: 'Mot de passe d\'application',
    proxmoxVms: 'VM/CT trouvés',
    dockerContainers: 'conteneurs',
    dockerRunning: 'Conteneurs',
    dockerStopped: 'Arrêtés',
    dockerImages: 'Images',
    proxmoxVmsLabel: 'VM',
    proxmoxMonitor: 'Surveiller des VM (facultatif)',
    proxmoxSelectHint: 'Choisissez les VM à afficher en détail sous les statistiques.',
    piholeQueries: 'Requêtes',
    piholeBlocked: 'Bloquées',
    piholeDomains: 'Domaines',
    piholeBlockPct: 'Bloquées',
    svcUrl: 'URL du serveur',
    svcName: 'Nom (facultatif)',
    svcFillFields: 'Renseignez l\'URL et les identifiants.',
    svcConnError: 'Connexion impossible (certificat ou URL ?)',
    svcHttpError: 'Erreur du serveur',
    svcAuthError: 'Identifiants invalides',
    svcTimeout: 'Délai de la requête dépassé',
    svcOpenUrl: 'Ouvrir l\'URL et accepter le certificat',
    about: 'À propos',
    aboutTagline: 'Un nouvel onglet minimaliste pour Firefox',
    aboutProject: 'Projet',
    aboutDeveloper: 'Développeur',
    aboutContributors: 'Contributeurs',
    aboutContributorsLink: 'Voir les contributeurs',
    aboutChangelog: 'Nouveautés',
    aboutVersionLabel: 'Version',
    aboutLicense: 'Licence',
    aboutLicenseHint: 'Publié sous licence MIT : logiciel libre et open source. Vous pouvez l\'utiliser, le modifier et le redistribuer sans restriction, en conservant la mention de copyright.',
    aboutPrivacy: 'Tous vos réglages sont stockés <strong>dans votre propre navigateur</strong> et synchronisés via votre compte Firefox. L\'extension ne collecte ni n\'envoie aucune donnée personnelle et ne nécessite aucune clé d\'API.',
    noItems: 'Aucun élément.',
    noSections: 'Aucune section pour le moment.',
    noFeeds: 'Aucun flux.',
    noAssets: 'Aucun actif.',
    noChannels: 'Aucune chaîne. Ajoutez-en une ci-dessous.',
    noVideos: 'Aucune vidéo. Ajoutez des chaînes depuis ⚙',
    noMarketsAdded: 'Ajoutez des actifs depuis ⚙',
    loadingDots: 'Chargement…',
    loadingVideos: 'Chargement des vidéos…',
    errorFeed: 'Erreur lors du chargement du flux.',
    errorMarkets: 'Erreur de chargement — CoinGecko limite peut-être les requêtes. Réessayez dans un instant.',
    errorChannel: 'Impossible de charger la chaîne.',
    errorImageLoad: '⚠ Impossible de charger l\'image',
    wallPreview: 'Aperçu',
    wallEnterUrl: 'Saisissez une URL d\'image ci-dessous',
    searchWith: 'Rechercher avec',
    searchOrUrl: 'ou saisir une URL…',
    alertFillFields: 'Veuillez renseigner l\'ID CoinGecko et le symbole.',
    alertAssetExists: 'Cet actif existe déjà.',
    alertFillChannel: 'Veuillez saisir l\'ID de la chaîne.',
    alertChannelExists: 'Chaîne déjà ajoutée.',
    alertInvalidFile: 'Fichier invalide. Vérifiez qu\'il s\'agit d\'un export du tableau de bord.',
    alertImportOk: '✓ Configuration importée avec succès.',
    alertImportError: 'Erreur de lecture du fichier. Vérifiez qu\'il s\'agit d\'un JSON valide.',
    alertAddFeed: 'Veuillez renseigner le nom et l\'URL.',
    alertAddGroup: 'Veuillez saisir un nom de groupe.',
    alertAddSection: 'Veuillez saisir un nom de section.',
    importConfirmTitle: 'Importer la configuration de',
    importConfirmSections: 'sections de liens',
    importConfirmFeeds: 'flux RSS',
    importConfirmMarkets: 'actifs de marché',
    importConfirmChannels: 'chaînes vidéo',
    importConfirmWarning: 'Cela remplacera votre configuration actuelle.',
    exportFilename: 'dashboard-config',
    syncActiveMsg: '⇅ Firefox Sync actif',
    syncLocalMsg: 'local (sans synchronisation)',
    feedsRss: 'Flux RSS',
    newLinkIn: 'Nouveau lien dans :',
    rssUrl: 'URL du flux RSS',
    coingeckoId: 'ID CoinGecko',
    channelId: 'ID de la chaîne',
    slug: 'Slug',
    videosTip: '💡 Astuce : si la chaîne a une URL avec <em>@pseudo</em>, trouvez l\'ID de la chaîne sur <a href="https://www.youtube.com/@pseudo/about" target="_blank" style="color:var(--accent-warm)">sa page À propos</a> → Partager → Copier l\'ID de la chaîne.',
    groups: 'groupes',
    linksWord: 'liens',
    addGroupBtn: '+ Groupe',
    addLinkBtn: '+ Lien',
    noBackground: 'Aucun arrière-plan',
    monitorsFound: 'moniteurs trouvés',
    weekShort: 'sem',
  },
  de: {
    settings: 'Einstellungen',
    welcomeTitle: 'Willkommen',
    welcomeLead: 'NewTab Dashboard macht aus deinem neuen Firefox-Tab ein minimalistisches Panel mit deinen Lieblingslinks, Nachrichten, Videos, Märkten und dem Status deiner Dienste.',
    welcomeStep1Title: 'Öffne die Einstellungen',
    welcomeStep1Text: 'Klicke auf das Zahnrad oben rechts (es erscheint, wenn du die Maus bewegst).',
    welcomeStep2Title: 'Füge deine Links hinzu',
    welcomeStep2Text: 'Erstelle Abschnitte, Gruppen und Links. Zum Umsortieren ziehen, zum Bearbeiten auf einen Namen klicken.',
    welcomeStep3Title: 'Mach es zu deinem',
    welcomeStep3Text: 'Aktiviere die gewünschten Widgets und wähle Design, Hintergrund und Sprache.',
    welcomePrivacy: 'Alles wird in deinem Browser gespeichert und über dein Firefox-Konto synchronisiert. Es werden keine personenbezogenen Daten gesendet.',
    welcomeStart: 'Los geht\'s',
    welcomeOpenSettings: 'Einstellungen öffnen',
    close: 'Schließen',
    cancel: 'Abbrechen',
    add: 'Hinzufügen',
    apply: 'Anwenden',
    restore: 'Zurücksetzen',
    refresh: 'Aktualisieren',
    manage: 'Verwalten',
    name: 'Name',
    items: 'Einträge',
    popular: 'Beliebt…',
    clickToSelect: 'Zum Auswählen klicken',
    clickToAdd: 'Zum Hinzufügen klicken',
    loading: 'Lädt...',
    symbol: 'Symbol',
    displayName: 'Anzeigename',
    export: 'Exportieren',
    import: 'Importieren',
    news: 'Nachrichten',
    feedEmpty: 'Füge unter Links einen RSS-Feed hinzu.',
    goodMorning: 'Guten Morgen',
    goodAfternoon: 'Guten Tag',
    goodEvening: 'Guten Abend',
    weather: 'Wetter',
    wind: 'Wind',
    humidity: 'Luftfeuchtigkeit',
    feelsLike: 'Gefühlt',
    calendar: 'Kalender',
    markets: 'Märkte',
    quickNote: 'Kurznotiz',
    writeSomething: 'Schreib etwas...',
    searchPlaceholder: 'Suchen oder URL eingeben...',
    links: 'Links',
    videos: 'Videos',
    searchEngine: 'Suchmaschine',
    background: 'Hintergrund',
    language: 'Sprache',
    linksHint: 'Gruppen sind in <strong>Abschnitten</strong> organisiert. Jeder Abschnitt ist eine Zeile mit Spalten im Dashboard. Zum Umsortieren ziehen, zum Bearbeiten auf einen Namen klicken.',
    newSection: 'Neuer Abschnitt',
    sectionName: 'Name des Abschnitts',
    sectionPlaceholder: 'Arbeit, Dev, Zuhause…',
    createSection: 'Abschnitt erstellen',
    newGroupIn: 'Neue Gruppe in:',
    groupName: 'Gruppenname',
    groupPlaceholder: 'Gmail, GitHub, Proxmox…',
    createGroup: 'Gruppe erstellen',
    addLinkTo: 'Link hinzufügen zu:',
    addLink: 'Link hinzufügen',
    linkOpenLabel: 'Öffnen in',
    linkOpenNew: 'Neuer Tab',
    linkOpenSame: 'Aktueller Tab',
    editSection: 'Abschnitt bearbeiten',
    dragToReorder: 'Zum Umsortieren ziehen',
    dropHere: 'Hier ablegen',
    dropLinksHere: 'Link hierher ziehen',
    dropGroupsHere: 'Gruppe hierher ziehen',
    slotNewSection: 'Neuer Abschnitt',
    slotNewGroup: 'Neue Gruppe',
    slotNewLink: 'Neuer Link',
    slotNewFeed: 'Neuer Feed',
    slotNewAsset: 'Neuer Wert',
    editFeed: 'Feed bearbeiten',
    editAsset: 'Wert bearbeiten',
    dropWidgetsHere: 'Widget hierher ziehen',
    slotNewChannel: 'Neuer Kanal',
    editChannel: 'Kanal bearbeiten',
    videosWord: 'Videos',
    channelDefaultName: 'Kanal',
    clickToEdit: 'Zum Bearbeiten klicken',
    editGroup: 'Gruppe bearbeiten',
    linkOpenWindow: 'Neues Fenster',
    general: 'Allgemein',
    appearanceTab: 'Design und Text',
    grpContent: 'Meine Seite',
    grpPersonalize: 'Anpassen',
    grpWidgetSettings: 'Widget-Einstellungen',
    grpHelp: 'Hilfe',
    desc_links: 'Ordne deine Lieblingslinks in Abschnitten und Gruppen.',
    desc_videos: 'Füge YouTube-Kanäle hinzu, um ihre neuesten Videos zu sehen.',
    desc_widgets: 'Wähle, welche Panels angezeigt werden, auf welcher Seite und in welcher Reihenfolge.',
    desc_appearance: 'Ändere die Farben und die Textgröße.',
    desc_background: 'Wähle ein Hintergrundbild oder einen Farbverlauf und passe das Aussehen an.',
    desc_general: 'Wähle deine Standard-Suchmaschine und die Sprache der Oberfläche.',
    desc_feeds: 'Füge die Nachrichtenseiten (RSS) hinzu, die du lesen möchtest.',
    desc_uptime: 'Verbinde deinen Uptime Kuma, um den Status deiner Dienste zu sehen.',
    desc_proxmox: 'Verbinde deinen Proxmox-Server, um seinen Status zu sehen.',
    desc_docker: 'Verbinde Portainer, um deine Docker-Container zu sehen.',
    desc_pihole: 'Verbinde Pi-hole, um die Blockierstatistiken zu sehen.',
    desc_markets: 'Wähle die Kryptowährungen, denen du folgen möchtest.',
    desc_about: 'Version der Erweiterung, Neuerungen und Links.',
    iconLabel: 'Symbol — eigene URL <span style="color:var(--text-dim);font-weight:300">(optional, wird automatisch vorgeschlagen)</span>',
    addFeed: 'Feed hinzufügen',
    marketsHint: 'Echtzeitpreise über CoinGecko (kostenlos, ohne API-Schlüssel). Gib die <strong>CoinGecko-ID</strong> jedes Wertes ein (z. B. <em>bitcoin</em>, <em>ethereum</em>, <em>solana</em>).',
    addAsset: 'Wert hinzufügen',
    videosHint: 'Füge YouTube-Kanäle über ihre <strong>Kanal-ID</strong> oder ihren <strong>@Handle</strong> hinzu.',
    videosHintHandle: '💡 Du kannst den @Handle direkt verwenden: <em>@naseros</em>, <em>@SoyITPro</em>… Die ID wird automatisch aufgelöst.',
    addChannel: 'Kanal hinzufügen',
    videosToShow: 'Anzuzeigende Videos',
    manageChannels: 'Kanäle verwalten',
    engineHint: 'Wähle die Standard-Suchmaschine. Direkte URLs werden immer ohne Suchmaschine geöffnet.',
    wallHint: 'Gib unten eine Bild-URL ein',
    imageUrl: 'Bild-URL',
    wallUrlHint: 'Unsplash, Picsum, jede öffentliche direkte URL · wird zwischen Geräten synchronisiert',
    wallType: 'Hintergrundtyp',
    wallTypeUrl: 'URL',
    wallTypeBing: 'Bing',
    wallTypeWallhaven: 'Wallhaven',
    wallTypeGradient: 'Farbverläufe',
    bingApply: 'Bing-Hintergrund des Tages verwenden',
    bingHint: 'Bing-Bild des Tages. Wird jeden Tag automatisch aktualisiert.',
    wallhavenSearchPh: 'Hintergrundbilder suchen…',
    wallhavenHint: 'Wallhaven (nur SFW). Suchen und auf ein Bild klicken, um es anzuwenden.',
    search: 'Suchen',
    presetGradients: 'Vordefinierte Farbverläufe',
    opacity: 'Deckkraft',
    darken: 'Abdunkeln',
    blur: 'Unschärfe',
    tint: 'Farbton',
    glass: 'Glas',
    removeBackground: 'Hintergrund entfernen',
    langHint: 'Wähle die Sprache der Oberfläche.',
    synced: '↑ synchronisiert',
    syncing: '↑ synchronisiert…',
    syncError: '⚠ Synchronisierungsfehler',
    videosLabel: 'VIDEOS',
    days: ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'],
    months: ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'],
    monthsGen: ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'],
    monthsShort: ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'],
    dow: ['Mo','Di','Mi','Do','Fr','Sa','So'],
    weatherCodes: {0:'Klar',1:'Überwiegend klar',2:'Teils bewölkt',3:'Bedeckt',45:'Nebel',48:'Nebel',51:'Nieselregen',61:'Regen',63:'Regen',65:'Regen',71:'Schnee',80:'Schauer',81:'Schauer',95:'Gewitter'},
    appearance: 'Darstellung',
    theme: 'Design',
    themeHint: 'Passe die Farbpalette der Oberfläche an.',
    fontSize: 'Schriftgröße',
    editLink: 'Link bearbeiten',
    alertAddLink: 'Bitte Name und URL ausfüllen.',
    uptime: 'Uptime',
    uptimeHint: 'Verbinde dich über eine öffentliche Statusseite mit deiner Uptime-Kuma-Instanz. Keine Zugangsdaten erforderlich.',
    uptimeUrl: 'Uptime-Kuma-URL',
    uptimeMode: 'Layout',
    uptimeExtended: 'Erweitert',
    uptimeCompact: 'Kompakt',
    save: 'Speichern',
    remove: 'Entfernen',
    uptimeAllUp: 'Alles in Betrieb',
    uptimePartial: 'Eingeschränkt',
    uptimeDown: 'Aktive Störung',
    uptimeError: 'Verbindungsfehler',
    uptimeLoading: 'Verbinde…',
    widgets: 'Widgets',
    widgetsHint: 'Ziehe jedes Widget in die linke oder rechte Spalte und ordne sie nach Belieben an. Mit dem Schalter aktivierst oder deaktivierst du es; nur aktive Widgets werden im Dashboard angezeigt.',
    clockWidget: 'Uhr',
    colLeft: 'Links',
    colRight: 'Rechts',
    proxmoxWidget: 'Proxmox',
    dockerWidget: 'Docker',
    piholeWidget: 'Pi-hole',
    proxmoxHint: 'Status der VMs und LXC-Container deines Proxmox-VE-Clusters über ein (schreibgeschütztes) API-Token. Erfordert einen vom Browser erreichbaren HTTPS-Zugang.',
    proxmoxSetup: '<strong>So erzeugst du das Token</strong><ol class="svc-steps"><li>In Proxmox: <em>Datacenter → Permissions → API Tokens → Add</em>.</li><li>Wähle den Benutzer (z. B. <em>root@pam</em>) und einen Token-Namen. <strong>Deaktiviere „Privilege Separation“</strong> und kopiere das Secret (wird nur einmal angezeigt).</li><li>Die <strong>Token-ID</strong> lautet <em>benutzer@realm!name</em> (z. B. <em>root@pam!dashboard</em>); das <strong>Secret</strong> ist die angezeigte UUID.</li><li>Wenn du <em>0/0</em> siehst, hat das Token keine Berechtigungen: unter <em>Permissions → Add → API Token Permission</em>, Pfad <em>/</em>, Rolle <strong>PVEAuditor</strong>.</li></ol>',
    dockerHint: 'Status deiner Docker-Container über die Portainer-API mit einem API-Schlüssel.',
    dockerSetup: '<strong>So erhältst du den API-Schlüssel</strong><ol class="svc-steps"><li>In Portainer, oben rechts: <em>dein Benutzer → My account → Access tokens → Add access token</em>.</li><li>Kopiere das erzeugte Token (beginnt mit <em>ptr_</em>). <strong>Das</strong> ist der API-Schlüssel — keine URL.</li><li><strong>Endpoint-ID</strong>: die Nummer der Umgebung in Portainer (meist <em>1</em>). <strong>Leer lassen für automatische Erkennung.</strong></li></ol>',
    piholeHint: 'Statistiken von Pi-hole v6 (Anfragen und Blockierung). Gib das App-Passwort deines Pi-hole ein.',
    proxmoxTokenId: 'Token-ID (benutzer@realm!name)',
    proxmoxSecret: 'Token-Secret',
    dockerApiKey: 'API-Schlüssel',
    dockerEndpoint: 'Endpoint-ID',
    piholePassword: 'App-Passwort',
    proxmoxVms: 'VMs/CTs gefunden',
    dockerContainers: 'Container',
    dockerRunning: 'Container',
    dockerStopped: 'Gestoppt',
    dockerImages: 'Images',
    proxmoxVmsLabel: 'VMs',
    proxmoxMonitor: 'VMs überwachen (optional)',
    proxmoxSelectHint: 'Wähle, welche VMs unter den Statistiken im Detail angezeigt werden.',
    piholeQueries: 'Anfragen',
    piholeBlocked: 'Blockiert',
    piholeDomains: 'Domains',
    piholeBlockPct: 'Blockiert',
    svcUrl: 'Server-URL',
    svcName: 'Name (optional)',
    svcFillFields: 'URL und Zugangsdaten ausfüllen.',
    svcConnError: 'Verbindung nicht möglich (Zertifikat oder URL?)',
    svcHttpError: 'Serverfehler',
    svcAuthError: 'Ungültige Zugangsdaten',
    svcTimeout: 'Zeitüberschreitung der Anfrage',
    svcOpenUrl: 'URL öffnen und das Zertifikat akzeptieren',
    about: 'Über',
    aboutTagline: 'Ein minimalistischer neuer Tab für Firefox',
    aboutProject: 'Projekt',
    aboutDeveloper: 'Entwickler',
    aboutContributors: 'Mitwirkende',
    aboutContributorsLink: 'Mitwirkende ansehen',
    aboutChangelog: 'Neuerungen',
    aboutVersionLabel: 'Version',
    aboutLicense: 'Lizenz',
    aboutLicenseHint: 'Veröffentlicht unter der MIT-Lizenz: freie Open-Source-Software. Du darfst sie ohne Einschränkungen verwenden, ändern und weitergeben, sofern der Copyright-Hinweis erhalten bleibt.',
    aboutPrivacy: 'Alle deine Einstellungen werden <strong>in deinem eigenen Browser</strong> gespeichert und über dein Firefox-Konto synchronisiert. Die Erweiterung erhebt oder sendet keine personenbezogenen Daten und benötigt keine API-Schlüssel.',
    noItems: 'Keine Einträge.',
    noSections: 'Noch keine Abschnitte.',
    noFeeds: 'Keine Feeds.',
    noAssets: 'Keine Werte.',
    noChannels: 'Keine Kanäle. Füge unten einen hinzu.',
    noVideos: 'Keine Videos. Füge Kanäle über ⚙ hinzu',
    noMarketsAdded: 'Füge Werte über ⚙ hinzu',
    loadingDots: 'Lädt…',
    loadingVideos: 'Videos werden geladen…',
    errorFeed: 'Fehler beim Laden des Feeds.',
    errorMarkets: 'Fehler beim Laden — CoinGecko begrenzt möglicherweise die Anfragen. Versuche es gleich noch einmal.',
    errorChannel: 'Kanal konnte nicht geladen werden.',
    errorImageLoad: '⚠ Bild konnte nicht geladen werden',
    wallPreview: 'Vorschau',
    wallEnterUrl: 'Gib unten eine Bild-URL ein',
    searchWith: 'Suchen mit',
    searchOrUrl: 'oder URL eingeben…',
    alertFillFields: 'Bitte CoinGecko-ID und Symbol ausfüllen.',
    alertAssetExists: 'Dieser Wert existiert bereits.',
    alertFillChannel: 'Bitte die Kanal-ID eingeben.',
    alertChannelExists: 'Kanal bereits hinzugefügt.',
    alertInvalidFile: 'Ungültige Datei. Stelle sicher, dass es sich um einen Dashboard-Export handelt.',
    alertImportOk: '✓ Konfiguration erfolgreich importiert.',
    alertImportError: 'Fehler beim Lesen der Datei. Stelle sicher, dass es gültiges JSON ist.',
    alertAddFeed: 'Bitte Name und URL ausfüllen.',
    alertAddGroup: 'Bitte einen Gruppennamen eingeben.',
    alertAddSection: 'Bitte einen Abschnittsnamen eingeben.',
    importConfirmTitle: 'Konfiguration importieren von',
    importConfirmSections: 'Link-Abschnitte',
    importConfirmFeeds: 'RSS-Feeds',
    importConfirmMarkets: 'Marktwerte',
    importConfirmChannels: 'Videokanäle',
    importConfirmWarning: 'Dadurch wird deine aktuelle Konfiguration ersetzt.',
    exportFilename: 'dashboard-config',
    syncActiveMsg: '⇅ Firefox Sync aktiv',
    syncLocalMsg: 'lokal (keine Synchronisierung)',
    feedsRss: 'RSS-Feeds',
    newLinkIn: 'Neuer Link in:',
    rssUrl: 'RSS-URL',
    coingeckoId: 'CoinGecko-ID',
    channelId: 'Kanal-ID',
    slug: 'Slug',
    videosTip: '💡 Tipp: Hat der Kanal eine URL mit <em>@Name</em>, findest du die Kanal-ID auf <a href="https://www.youtube.com/@name/about" target="_blank" style="color:var(--accent-warm)">der Infoseite</a> → Teilen → Kanal-ID kopieren.',
    groups: 'Gruppen',
    linksWord: 'Links',
    addGroupBtn: '+ Gruppe',
    addLinkBtn: '+ Link',
    noBackground: 'Kein Hintergrund',
    monitorsFound: 'Monitore gefunden',
    weekShort: 'Wo.',
  },
};

let currentLang = 'es';
let t = LANGUAGES.es; // active translations shortcut

function applyLang(langCode, save=true) {
  currentLang = langCode;
  t = LANGUAGES[langCode] || LANGUAGES.es;
  if (save) Store.set('gd_lang', langCode);

  // Update all data-i18n elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (t[key] !== undefined) el.textContent = t[key];
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.dataset.i18nHtml;
    if (t[key] === undefined) return;
    // Safe: content comes exclusively from our own LANGUAGES constant, never from user/network input
    const parser = new DOMParser();
    const doc = parser.parseFromString(t[key], 'text/html');
    el.textContent = '';
    doc.body.childNodes.forEach(n => el.appendChild(document.importNode(n, true)));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    if (t[key] !== undefined) el.title = t[key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (t[key] !== undefined) el.placeholder = t[key];
  });

  updatePanelHead();

  // Search input placeholder
  const si = document.getElementById('searchInput');
  if (si) si.placeholder = t.searchPlaceholder;

  // Videos label
  const vl = document.querySelector('#videosSection .section-label');
  if (vl) vl.textContent = t.videosLabel;

  // Update document lang
  document.documentElement.lang = langCode;

  // Re-render calendar with new locale
  if (typeof renderCalendar === 'function') renderCalendar();

  // Update lang selector if open
  if (typeof renderLangModal === 'function') renderLangModal();
}

// Detect the browser UI language on first install; fall back to English for
// locales we don't ship. Only reads local browser settings — nothing leaves the device.
function getBrowserLang() {
  let lang = '';
  if (typeof browser !== 'undefined' && browser.i18n && typeof browser.i18n.getUILanguage === 'function') {
    try { lang = browser.i18n.getUILanguage(); } catch {}
  }
  if (!lang && typeof navigator !== 'undefined') {
    lang = navigator.language || (navigator.languages && navigator.languages[0]) || navigator.userLanguage || '';
  }
  lang = (lang || '').toLowerCase().split('-')[0].split('_')[0];
  return (LANGUAGES[lang]) ? lang : 'en';
}

// BCP-47 locale for date/number formatting, derived from the active UI language.
function getLocale() {
  if (currentLang === 'ru') return 'ru-RU';
  if (currentLang === 'es') return 'es-ES';
  if (currentLang === 'fr') return 'fr-FR';
  if (currentLang === 'de') return 'de-DE';
  return 'en-GB';
}

function renderLangModal() {
  const list = document.getElementById('langList'); if (!list) return;
  list.innerHTML = '';
  const langs = [
    { code:'es', label:'Español', flag:'🇪🇸' },
    { code:'en', label:'English', flag:'🇬🇧' },
    { code:'ru', label:'Русский', flag:'🇷🇺' },
    { code:'fr', label:'Français', flag:'🇫🇷' },
    { code:'de', label:'Deutsch', flag:'🇩🇪' },
  ];
  langs.forEach(l => {
    const row = document.createElement('div'); row.className = 'engine-row' + (l.code === currentLang ? ' active' : '');
    const flag = document.createElement('div'); flag.className = 'engine-icon'; flag.textContent = l.flag;
    const name = document.createElement('div'); name.className = 'engine-name'; name.textContent = l.label;
    const check= document.createElement('div'); check.className = 'engine-check'; check.textContent = l.code === currentLang ? '✓' : '';
    const info = document.createElement('div'); info.style.cssText = 'flex:1';
    info.appendChild(name);
    row.appendChild(flag); row.appendChild(info); row.appendChild(check);
    row.addEventListener('click', () => { applyLang(l.code); });
    list.appendChild(row);
  });
}

// ════════════════════════════════════════════════
//  CLOCK
// ════════════════════════════════════════════════
function tick() {
  const n = new Date();
  const hh = String(n.getHours()).padStart(2,'0');
  const mm = String(n.getMinutes()).padStart(2,'0');
  document.getElementById('clock').textContent = `${hh}:${mm}`;
  document.getElementById('dateDay').textContent   = n.getDate();
  // Genitive month form when the language provides one (e.g. Russian "22 июля"); nominative otherwise
  document.getElementById('dateMonth').textContent = (t.monthsGen && t.monthsGen[n.getMonth()]) || t.months[n.getMonth()];
  document.getElementById('dateWeekday').textContent = t.days[n.getDay()];
}
tick(); setInterval(tick, 15000);

// ════════════════════════════════════════════════
//  SEARCH
// ════════════════════════════════════════════════
const SEARCH_ENGINES = [
  { id:'google',     name:'Google',        url:'https://www.google.com/search?q=',        icon:'G' },
  { id:'duckduckgo', name:'DuckDuckGo',    url:'https://duckduckgo.com/?q=',              icon:'🦆' },
  { id:'bing',       name:'Bing',          url:'https://www.bing.com/search?q=',          icon:'B' },
  { id:'brave',      name:'Brave Search',  url:'https://search.brave.com/search?q=',      icon:'🦁' },
  { id:'startpage',  name:'Startpage',     url:'https://www.startpage.com/search?q=',     icon:'S' },
  { id:'ecosia',     name:'Ecosia',        url:'https://www.ecosia.org/search?q=',        icon:'🌱' },
  { id:'kagi',       name:'Kagi',          url:'https://kagi.com/search?q=',              icon:'K' },
  { id:'perplexity', name:'Perplexity',    url:'https://www.perplexity.ai/search?q=',     icon:'P' },
];
let activeEngine = SEARCH_ENGINES[0];
document.getElementById('searchInput').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const v = e.target.value.trim(); if (!v) return;
  window.location.href = /^https?:\/\//.test(v) ? v
    : v.includes('.')&&!v.includes(' ') ? 'https://'+v
    : activeEngine.url + encodeURIComponent(v);
});

function applyEngine(engineId, save=true) {
  const eng = SEARCH_ENGINES.find(e => e.id === engineId) || SEARCH_ENGINES[0];
  activeEngine = eng;
  const input = document.getElementById('searchInput');
  if (input) input.placeholder = t.searchWith + ' ' + eng.name + ' ' + t.searchOrUrl;
  if (save) Store.set('gd_engine', engineId);
}

// ════════════════════════════════════════════════
//  SMART ICONS — Simple Icons + favicon fallback
// ════════════════════════════════════════════════
const SI_BASE = 'https://cdn.simpleicons.org/';

// Map common app names to their Simple Icons slug
// Simple Icons slugs are lowercase, no spaces, no special chars
function toSimpleIconSlug(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Known overrides where the slug differs from the name
const SI_OVERRIDES = {
  'microsoft365': 'microsoft365',
  'm365': 'microsoft365',
  'office365': 'microsoft365',
  'office 365': 'microsoft365',
  'microsoft 365': 'microsoft365',
  'onedrive': 'microsoftonedrive',
  'sharepoint': 'microsoftsharepoint',
  'teams': 'microsoftteams',
  'azure': 'microsoftazure',
  'outlook': 'microsoftoutlook',
  'protonmail': 'proton',
  'proton mail': 'proton',
  'openerp': 'odoo',
  'odoo': 'odoo',
  'proxmox': 'proxmox',
  'portainer': 'portainer',
  'plex': 'plex',
  'nextcloud': 'nextcloud',
  'truenas': 'truenas',
  'unifi': 'ubiquiti',
  'ubiquiti': 'ubiquiti',
  'pihole': 'pihole',
  'pi-hole': 'pihole',
  'wireguard': 'wireguard',
  'vaultwarden': 'bitwarden',
  'bitwarden': 'bitwarden',
  'adguard': 'adguard',
  'grafana': 'grafana',
  'netdata': 'netdata',
  'traefik': 'traefikproxy',
  'uptime kuma': 'uptimekuma',
  'uptimekuma': 'uptimekuma',
  'paperless': 'paperlessngx',
  'homer': 'homer',
  'github': 'github',
  'gitlab': 'gitlab',
  'jira': 'jira',
  'confluence': 'confluence',
  'notion': 'notion',
  'slack': 'slack',
  'discord': 'discord',
  'telegram': 'telegram',
  'whatsapp': 'whatsapp',
  'gmail': 'gmail',
  'google': 'google',
  'googledrive': 'googledrive',
  'google drive': 'googledrive',
  'dropbox': 'dropbox',
  'figma': 'figma',
  'linear': 'linear',
  'vercel': 'vercel',
  'netlify': 'netlify',
  'cloudflare': 'cloudflare',
  'aws': 'amazonaws',
  'amazon': 'amazonaws',
  'digitalocean': 'digitalocean',
  'hetzner': 'hetzner',
  'ovh': 'ovh',
  'plesk': 'plesk',
  'wordpress': 'wordpress',
  'nginx': 'nginx',
  'apache': 'apache',
  'docker': 'docker',
  'kubernetes': 'kubernetes',
  'terraform': 'terraform',
  'ansible': 'ansible',
  'jenkins': 'jenkins',
  'sonarqube': 'sonarqube',
  'elasticsearch': 'elasticsearch',
  'kibana': 'kibana',
  'redis': 'redis',
  'postgresql': 'postgresql',
  'mysql': 'mysql',
  'mongodb': 'mongodb',
  'influxdb': 'influxdb',
  'minio': 'minio',
  'synology': 'synology',
  'qnap': 'qnap',
  'pfsense': 'pfsense',
  'opnsense': 'opnsense',
  'mikrotik': 'mikrotik',
  'eset': 'eset',
  'acronis': 'acronis',
  'veeam': 'veeam',
  'adobe': 'adobe',
  'intranet': null,  // no simple icon, use favicon
};

function getSimpleIconUrl(name, url) {
  const key = name.toLowerCase().trim();
  // Check overrides first
  if (key in SI_OVERRIDES) {
    const slug = SI_OVERRIDES[key];
    return slug ? SI_BASE + slug + '/ffffff/1' : null;
  }
  // Try derived slug from name
  const slug = toSimpleIconSlug(name);
  if (slug.length >= 2) return SI_BASE + slug + '/ffffff/1';
  return null;
}

// Links created before 'openIn' existed only carry the boolean sameTab
function linkOpenMode(l) { return l.openIn || (l.sameTab ? 'same' : 'new'); }
function openInNewWindow(url) {
  if (typeof browser !== 'undefined' && browser.windows) browser.windows.create({ url });
  else window.open(url, '_blank', 'noopener,noreferrer,popup');
}

function mkLinkIcon(link) {
  const wrap = document.createElement('div'); wrap.className = 'link-icon-wrap';
  const img = document.createElement('img'); img.className = 'link-fav';
  const origin = (() => { try { return new URL(link.url).origin; } catch { return ''; } })();

  const fallbackToFavicon = () => {
    if (origin) {
      img.src = 'https://www.google.com/s2/favicons?domain=' + origin + '&sz=32';
      img.onerror = () => img.style.display = 'none';
    } else { img.style.display = 'none'; }
  };

  if (link.icon) {
    // Use stored icon (user-confirmed or auto-suggested)
    img.src = link.icon;
    img.onerror = fallbackToFavicon;
  } else {
    // Auto-resolve on render
    const siUrl = getSimpleIconUrl(link.name, link.url);
    if (siUrl) {
      img.src = siUrl;
      img.onerror = fallbackToFavicon;
    } else { fallbackToFavicon(); }
  }

  wrap.appendChild(img);
  return wrap;
}

// ════════════════════════════════════════════════
//  RENDER SECTIONS (main area)
// ════════════════════════════════════════════════
function renderSections() {
  const el = document.getElementById('sectionsEl'); el.innerHTML = '';
  if (!sections.length) {
    const ns = document.createElement('div'); ns.style.cssText='color:var(--text-muted);font-size:12px;padding:20px 0'; ns.textContent=t.noSections; el.appendChild(ns);
    return;
  }
  sections.forEach(sec => {
    const block = document.createElement('div'); block.className = 'section-block';
    const label = document.createElement('div'); label.className = 'section-label'; label.textContent = sec.name.toUpperCase();
    block.appendChild(label);
    const row = document.createElement('div'); row.className = 'groups-row';
    sec.groups.forEach(g => {
      const col = document.createElement('div'); col.className = 'group-col';
      const name = document.createElement('div'); name.className = 'group-col-name'; name.textContent = g.name;
      col.appendChild(name);
      g.links.forEach(l => {
        const a = document.createElement('a'); a.className = 'link-row'; a.href = l.url;
        const mode = linkOpenMode(l);
        if (mode === 'same') a.target = '_self';
        else { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        if (mode === 'window') a.addEventListener('click', e => { e.preventDefault(); openInNewWindow(l.url); });
        a.appendChild(mkLinkIcon(l));
        const nm = document.createElement('span'); nm.className = 'link-name'; nm.textContent = l.name;
        const arr = document.createElement('span'); arr.className = 'link-arrow'; arr.textContent = '↗';
        a.appendChild(nm); a.appendChild(arr);
        col.appendChild(a);
      });
      row.appendChild(col);
    });
    block.appendChild(row);
    el.appendChild(block);
  });
}

// ════════════════════════════════════════════════
//  RSS FEEDS
// ════════════════════════════════════════════════
const RSS_PROXY = 'https://api.rss2json.com/v1/api.json?rss_url=';
const FEED_MAX  = 20;

// Fetch all feeds in parallel, merge and sort by date desc, max 20 items
async function renderFeedTabs() {
  const tabBar = document.getElementById('feedTabBar');
  const content = document.getElementById('feedContent');
  tabBar.innerHTML = '';

  if (!feeds.length) {
    setMsg(content, 'feed-empty', t.feedEmpty || 'Add an RSS feed.');
    return;
  }

  setMsg(content, 'feed-empty', t.loadingDots);

  // Fetch all feeds in parallel
  const results = await Promise.all(feeds.map(async feed => {
    if (feedCache[feed.id]) return feedCache[feed.id];
    try {
      const res  = await fetch(RSS_PROXY + encodeURIComponent(feed.url));
      const data = await res.json();
      if (data.status !== 'ok') throw new Error();
      const items = (data.items || []).map(item => ({
        title:    item.title,
        link:     item.link,
        pubDate:  item.pubDate ? new Date(item.pubDate) : new Date(0),
        domain:   (() => { try { return new URL(item.link).hostname.replace('www.',''); } catch { return ''; } })(),
        feed:     feed.name,
      }));
      feedCache[feed.id] = items;
      return items;
    } catch { return []; }
  }));

  // Merge, sort newest first, cap at 20
  const all = results
    .flat()
    .sort((a, b) => b.pubDate - a.pubDate)
    .slice(0, FEED_MAX);

  renderFeedRows(all, content);
}

function renderFeedRows(items, container) {
  if (!items.length) { setMsg(container, 'feed-empty', t.noItems); return; }
  const list = document.createElement('div'); list.className = 'feed-list feed-list-scroll';
  items.forEach((item, i) => {
    const row = document.createElement('div'); row.className = 'feed-row';
    const locale = getLocale();
    const pub = item.pubDate && item.pubDate.getTime() > 0
      ? item.pubDate.toLocaleDateString(locale, { day:'2-digit', month:'short' })
      : '';
    const num  = document.createElement('span'); num.className = 'row-num'; num.textContent = String(i+1).padStart(2,'0');
    const body = document.createElement('div'); body.className = 'row-body';
    const title= document.createElement('div'); title.className = 'row-title'; title.textContent = item.title;
    const meta = document.createElement('div'); meta.className = 'row-meta';
    meta.textContent = [item.feed, item.domain, pub].filter(Boolean).join(' · ');
    body.appendChild(title); body.appendChild(meta);
    row.appendChild(num); row.appendChild(body);
    row.addEventListener('click', () => window.open(item.link, '_blank'));
    list.appendChild(row);
  });
  container.innerHTML = ''; container.appendChild(list);
}

function refreshFeeds() { feedCache = {}; renderFeedTabs(); }

// ════════════════════════════════════════════════
//  WEATHER (Open-Meteo — no API key needed)
// ════════════════════════════════════════════════
async function loadWeather() {
  try {
    // Valencia coords
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=39.47&longitude=-0.37&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&wind_speed_unit=kmh');
    const d = await res.json(); const c = d.current;
    const desc = (t.weatherCodes && t.weatherCodes[c.weather_code]) || '';
    const tempEl = document.querySelector('.weather-temp');
    tempEl.textContent = Math.round(c.temperature_2m);
    const sup = document.createElement('sup'); sup.textContent = '°C';
    tempEl.appendChild(sup);
    document.getElementById('weatherDesc').textContent = desc + ' · Valencia';
    document.getElementById('wWind').textContent = Math.round(c.wind_speed_10m) + 'km/h';
    document.getElementById('wHum').textContent  = c.relative_humidity_2m + '%';
    document.getElementById('wFeel').textContent = Math.round(c.apparent_temperature) + '°C';
  } catch {}
}

// ════════════════════════════════════════════════
//  WIDGETS — layout, manager and settings-nav filter
// ════════════════════════════════════════════════
const widgetName = id => { const w = WIDGETS.find(x => x.id===id); return (w && t[w.i18n]) || id; };

// Reconcile stored widgets with the registry: keep known ids in stored order,
// append any registry widgets missing from storage (forward compatibility),
// drop unknown ids.
function normalizeWidgets(stored) {
  const known = new Set(WIDGETS.map(w => w.id));
  const seen = new Set();
  const out = [];
  (stored || []).forEach(w => {
    if (w && known.has(w.id) && !seen.has(w.id)) {
      out.push({ id:w.id, active: !!w.active, col: (w.col==='right' ? 'right' : 'left') });
      seen.add(w.id);
    }
  });
  DEFAULT_WIDGETS.forEach(d => { if (!seen.has(d.id)) out.push({ ...d }); });
  return out;
}

// Place each widget's DOM node into its column in order; hide inactive ones;
// collapse a bar when it has no active widgets.
function renderWidgetLayout() {
  const left  = document.getElementById('leftWidgets');
  const right = document.getElementById('rightWidgets');
  if (!left || !right) return;
  let nLeft = 0, nRight = 0;
  widgets.forEach(w => {
    const el = document.getElementById('w-' + w.id);
    if (!el) return;
    if (!w.active) { el.style.display = 'none'; return; }
    el.style.display = '';
    (w.col === 'right' ? right : left).appendChild(el);   // appendChild moves + reorders
    if (w.col === 'right') nRight++; else nLeft++;
  });
  document.body.classList.toggle('no-left',  nLeft === 0);
  document.body.classList.toggle('no-right', nRight === 0);
}

// Only show config tabs of active widgets; hide the Widgets-group separator if empty.
function renderModalNav() {
  const active = new Set(widgets.filter(w => w.active).map(w => w.id));
  let anyWidgetTab = false;
  document.querySelectorAll('.modal-tab[data-widget-tab]').forEach(tab => {
    const on = active.has(tab.dataset.widgetTab);
    tab.style.display = on ? '' : 'none';
    if (on) anyWidgetTab = true;
  });
  const sep = document.getElementById('navSepWidgets');
  if (sep) sep.style.display = anyWidgetTab ? '' : 'none';
}

// Manager row actions
function toggleWidget(id) {
  const w = widgets.find(x => x.id===id); if (!w) return;
  w.active = !w.active;
  saveWidgets(); renderWidgetLayout(); renderModalNav(); renderWidgetsModal();
}

// Two columns (left / right bar); drag a widget to reorder it or move it to the other column
function renderWidgetsModal() {
  const box = document.getElementById('widgetManager'); if (!box) return;
  box.textContent = '';
  [['left', t.colLeft], ['right', t.colRight]].forEach(([col, label]) => {
    const colEl = document.createElement('div'); colEl.className = 'widget-col';
    const items = widgets.filter(w => (w.col === 'right' ? 'right' : 'left') === col);

    const head = document.createElement('div'); head.className = 'widget-col-head';
    const title = document.createElement('span'); title.textContent = label;
    const count = document.createElement('span'); count.className = 'widget-col-count'; count.textContent = String(items.length);
    head.appendChild(title); head.appendChild(count);

    const list = document.createElement('div'); list.className = 'widget-col-list';
    makeDropList(list, 'widget', { col }, t.dropWidgetsHere);
    items.forEach(w => {
      const row = document.createElement('div'); row.className = 'widget-row' + (w.active ? '' : ' inactive');

      // Active toggle (switch)
      const sw = document.createElement('button');
      sw.className = 'widget-switch' + (w.active ? ' on' : '');
      sw.setAttribute('role', 'switch');
      sw.setAttribute('aria-checked', w.active ? 'true' : 'false');
      const knob = document.createElement('span'); knob.className = 'widget-switch-knob'; sw.appendChild(knob);
      sw.addEventListener('click', () => toggleWidget(w.id));

      const name = document.createElement('div'); name.className = 'widget-row-name'; name.textContent = widgetName(w.id);

      row.appendChild(makeGrip()); row.appendChild(name); row.appendChild(sw);
      makeDraggable(row, 'widget', { widgetId: w.id }, row);
      list.appendChild(row);
    });

    colEl.appendChild(head); colEl.appendChild(list);
    box.appendChild(colEl);
  });
  lastDropped = null;
}

// ════════════════════════════════════════════════
//  MODAL
// ════════════════════════════════════════════════
function openModal(tab='links') { document.getElementById('modalOverlay').classList.add('open'); renderModalNav(); switchTab(tab); }
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); resetPending(); }
function resetPending() { pendingSection=null; pendingGroup=null; hideForms(); }

// Add/edit forms live in their own dialog on top of the settings modal
const FORM_IDS = ['addSectionForm','addGroupForm','addLinkForm','editLinkForm','addChannelForm','addFeedForm','presetPanel','addMarketForm','marketPresetPanel'];
function showForm(id) {
  FORM_IDS.forEach(f => { document.getElementById(f).style.display = f===id ? 'flex' : 'none'; });
  document.getElementById('formOverlay').classList.add('open');
}
function hideForms() {
  renameTarget = null;
  FORM_IDS.forEach(f => { document.getElementById(f).style.display = 'none'; });
  document.getElementById('formOverlay').classList.remove('open');
}
function setFormTexts(form, title, btn) {
  const f = document.getElementById(form);
  f.querySelector('.add-form-title [data-i18n], .add-form-title[data-i18n]').textContent = title;
  f.querySelector('.btn-primary').textContent = btn;
}
function openEditSection(sectionId) {
  const sec = sections.find(s => s.id===sectionId); if (!sec) return;
  pendingSection = null; pendingGroup = null; renameTarget = { sectionId };
  setFormTexts('addSectionForm', t.editSection, t.save);
  document.getElementById('sName').value = sec.name;
  showForm('addSectionForm');
  document.getElementById('sName').focus();
}
function openEditGroup(sectionId, groupId) {
  const sec = sections.find(s => s.id===sectionId);
  const grp = sec && sec.groups.find(g => g.id===groupId); if (!grp) return;
  pendingSection = null; pendingGroup = null; renameTarget = { sectionId, groupId };
  setFormTexts('addGroupForm', t.editGroup + ':', t.save);
  document.getElementById('addGroupSectionName').textContent = sec.name;
  document.getElementById('gName').value = grp.name;
  showForm('addGroupForm');
  document.getElementById('gName').focus();
}
function openAddSection() {
  pendingSection = null; pendingGroup = null; renameTarget = null;
  setFormTexts('addSectionForm', t.newSection, t.createSection);
  document.getElementById('sName').value = '';
  showForm('addSectionForm');
  document.getElementById('sName').focus();
}

// Title + one-line description shown at the top of the active settings panel
function updatePanelHead() {
  const tab = document.querySelector('.modal-tab.active');
  if (!tab) return;
  document.getElementById('panelTitle').textContent = tab.querySelector('span').textContent;
  document.getElementById('panelDesc').textContent = t['desc_' + tab.dataset.tab] || '';
}

function switchTab(tab) {
  document.querySelectorAll('.modal-tab').forEach(t => t.classList.toggle('active', t.dataset.tab===tab));
  document.querySelectorAll('.modal-panel').forEach(p => p.classList.toggle('active', p.id==='tab-'+tab || p.dataset.in===tab));
  updatePanelHead();
  document.querySelector('.modal-body').scrollTop = 0;
  if (tab==='links') renderSectionModal();
  if (tab==='feeds') renderFeedModal();
  if (tab==='markets') renderMarketModal();
  if (tab==='general') { renderEngineModal(); renderLangModal(); }
  if (tab==='uptime')  renderUptimeModal();
  if (tab==='proxmox') renderProxmoxModal();
  if (tab==='docker')  renderDockerModal();
  if (tab==='pihole')  renderPiholeModal();
  if (tab==='videos')  renderVideoChannelModal();
  if (tab==='widgets') renderWidgetsModal();
  if (tab==='about')   renderAbout();
  if (tab==='appearance') renderThemeModal();
  if (tab==='background') { renderGradientPresets(); renderWallSource(); updateWallPreview(wallSettings.type==='gradient' ? wallSettings.grad : ((wallSettings.type==='image'||wallSettings.type==='bing') ? wallSettings.src : null)); }
}

// ── Section / Group / Link modal ──
function makeBtn(cls, text, fn) {
  const b = document.createElement('button'); b.className=cls; b.textContent=text;
  b.addEventListener('click', fn); return b;
}

// Clicking a row's text opens its edit dialog
function makeEditable(el, fn) {
  el.classList.add('click-edit'); el.title = t.clickToEdit;
  el.addEventListener('click', fn);
}

// Dashed "add here" slot: shows where something can be added
function makeAddSlot(kind, label, fn) {
  const d = document.createElement('div');
  d.className = 'add-slot add-slot-' + kind; d.tabIndex = 0; d.setAttribute('role', 'button');
  const ic = document.createElement('span'); ic.className = 'add-slot-icon'; ic.textContent = '+';
  const tx = document.createElement('span'); tx.className = 'add-slot-label'; tx.textContent = label;
  d.appendChild(ic); d.appendChild(tx);
  d.addEventListener('click', fn);
  d.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
  return d;
}
function makeGrip() {
  const g = document.createElement('span'); g.className = 'drag-grip'; g.textContent = '⋮⋮'; g.title = t.dragToReorder;
  return g;
}

function renderSectionModal() {
  const list = document.getElementById('sectionItemList'); list.textContent = '';
  makeDropList(list, 'section', {});
  if (!sections.length) setMsg(list, 'empty-state', t.noSections);

  sections.forEach(sec => {
    // Section card
    const sc = document.createElement('div'); sc.className = 'item-card dnd-section';

    const scHead = document.createElement('div'); scHead.className = 'dnd-head';
    const scInfo = document.createElement('div'); scInfo.className = 'item-card-info';
    const scName = document.createElement('div'); scName.className = 'item-card-name'; scName.textContent = sec.name;
    const scSub  = document.createElement('div'); scSub.className = 'item-card-sub'; scSub.textContent = sec.groups.length + ' ' + t.groups;
    scInfo.appendChild(scName); scInfo.appendChild(scSub);
    makeEditable(scInfo, () => openEditSection(sec.id));

    const scAct = document.createElement('div'); scAct.className = 'item-card-actions';
    scAct.appendChild(makeBtn('btn btn-danger btn-sm', '×', () => deleteSection(sec.id)));

    scHead.appendChild(makeGrip()); scHead.appendChild(scInfo); scHead.appendChild(scAct);
    sc.appendChild(scHead);

    // Groups inside section
    const subList = document.createElement('div'); subList.className = 'modal-sub-list';
    makeDropList(subList, 'group', { sectionId: sec.id }, t.dropGroupsHere);
    sec.groups.forEach(g => {
      const gc = document.createElement('div'); gc.className = 'modal-sub-card dnd-group';

      const gcHead = document.createElement('div'); gcHead.className = 'dnd-head';
      const gcInfo = document.createElement('div'); gcInfo.className = 'item-card-info';
      const gcName = document.createElement('div'); gcName.className = 'item-card-name'; gcName.style.fontSize = '11.5px'; gcName.textContent = g.name;
      const gcSub  = document.createElement('div'); gcSub.className = 'item-card-sub'; gcSub.textContent = g.links.length + ' ' + t.linksWord;
      gcInfo.appendChild(gcName); gcInfo.appendChild(gcSub);
      makeEditable(gcInfo, () => openEditGroup(sec.id, g.id));

      const gcAct = document.createElement('div'); gcAct.className = 'item-card-actions';
      gcAct.appendChild(makeBtn('btn btn-danger btn-sm', '×', () => deleteGroup(sec.id, g.id)));

      gcHead.appendChild(makeGrip()); gcHead.appendChild(gcInfo); gcHead.appendChild(gcAct);
      gc.appendChild(gcHead);

      // Links inside group
      const lList = document.createElement('div'); lList.className = 'link-drag-list';
      makeDropList(lList, 'link', { sectionId: sec.id, groupId: g.id }, t.dropLinksHere);
      g.links.forEach(l => {
        const lc = document.createElement('div'); lc.className = 'link-drag-row';
        const lInfo = document.createElement('div'); lInfo.style.cssText = 'flex:1;min-width:0;';
        const lName = document.createElement('span'); lName.style.cssText = 'font-size:11px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'; lName.textContent = l.name;
        const lSub  = document.createElement('span'); lSub.style.cssText = 'font-size:9.5px;color:var(--text-muted);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'; lSub.textContent = l.url;
        lInfo.appendChild(lName); lInfo.appendChild(lSub);
        makeEditable(lInfo, () => openEditLink(sec.id, g.id, l.id));
        const lAct = document.createElement('div'); lAct.className = 'item-card-actions';
        lAct.appendChild(makeBtn('btn btn-danger btn-sm', '×', () => deleteLink(sec.id, g.id, l.id)));
        lc.appendChild(makeGrip()); lc.appendChild(lInfo); lc.appendChild(lAct);
        makeDraggable(lc, 'link', { sectionId: sec.id, groupId: g.id, linkId: l.id }, lc);
        lList.appendChild(lc);
      });
      lList.appendChild(makeAddSlot('link', t.slotNewLink, () => openAddLink(sec.id, g.id)));
      gc.appendChild(lList);

      makeDraggable(gc, 'group', { sectionId: sec.id, groupId: g.id }, gcHead);
      subList.appendChild(gc);
    });
    subList.appendChild(makeAddSlot('group', t.slotNewGroup, () => openAddGroup(sec.id)));
    sc.appendChild(subList);

    makeDraggable(sc, 'section', { sectionId: sec.id }, scHead);
    list.appendChild(sc);
  });
  list.appendChild(makeAddSlot('section', t.slotNewSection, openAddSection));
  lastDropped = null;
}

// Pending add forms
function openAddGroup(sectionId) {
  pendingSection = sectionId; pendingGroup = null; renameTarget = null;
  setFormTexts('addGroupForm', t.newGroupIn, t.createGroup);
  const sec = sections.find(s => s.id===sectionId);
  document.getElementById('addGroupSectionName').textContent = sec ? sec.name : '';
  showForm('addGroupForm');
  document.getElementById('gName').value = '';
  document.getElementById('gName').focus();
}
function openAddLink(sectionId, groupId) {
  pendingGroup = { sectionId, groupId }; pendingSection = null;
  const sec = sections.find(s => s.id===sectionId);
  const grp = sec && sec.groups.find(g => g.id===groupId);
  document.getElementById('addLinkGroupName').textContent = grp ? grp.name : '';
  showForm('addLinkForm');
  document.getElementById('lName').value = '';
  document.getElementById('lUrl').value  = '';
  document.getElementById('lIcon').value = '';
  document.getElementById('lOpen').value = 'new';
  updateIconPreview('');
  document.getElementById('lName').focus();
}

// ── Icon preview helpers ──
let _iconDebounce = null;
function updateIconPreview(url) {
  const img  = document.getElementById('iconPreviewImg');
  const empty= document.getElementById('iconPreviewEmpty');
  if (!url) {
    img.src=''; img.classList.remove('loaded');
    if (empty) empty.style.display='';
    return;
  }
  img.onload  = () => { img.classList.add('loaded'); if(empty) empty.style.display='none'; };
  img.onerror = () => { img.classList.remove('loaded'); if(empty) empty.style.display=''; };
  img.src = url;
}

function suggestIcon() {
  const name = document.getElementById('lName').value.trim();
  const url  = document.getElementById('lUrl').value.trim();
  const customIcon = document.getElementById('lIcon').value.trim();
  // Don't override if user has manually set an icon
  if (customIcon) { updateIconPreview(customIcon); return; }
  // Build suggestion
  let suggested = '';
  if (name) {
    const siUrl = getSimpleIconUrl(name, url);
    if (siUrl) suggested = siUrl;
  }
  if (!suggested && url) {
    try {
      const origin = new URL(url).origin;
      suggested = 'https://www.google.com/s2/favicons?domain=' + origin + '&sz=32';
    } catch {}
  }
  document.getElementById('lIcon').value = suggested;
  updateIconPreview(suggested);
}

// CRUD
function addSection() {
  const name = document.getElementById('sName').value.trim(); if (!name) { alert(t.alertAddSection); return; }
  if (renameTarget) {
    const sec = sections.find(s => s.id===renameTarget.sectionId);
    if (sec) sec.name = name;
    renameTarget = null;
  } else sections.push({ id:uid(), name, groups:[] });
  document.getElementById('sName').value='';
  hideForms();
  save(); renderSections(); renderSectionModal();
}
function deleteSection(id) { sections = sections.filter(s => s.id!==id); save(); renderSections(); renderSectionModal(); }
function addGroup() {
  const name = document.getElementById('gName').value.trim(); if (!name) return;
  if (renameTarget) {
    const sec = sections.find(s => s.id===renameTarget.sectionId);
    const grp = sec && sec.groups.find(g => g.id===renameTarget.groupId);
    if (grp) grp.name = name;
    renameTarget = null; hideForms();
    save(); renderSections(); renderSectionModal();
    return;
  }
  if (!pendingSection) return;
  const sec = sections.find(s => s.id===pendingSection); if (!sec) return;
  sec.groups.push({ id:uid(), name, links:[] });
  hideForms();
  pendingSection=null;
  save(); renderSections(); renderSectionModal();
}
function deleteGroup(sectionId, groupId) {
  const sec = sections.find(s => s.id===sectionId); if (!sec) return;
  sec.groups = sec.groups.filter(g => g.id!==groupId);
  save(); renderSections(); renderSectionModal();
}
function addLink() {
  const name = document.getElementById('lName').value.trim();
  const url  = document.getElementById('lUrl').value.trim();
  const icon = document.getElementById('lIcon').value.trim() || null;
  if (!name||!url||!pendingGroup) return;
  const sec = sections.find(s => s.id===pendingGroup.sectionId); if (!sec) return;
  const grp = sec.groups.find(g => g.id===pendingGroup.groupId); if (!grp) return;
  const openIn = document.getElementById('lOpen').value;
  grp.links.push({ id:uid(), name, url, icon, openIn });
  hideForms(); pendingGroup=null;
  save(); renderSections(); renderSectionModal();
}
function deleteLink(sectionId, groupId, linkId) {
  const sec = sections.find(s => s.id===sectionId); if (!sec) return;
  const grp = sec.groups.find(g => g.id===groupId); if (!grp) return;
  grp.links = grp.links.filter(l => l.id!==linkId);
  save(); renderSections(); renderSectionModal();
}
// Drag & drop reordering of sections, groups and links. The whole item follows the cursor,
// the original collapses and an animated gap opens where it will land. Groups and links can
// also move into another section/group.
let dragState = null;   // {kind, ids, height}
let dragGap = null;     // the placeholder element
let lastDropped = null; // id of the item to flash after the re-render

function dndId(kind, ids) { return ids[kind + 'Id']; }
function removeDragGap() { if (dragGap) { dragGap.remove(); dragGap = null; } }
function getDragGap() {
  if (!dragGap) {
    dragGap = document.createElement('div'); dragGap.className = 'drop-gap';
    const lbl = document.createElement('span'); lbl.textContent = '↓ ' + t.dropHere;
    dragGap.appendChild(lbl);
  }
  dragGap.style.setProperty('--gap-h', dragState.height + 'px');
  return dragGap;
}
// Put the gap before a reference node (or at the end, above the add slot) unless it is already there
function placeGap(list, before) {
  const gap = getDragGap();
  before = before || list.querySelector(':scope > .add-slot');
  if (before === gap) return;
  if (gap.parentNode === list && (before ? gap.nextSibling === before : !gap.nextSibling)) return;
  list.insertBefore(gap, before || null);
}
function endDrag() {
  document.body.classList.remove('dnd-active');
  document.querySelectorAll('.dnd-item.dragging').forEach(r => { r.classList.remove('dragging'); r.style.height = ''; });
  removeDragGap(); dragState = null;
}

function makeDraggable(el, kind, ids, handle) {
  const id = dndId(kind, ids);
  el.classList.add('dnd-item'); el.draggable = true;
  el.dataset.kind = kind; el.dataset.dndId = id;
  if (id === lastDropped) el.classList.add('just-dropped');

  el.addEventListener('dragstart', e => {
    e.stopPropagation(); // nested items: only the innermost one starts a drag
    const hr = handle.getBoundingClientRect(), er = el.getBoundingClientRect();
    dragState = { kind, ids, height: hr.height };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id); // Firefox needs data to start a drag
    // Drag image: a solid, highlighted copy of the item's header row
    const ghost = handle.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.width = hr.width + 'px';
    document.body.appendChild(ghost);
    const ox = Math.min(Math.max(e.clientX - hr.left, 0), hr.width);
    const oy = Math.min(Math.max(e.clientY - hr.top, 0), hr.height);
    e.dataTransfer.setDragImage(ghost, ox, oy);
    setTimeout(() => ghost.remove(), 0);
    // Collapse the original after the browser has taken its snapshot
    el.style.height = er.height + 'px';
    setTimeout(() => { el.classList.add('dragging'); document.body.classList.add('dnd-active'); }, 0);
  });
  el.addEventListener('dragend', endDrag);
  el.addEventListener('dragover', e => {
    if (!dragState || dragState.kind !== kind) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    if (id === dndId(kind, dragState.ids)) return;
    const r = el.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    placeGap(el.parentNode, after ? el.nextSibling : el);
  });
}

function makeDropList(list, kind, ids, emptyText) {
  list.dataset.listKind = kind;
  if (ids.sectionId) list.dataset.sectionId = ids.sectionId;
  if (ids.groupId)   list.dataset.groupId = ids.groupId;
  if (ids.col)       list.dataset.col = ids.col;
  if (emptyText) { // shown only while dragging, so an empty group/section can still receive items
    const hint = document.createElement('div'); hint.className = 'dnd-empty-hint'; hint.textContent = emptyText;
    list.appendChild(hint);
  }
  if (list._dndBound) return; // #sectionItemList persists between renders
  list._dndBound = true;
  list.addEventListener('dragover', e => {
    if (!dragState || dragState.kind !== kind) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    // Over empty space or the hint: open the gap at the end
    if (!e.target.closest('.dnd-item[data-kind="' + kind + '"]') && !e.target.closest('.drop-gap')) placeGap(list, null);
  });
  list.addEventListener('drop', e => {
    if (!dragState || dragState.kind !== kind) return;
    e.preventDefault();
    // Target position = whatever item follows the gap (ignoring the collapsed source)
    const srcId = dndId(kind, dragState.ids);
    let beforeId = null;
    if (dragGap && dragGap.parentNode === list) {
      for (let n = dragGap.nextSibling; n; n = n.nextSibling) {
        if (n.dataset && n.dataset.kind === kind && n.dataset.dndId !== srcId) { beforeId = n.dataset.dndId; break; }
      }
    }
    const from = dragState;
    endDrag();
    commitMove(from.kind, from.ids, { sectionId: list.dataset.sectionId, groupId: list.dataset.groupId, col: list.dataset.col }, beforeId);
  });
}

// Remove the item from its old place and insert it before `beforeId` (or at the end) of the target list
function insertBefore(arr, item, beforeId) {
  const ti = beforeId ? arr.findIndex(x => x.id === beforeId) : -1;
  if (ti < 0) arr.push(item); else arr.splice(ti, 0, item);
}
function commitMove(kind, from, to, beforeId) {
  let moved = null;
  if (kind === 'section') {
    const i = sections.findIndex(x => x.id === from.sectionId); if (i < 0) return;
    [moved] = sections.splice(i, 1);
    insertBefore(sections, moved, beforeId);
  } else if (kind === 'group') {
    const src = sections.find(x => x.id === from.sectionId), dst = sections.find(x => x.id === to.sectionId);
    if (!src || !dst) return;
    const i = src.groups.findIndex(g => g.id === from.groupId); if (i < 0) return;
    [moved] = src.groups.splice(i, 1);
    insertBefore(dst.groups, moved, beforeId);
  } else if (kind === 'widget') {
    // Order is the array order; the column is just a property, so appending = last in its column
    const i = widgets.findIndex(w => w.id === from.widgetId); if (i < 0) return;
    [moved] = widgets.splice(i, 1);
    moved.col = to.col;
    insertBefore(widgets, moved, beforeId);
    lastDropped = moved.id;
    saveWidgets(); renderWidgetLayout(); renderWidgetsModal();
    return;
  } else if (kind === 'feed') {
    const i = feeds.findIndex(f => f.id === from.feedId); if (i < 0) return;
    [moved] = feeds.splice(i, 1);
    insertBefore(feeds, moved, beforeId);
    lastDropped = moved.id;
    saveFeeds(); renderFeedModal(); renderFeedTabs();
    return;
  } else if (kind === 'market') {
    const i = markets.findIndex(m => m.id === from.marketId); if (i < 0) return;
    [moved] = markets.splice(i, 1);
    insertBefore(markets, moved, beforeId);
    lastDropped = moved.id;
    saveMarkets(); renderMarketModal(); loadMarkets();
    return;
  } else if (kind === 'channel') {
    const i = channels.findIndex(c => c.id === from.channelId); if (i < 0) return;
    [moved] = channels.splice(i, 1);
    insertBefore(channels, moved, beforeId);
    lastDropped = moved.id;
    saveChannels(); renderVideoChannelModal(); videoCache = {}; loadVideos();
    return;
  } else {
    const src = sections.find(x => x.id === from.sectionId)?.groups.find(g => g.id === from.groupId);
    const dst = sections.find(x => x.id === to.sectionId)?.groups.find(g => g.id === to.groupId);
    if (!src || !dst) return;
    const i = src.links.findIndex(l => l.id === from.linkId); if (i < 0) return;
    [moved] = src.links.splice(i, 1);
    insertBefore(dst.links, moved, beforeId);
  }
  lastDropped = moved.id;
  save(); renderSections(); renderSectionModal();
}

// ── Feed modal ──
function renderFeedModal() {
  const list = document.getElementById('feedItemList'); list.textContent = '';
  makeDropList(list, 'feed', {});
  if (!feeds.length) setMsg(list, 'empty-state', t.noFeeds);
  feeds.forEach(f => {
    const card = document.createElement('div'); card.className = 'item-card';
    const info = document.createElement('div'); info.className = 'item-card-info';
    const nm = document.createElement('div'); nm.className = 'item-card-name'; nm.textContent = f.name;
    const sb = document.createElement('div'); sb.className = 'item-card-sub'; sb.textContent = f.url;
    info.appendChild(nm); info.appendChild(sb);
    makeEditable(info, () => openEditFeed(f.id));
    const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = f.count + 'i';
    const acts = document.createElement('div'); acts.className = 'item-card-actions';
    acts.appendChild(makeBtn('btn btn-danger btn-sm', '×', () => deleteFeed(f.id)));
    card.appendChild(makeGrip()); card.appendChild(info); card.appendChild(badge); card.appendChild(acts);
    makeDraggable(card, 'feed', { feedId: f.id }, card);
    list.appendChild(card);
  });
  list.appendChild(makeAddSlot('channel', t.slotNewFeed, openAddFeed));
  lastDropped = null;
}
function openAddFeed() {
  renameTarget = null;
  setFormTexts('addFeedForm', t.addFeed, t.add);
  document.getElementById('fName').value = ''; document.getElementById('fUrl').value = ''; document.getElementById('fCount').value = '8';
  document.getElementById('btnTogglePresets').style.display = '';
  showForm('addFeedForm');
  document.getElementById('fName').focus();
}
function openEditFeed(id) {
  const f = feeds.find(x => x.id === id); if (!f) return;
  renameTarget = { feedId: id };
  setFormTexts('addFeedForm', t.editFeed, t.save);
  document.getElementById('fName').value = f.name; document.getElementById('fUrl').value = f.url; document.getElementById('fCount').value = f.count;
  document.getElementById('btnTogglePresets').style.display = 'none';
  showForm('addFeedForm');
  document.getElementById('fName').focus();
}
function addFeed() {
  const name  = document.getElementById('fName').value.trim();
  const url   = document.getElementById('fUrl').value.trim();
  const count = parseInt(document.getElementById('fCount').value)||8;
  if (!name||!url) { alert(t.alertAddFeed); return; }
  const editingId = renameTarget && renameTarget.feedId;
  if (editingId) {
    const f = feeds.find(x => x.id === editingId);
    if (f) { f.name = name; f.url = url; f.count = count; delete feedCache[f.id]; }
  } else feeds.push({id:uid(),name,url,count});
  hideForms();
  saveFeeds(); renderFeedModal(); renderFeedTabs();
}
function deleteFeed(id) { feeds=feeds.filter(f=>f.id!==id); delete feedCache[id]; saveFeeds(); renderFeedModal(); renderFeedTabs(); }
function togglePresets() {
  const panel=document.getElementById('presetPanel');
  const open = panel.style.display!=='none'; panel.style.display=open?'none':'flex';
  if (!open) {
    const grid=document.getElementById('presetGrid'); grid.innerHTML='';
    FEED_PRESETS.forEach(p => {
      const b=document.createElement('button'); b.className='btn btn-ghost btn-sm'; b.textContent=p.name;
      b.addEventListener('click',()=>{ document.getElementById('fName').value=p.name; document.getElementById('fUrl').value=p.url; panel.style.display='none'; });
      grid.appendChild(b);
    });
  }
}

// ════════════════════════════════════════════════
//  WALLPAPER
// ════════════════════════════════════════════════
function applyWallSettings(ws) {
  wallSettings = { ...wallSettings, ...ws };
  const root = document.documentElement;
  root.style.setProperty('--wall-opacity',  (ws.opacity??100)/100);
  root.style.setProperty('--wall-blur',     (ws.blur??0)+'px');
  root.style.setProperty('--wall-dim',      (ws.dim??45)/100);
  root.style.setProperty('--wall-tint',     (ws.tint??0)+'deg');
  root.style.setProperty('--wall-scale',    '1.03');
  root.style.setProperty('--glass-blur',    (ws.glass??18)+'px');
  root.style.setProperty('--glass-blur-sm', Math.max(4,(ws.glass??18)*0.55)+'px');
  const imgEl = document.getElementById('wallImg');
  if (ws.src) {
    document.body.classList.remove('no-wall');
    imgEl.style.backgroundImage = 'url("'+ws.src+'")';
    imgEl.style.backgroundSize='cover'; imgEl.style.backgroundPosition='center';
  } else if (ws.type==='gradient'&&ws.grad) {
    document.body.classList.remove('no-wall');
    imgEl.style.backgroundImage = ws.grad;
    imgEl.style.backgroundSize=''; imgEl.style.backgroundPosition='';
  } else {
    document.body.classList.add('no-wall');
    imgEl.style.backgroundImage='';
  }
  syncSlidersToState(ws);
}
function syncSlidersToState(ws) {
  const set=(id,val,lid,sfx)=>{ const e=document.getElementById(id);if(e)e.value=val; const l=document.getElementById(lid);if(l)l.textContent=val+sfx; };
  set('slOpacity',ws.opacity??100,'lblOpacity','%');
  set('slDim',    ws.dim??45,     'lblDim',    '%');
  set('slBlur',   ws.blur??0,     'lblBlur',   'px');
  set('slTint',   ws.tint??0,     'lblTint',   '°');
  set('slGlass',  ws.glass??18,   'lblGlass',  'px');
  const qb=document.getElementById('quickBlur'); if(qb)qb.value=ws.blur??0;
  const qd=document.getElementById('quickDim');  if(qd)qd.value=ws.dim??45;
}
function onWallSlider(prop,rawVal) {
  const val=parseFloat(rawVal);
  const labels={opacity:'lblOpacity',dim:'lblDim',blur:'lblBlur',tint:'lblTint',glass:'lblGlass'};
  const sfxs  ={opacity:'%',dim:'%',blur:'px',tint:'°',glass:'px'};
  const lb=document.getElementById(labels[prop]); if(lb)lb.textContent=val+sfxs[prop];
  wallSettings[prop]=val; applyWallSettings(wallSettings); saveWall();
  if(prop==='blur'){const q=document.getElementById('quickBlur');if(q)q.value=val;}
  if(prop==='dim') {const q=document.getElementById('quickDim'); if(q)q.value=val;}
}

function applyWallUrl(url, persist=true) {
  const val = url || document.getElementById('wallUrlInput').value.trim(); if (!val) return;
  wallSettings.src=val; wallSettings.type='image'; wallSettings.grad=null;
  applyWallSettings(wallSettings); if(persist)saveWall();
  updateWallPreview(val); renderGradientPresets();
}
function onWallUrlInput(val) { if(/^https?:\/\/.+\..+/.test(val.trim())) applyWallUrl(val.trim(),false); }
function updateWallPreview(src) {
  const img=document.getElementById('wallPreviewImg');
  const txt=document.getElementById('wallPreviewText');
  const inp=document.getElementById('wallUrlInput');
  const wrap=img?img.closest('.wall-preview-wrap'):null;
  if(wrap) wrap.style.backgroundImage=''; // clear any gradient preview
  img.onload=null; img.onerror=null;      // drop stale handlers so clearing src can't fire onerror
  if(src&&src.startsWith('linear-gradient')) {
    // Gradients aren't images: paint them as the preview box background.
    img.classList.remove('loaded'); img.removeAttribute('src');
    if(wrap) wrap.style.backgroundImage=src;
    if(txt)txt.textContent=t.wallPreview;
  } else if(src) {
    img.onload=()=>img.classList.add('loaded');
    img.onerror=()=>{ img.classList.remove('loaded'); if(txt)txt.textContent=t.errorImageLoad; };
    img.src=src; if(inp&&inp.value!==src)inp.value=src;
    if(txt)txt.textContent=t.wallPreview;
  } else {
    img.classList.remove('loaded'); img.removeAttribute('src');
    if(inp)inp.value=''; if(txt)txt.textContent=t.wallEnterUrl;
  }
}
function removeWallpaper() { const src=wallSettings.source; wallSettings={...DEFAULT_WALL, source:src}; applyWallSettings(wallSettings); saveWall(); updateWallPreview(null); renderGradientPresets(); }
function resetWallSettings() { const {src,type,grad}=wallSettings; wallSettings={...DEFAULT_WALL,src,type,grad}; applyWallSettings(wallSettings); saveWall(); }
function renderGradientPresets() {
  const wrap=document.getElementById('wallPresets'); if(!wrap)return; wrap.innerHTML='';
  const none=document.createElement('div'); none.className='wall-preset wall-preset-none'+(wallSettings.type==='none'?' active':''); none.textContent=t.noBackground;
  none.addEventListener('click',removeWallpaper); wrap.appendChild(none);
  GRADIENT_PRESETS.forEach(p => {
    const d=document.createElement('div'); d.className='wall-preset'+(wallSettings.grad===p.grad?' active':''); d.style.background=p.grad; d.title=p.label;
    d.addEventListener('click',()=>{ wallSettings.src=null; wallSettings.type='gradient'; wallSettings.grad=p.grad; wallSettings.source='gradient'; applyWallSettings(wallSettings); saveWall(); updateWallPreview(p.grad); renderGradientPresets(); });
    wrap.appendChild(d);
  });
}

// ── Background source selector (URL · Bing · Wallhaven) ──
function setWallSource(source) {
  wallSettings.source = ['bing', 'wallhaven', 'gradient'].includes(source) ? source : 'url';
  saveWall(); renderWallSource();
}
function renderWallSource() {
  const src = wallSettings.source || 'url';
  document.querySelectorAll('#wallTypeSel .widget-seg-btn').forEach(b => b.classList.toggle('active', b.dataset.src === src));
  ['url', 'bing', 'wallhaven', 'gradient'].forEach(s => {
    const p = document.getElementById('wallPanel' + s.charAt(0).toUpperCase() + s.slice(1));
    if (p) p.classList.toggle('active', s === src);
  });
  if (src === 'wallhaven' && !document.querySelector('#whGrid .wh-thumb')) wallhavenSearch(whQuery, 1);
}

// Bing daily wallpaper via bing.biturl.top (returns the day's image URL).
function bingMkt() { return { es:'es-ES', ru:'ru-RU', fr:'fr-FR', de:'de-DE' }[currentLang] || 'en-US'; }
async function fetchBingWallpaper(fromButton) {
  const note = document.getElementById('bingCopyright');
  if (fromButton && note) { note.textContent = t.loading; }
  try {
    const res = await fetch('https://bing.biturl.top/?resolution=1920&format=json&index=0&mkt=' + bingMkt(), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    if (!data || !data.url) throw new Error('no url');
    wallSettings.src = data.url; wallSettings.type = 'bing'; wallSettings.grad = null; wallSettings.source = 'bing';
    applyWallSettings(wallSettings); saveWall(); updateWallPreview(data.url); renderGradientPresets();
    if (note) note.textContent = data.copyright || '';
  } catch (e) {
    if (fromButton && note) note.textContent = t.errorImageLoad;
  }
}

// Wallhaven browser (SFW, no API key).
let whQuery = '', whPage = 1, whLastPage = 1;
async function wallhavenSearch(query, page) {
  whQuery = query || ''; whPage = page || 1;
  const grid = document.getElementById('whGrid'); if (!grid) return;
  setMsg(grid, 'feed-empty', t.loading);
  try {
    const params = new URLSearchParams({ purity: '100', categories: '111', page: String(whPage),
      sorting: whQuery ? 'relevance' : 'toplist', q: whQuery });
    const res = await fetch('https://wallhaven.cc/api/v1/search?' + params.toString(), { signal: AbortSignal.timeout(9000) });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    whLastPage = (data.meta && data.meta.last_page) || 1;
    renderWallhavenGrid(data.data || []);
  } catch (e) {
    setMsg(grid, 'feed-empty', t.errorImageLoad);
  }
}
function renderWallhavenGrid(items) {
  const grid = document.getElementById('whGrid'); if (!grid) return;
  grid.textContent = '';
  if (!items.length) { setMsg(grid, 'feed-empty', '—'); }
  items.forEach(it => {
    const thumb = it.thumbs && (it.thumbs.small || it.thumbs.original); const full = it.path;
    if (!thumb || !full) return;
    const cell = document.createElement('div'); cell.className = 'wh-thumb' + (wallSettings.src === full ? ' active' : '');
    cell.dataset.full = full;
    const img = document.createElement('img'); img.loading = 'lazy'; img.src = thumb; img.alt = '';
    cell.title = it.resolution || '';
    cell.appendChild(img);
    cell.addEventListener('click', () => applyWallhaven(full));
    grid.appendChild(cell);
  });
  const info = document.getElementById('whPageInfo'); if (info) info.textContent = whPage + ' / ' + whLastPage;
  const prev = document.getElementById('whPrev'), next = document.getElementById('whNext');
  if (prev) prev.disabled = whPage <= 1;
  if (next) next.disabled = whPage >= whLastPage;
}
function applyWallhaven(url) {
  wallSettings.src = url; wallSettings.type = 'image'; wallSettings.grad = null; wallSettings.source = 'wallhaven';
  applyWallSettings(wallSettings); saveWall(); updateWallPreview(url); renderGradientPresets();
  document.querySelectorAll('#whGrid .wh-thumb').forEach(c => c.classList.toggle('active', c.dataset.full === url));
}


// ════════════════════════════════════════════════
//  MARKETS — CoinGecko free API
// ════════════════════════════════════════════════
async function loadMarkets() {
  const el = document.getElementById('marketsList');
  if (!markets.length) { setMsg(el, 'feed-empty', t.noMarketsAdded); return; }
  setMsg(el, 'feed-empty', t.loadingDots);
  try {
    const ids = markets.map(m => m.id).join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=eur&include_24hr_change=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('rate-limit');
    const data = await res.json();
    renderMarkets(data);
  } catch(e) {
    setMsg(el, 'feed-empty', t.errorMarkets);
  }
}

function renderMarkets(data) {
  const el = document.getElementById('marketsList'); el.innerHTML = '';
  markets.forEach(m => {
    const info = data[m.id];
    const row = document.createElement('div'); row.className = 'stock-row';
    const left = document.createElement('div');
    const ticker = document.createElement('div'); ticker.className = 's-ticker'; ticker.textContent = m.symbol.toUpperCase();
    const name   = document.createElement('div'); name.className   = 's-name';   name.textContent   = m.name;
    left.appendChild(ticker); left.appendChild(name);
    const right = document.createElement('div');
    const val = document.createElement('div'); val.className = 's-val';
    const chg = document.createElement('div'); chg.className = 's-chg';
    if (info) {
      const price = info.eur;
      val.textContent = price >= 1000
        ? '€' + price.toLocaleString(getLocale(), {maximumFractionDigits:0})
        : price >= 1
        ? '€' + price.toLocaleString(getLocale(), {minimumFractionDigits:2, maximumFractionDigits:4})
        : '€' + price.toLocaleString(getLocale(), {minimumFractionDigits:4, maximumFractionDigits:6});
      const pct = info.eur_24h_change;
      chg.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
      chg.classList.add(pct >= 0 ? 'up' : 'dn');
    } else {
      val.textContent = '—'; chg.textContent = '—'; chg.style.color = 'var(--text-muted)';
    }
    right.appendChild(val); right.appendChild(chg);
    row.appendChild(left); row.appendChild(right);
    el.appendChild(row);
  });
}

// Markets modal
function renderMarketModal() {
  const list = document.getElementById('marketItemList'); list.textContent = '';
  makeDropList(list, 'market', {});
  if (!markets.length) setMsg(list, 'empty-state', t.noAssets);
  markets.forEach(m => {
    const card = document.createElement('div'); card.className = 'item-card';
    const info = document.createElement('div'); info.className = 'item-card-info';
    const nm = document.createElement('div'); nm.className = 'item-card-name'; nm.textContent = m.symbol.toUpperCase() + ' · ' + m.name;
    const sb = document.createElement('div'); sb.className = 'item-card-sub';   sb.textContent = m.id;
    info.appendChild(nm); info.appendChild(sb);
    makeEditable(info, () => openEditMarket(m.id));
    const acts = document.createElement('div'); acts.className = 'item-card-actions';
    acts.appendChild(makeBtn('btn btn-danger btn-sm', '×', () => deleteMarket(m.id)));
    card.appendChild(makeGrip()); card.appendChild(info); card.appendChild(acts);
    makeDraggable(card, 'market', { marketId: m.id }, card);
    list.appendChild(card);
  });
  list.appendChild(makeAddSlot('channel', t.slotNewAsset, openAddMarket));
  lastDropped = null;
}

function openAddMarket() {
  renameTarget = null;
  setFormTexts('addMarketForm', t.addAsset, t.add);
  document.getElementById('mCoinId').value = ''; document.getElementById('mSymbol').value = ''; document.getElementById('mName').value = '';
  document.getElementById('btnMarketPresets').style.display = '';
  showForm('addMarketForm');
  document.getElementById('mCoinId').focus();
}
function openEditMarket(id) {
  const m = markets.find(x => x.id === id); if (!m) return;
  renameTarget = { marketId: id };
  setFormTexts('addMarketForm', t.editAsset, t.save);
  document.getElementById('mCoinId').value = m.id; document.getElementById('mSymbol').value = m.symbol; document.getElementById('mName').value = m.name;
  document.getElementById('btnMarketPresets').style.display = 'none';
  showForm('addMarketForm');
  document.getElementById('mSymbol').focus();
}

function addMarket() {
  const id     = document.getElementById('mCoinId').value.trim().toLowerCase();
  const symbol = document.getElementById('mSymbol').value.trim();
  const name   = document.getElementById('mName').value.trim();
  if (!id || !symbol) { alert(t.alertFillFields); return; }
  const editingId = renameTarget && renameTarget.marketId;
  if (markets.find(m => m.id === id && m.id !== editingId)) { alert(t.alertAssetExists); return; }
  if (editingId) {
    const m = markets.find(x => x.id === editingId);
    if (m) { m.id = id; m.symbol = symbol; m.name = name || symbol.toUpperCase(); }
  } else markets.push({ id, symbol, name: name || symbol.toUpperCase() });
  hideForms();
  saveMarkets(); renderMarketModal(); loadMarkets();
}

function deleteMarket(id) {
  markets = markets.filter(m => m.id !== id);
  saveMarkets(); renderMarketModal(); loadMarkets();
}

function toggleMarketPresets() {
  const panel = document.getElementById('marketPresetPanel');
  const open  = panel.style.display !== 'none'; panel.style.display = open ? 'none' : 'flex';
  if (!open) {
    const grid = document.getElementById('marketPresetGrid'); grid.innerHTML = '';
    MARKET_PRESETS.forEach(p => {
      if (markets.find(m => m.id === p.id)) return; // already added
      const b = document.createElement('button'); b.className = 'btn btn-ghost btn-sm';
      b.textContent = p.symbol + ' ' + p.name;
      b.addEventListener('click', () => {
        markets.push({ ...p });
        saveMarkets(); renderMarketModal(); loadMarkets();
        hideForms();
      });
      grid.appendChild(b);
    });
  }
}


// ════════════════════════════════════════════════
//  CALENDAR — lunes como primer día
// ════════════════════════════════════════════════
const DOW_ES    = ['Lu','Ma','Mi','Ju','Vi','Sá','Do'];

let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-indexed

function renderCalendar() {
  const grid  = document.getElementById('calGrid');
  const label = document.getElementById('calMonthLabel');
  if (!grid || !label) return;

  label.textContent = t.months[calMonth] + ' ' + calYear;

  const today = new Date();
  const todayY = today.getFullYear(), todayM = today.getMonth(), todayD = today.getDate();

  // First day of displayed month
  const first = new Date(calYear, calMonth, 1);
  // getDay(): 0=Sun,1=Mon…6=Sat → convert to Mon-based: Mon=0…Sun=6
  // For EN: Sunday=0, Mon=1…; for ES: Monday=0, Tue=1…
  const mondayFirst = currentLang !== 'en';
  let startDow = mondayFirst ? (first.getDay() + 6) % 7 : first.getDay();

  // Days in this month and previous
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrev  = new Date(calYear, calMonth,     0).getDate();

  // Build DOW header
  const dowRow = document.createElement('div'); dowRow.className = 'cal-dow-row';
  // Week starts on Monday (ES) or Sunday (EN)
  const dowOrder = currentLang === 'en'
    ? [...t.dow.slice(6), ...t.dow.slice(0,6)]   // Sun first
    : t.dow;                                       // Mon first
  dowOrder.forEach(d => {
    const cell = document.createElement('div'); cell.className = 'cal-dow'; cell.textContent = d;
    dowRow.appendChild(cell);
  });

  // Build days grid
  const daysGrid = document.createElement('div'); daysGrid.className = 'cal-days-grid';

  // Prev month tail
  for (let i = startDow - 1; i >= 0; i--) {
    const cell = mkCalDay(daysInPrev - i, true, false, false);
    daysGrid.appendChild(cell);
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday   = (calYear===todayY && calMonth===todayM && d===todayD);
    const dayOfWeek = new Date(calYear, calMonth, d).getDay();
    const isWeekend = mondayFirst
      ? ((dayOfWeek + 6) % 7) >= 5   // Mon-based: Sa=5,Su=6
      : dayOfWeek === 0 || dayOfWeek === 6; // Sun-based: Su=0,Sa=6
    daysGrid.appendChild(mkCalDay(d, false, isToday, isWeekend));
  }

  // Next month head to fill 6 rows × 7 = 42 cells max
  const filled = startDow + daysInMonth;
  const remaining = filled % 7 === 0 ? 0 : 7 - (filled % 7);
  for (let d = 1; d <= remaining; d++) {
    daysGrid.appendChild(mkCalDay(d, true, false, false));
  }

  grid.innerHTML = '';
  grid.appendChild(dowRow);
  grid.appendChild(daysGrid);
}

function mkCalDay(num, otherMonth, isToday, isWeekend) {
  const cell = document.createElement('div');
  cell.className = 'cal-day'
    + (otherMonth ? ' other-month' : '')
    + (isToday    ? ' today'       : '')
    + (isWeekend && !otherMonth ? ' weekend' : '');
  cell.textContent = num;
  return cell;
}


// ════════════════════════════════════════════════
//  YOUTUBE VIDEOS via RSS (no API key needed)
// ════════════════════════════════════════════════
const YT_RSS = 'https://www.youtube.com/feeds/videos.xml?channel_id=';
const handleCache = {}; // @handle → channelId

async function resolveYouTubeHandle(handle) {
  const key = handle.toLowerCase();
  if (handleCache[key]) return handleCache[key];
  try {
    // Fetch the channel page — it contains the channelId in a meta tag
    const url = 'https://www.youtube.com/' + handle;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error('http ' + res.status);
    const html = await res.text();
    // Look for channelId in various places YouTube embeds it
    const patterns = [
      /"channelId":"(UC[a-zA-Z0-9_-]{22})"/,
      /\"channelId\":\"(UC[a-zA-Z0-9_-]{22})\"/,
      /<meta itemprop="identifier" content="(UC[a-zA-Z0-9_-]{22})"/,
      /channel\/(UC[a-zA-Z0-9_-]{22})/,
    ];
    for (const pattern of patterns) {
      const m = html.match(pattern);
      if (m && m[1]) {
        handleCache[key] = m[1];
        console.log('Resolved', handle, '→', m[1]);
        return m[1];
      }
    }
    throw new Error('Channel ID not found in page');
  } catch(e) {
    console.warn('Could not resolve YouTube handle', handle, ':', e.message);
    return null;
  }
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 3600)   return Math.floor(diff/60)  + 'm';
  if (diff < 86400)  return Math.floor(diff/3600) + 'h';
  if (diff < 604800) return Math.floor(diff/86400)+ 'd';
  return Math.floor(diff/604800) + t.weekShort;
}

function parseYouTubeXml(xml, ch) {
  const entries = Array.from(xml.getElementsByTagName('entry'));
  const items = entries.slice(0, ch.count || 5).map(entry => {
    const videoIdEl = entry.getElementsByTagNameNS('http://www.youtube.com/xml/schemas/2015', 'videoId')[0]
      || entry.getElementsByTagName('yt:videoId')[0];
    const videoId = videoIdEl?.textContent || '';
    const linkEl  = entry.getElementsByTagName('link')[0];
    const link    = linkEl?.getAttribute('href') || (videoId ? 'https://www.youtube.com/watch?v=' + videoId : '');
    const title   = entry.getElementsByTagName('title')[0]?.textContent || '';
    const published = entry.getElementsByTagName('published')[0]?.textContent || '';
    const thumbEl = entry.getElementsByTagName('media:thumbnail')[0]
      || entry.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'thumbnail')[0];
    const thumb   = thumbEl?.getAttribute('url')
      || (videoId ? 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg' : '');
    return { title, link, thumb, pubDate: published ? new Date(published) : new Date(0), channel: ch.name };
  }).filter(v => v.title && v.link);
  videoCache[ch.id] = items;
  return items;
}

// Extract videos from YouTube channel page HTML (ytInitialData JSON)
function parseYouTubePageVideos(html, ch) {
  try {
    // YouTube embeds all video data as ytInitialData JSON in the page
    const match = html.match(/var ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s)
      || html.match(/ytInitialData\s*=\s*(\{.+?\});\s*(?:var|window|<\/script>)/s);
    if (!match) return [];
    const data = JSON.parse(match[1]);

    // Navigate the deeply nested structure to find video renderers
    const videos = [];
    function findVideos(obj) {
      if (!obj || typeof obj !== 'object' || videos.length >= (ch.count || 5)) return;
      if (obj.videoRenderer || obj.gridVideoRenderer) {
        const r = obj.videoRenderer || obj.gridVideoRenderer;
        const videoId = r.videoId;
        if (!videoId) return;
        const title = r.title?.runs?.[0]?.text || r.title?.simpleText || '';
        const thumb = 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg';
        const link  = 'https://www.youtube.com/watch?v=' + videoId;
        // Published text like "hace 2 días" — use now as approx date
        const pubText = r.publishedTimeText?.simpleText || '';
        const pubDate = estimatePubDate(pubText);
        if (title) videos.push({ title, link, thumb, pubDate, channel: ch.name });
        return;
      }
      if (Array.isArray(obj)) { obj.forEach(findVideos); return; }
      Object.values(obj).forEach(findVideos);
    }
    findVideos(data);
    videoCache[ch.id] = videos;
    return videos;
  } catch(e) {
    console.warn('ytInitialData parse error:', e.message);
    return [];
  }
}

function estimatePubDate(text) {
  if (!text) return new Date(0);
  const now = Date.now();
  const t = text.toLowerCase();
  const n = parseInt(t) || 1;
  if (t.includes('seg') || t.includes('second')) return new Date(now - n * 1000);
  if (t.includes('min'))                          return new Date(now - n * 60000);
  if (t.includes('hora') || t.includes('hour'))  return new Date(now - n * 3600000);
  if (t.includes('día') || t.includes('day'))    return new Date(now - n * 86400000);
  if (t.includes('sem') || t.includes('week'))   return new Date(now - n * 604800000);
  if (t.includes('mes') || t.includes('month'))  return new Date(now - n * 2592000000);
  if (t.includes('año') || t.includes('year'))   return new Date(now - n * 31536000000);
  return new Date(0);
}

async function loadVideos(force=false) {
  const section = document.getElementById('videosSection');
  const el      = document.getElementById('videosEl');
  if (!channels.length) { if(section) section.style.display='none'; return; }
  if (section) section.style.display = 'flex';
  { const lv = document.createElement('div'); lv.className='feed-empty'; lv.style.padding='16px 0'; lv.textContent=t.loadingVideos; el.textContent=''; el.appendChild(lv); }

  // Fetch all channels in parallel — parse YouTube XML feed directly
  const fetches = channels.map(async ch => {
    if (!force && videoCache[ch.id]) return videoCache[ch.id];
    try {
      // Resolve @handle to channel ID if needed
      let channelId = ch.id;
      if (channelId.startsWith('@')) {
        channelId = await resolveYouTubeHandle(channelId);
        if (!channelId) throw new Error('Could not resolve handle ' + ch.id);
        // Cache resolved ID back
        const idx = channels.findIndex(c => c.id === ch.id);
        if (idx >= 0) { channels[idx].id = channelId; saveChannels(); }
      }

      // Fetch YouTube XML feed directly — extension has <all_urls> permission, no proxy needed
      const feedUrl = YT_RSS + channelId;

      // Strategy 1: Direct RSS feed
      const res = await fetch(feedUrl, {
        signal: AbortSignal.timeout(10000),
        headers: { 'Accept': 'application/atom+xml, application/xml, text/xml, */*' }
      });

      if (res.ok) {
        const text = await res.text();

        // Parse XML — YouTube Atom feed uses yt: namespace
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'application/xml');
        if (xml.querySelector('parsererror')) throw new Error('xml parse error');
        return parseYouTubeXml(xml, ch);
      }

      // Strategy 2: Fetch channel page and scrape ytInitialData
      console.log('RSS feed 404 for', channelId, '— trying channel page scrape');
      const pageUrl = 'https://www.youtube.com/channel/' + channelId + '/videos';
      const pageRes = await fetch(pageUrl, {
        signal: AbortSignal.timeout(12000),
        headers: {
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
        }
      });
      if (!pageRes.ok) throw new Error('page http ' + pageRes.status);
      const pageHtml = await pageRes.text();

      // Try extracting from ytInitialData
      const scraped = parseYouTubePageVideos(pageHtml, ch);
      if (scraped.length > 0) return scraped;

      // Strategy 3: extract RSS URL embedded in page <link> tag
      const rssMatch = pageHtml.match(/feeds\/videos\.xml\?channel_id=[^"&]+/);
      if (rssMatch) {
        const rssRes = await fetch('https://www.youtube.com/' + rssMatch[0], { signal: AbortSignal.timeout(10000) });
        if (rssRes.ok) {
          const rssText = await rssRes.text();
          const rssXml = new DOMParser().parseFromString(rssText, 'application/xml');
          if (!rssXml.querySelector('parsererror')) return parseYouTubeXml(rssXml, ch);
        }
      }

      throw new Error('all strategies failed for ' + channelId);
    } catch(e) {
      console.warn('Video feed error for channel', ch.id, ':', e.message);
      // If 404, the channel ID is likely wrong
      if (e.message.includes('404')) {
        console.warn('→ Channel ID "' + ch.id + '" returned 404. Please verify it is correct.');
      }
      return [];
    }
  });

  const results = await Promise.all(fetches);

  // Merge, sort by date desc
  const all = results
    .flat()
    .sort((a, b) => b.pubDate - a.pubDate)
    .map(v => ({ ...v, age: timeAgo(v.pubDate) }));

  renderAllVideos(all, el);
}

function extractThumb(item) {
  if (item.enclosure && item.enclosure.link) return item.enclosure.link;
  const m = (item.link||'').match(/v=([^&]+)/);
  if (m) return 'https://i.ytimg.com/vi/'+m[1]+'/mqdefault.jpg';
  return '';
}

function renderAllVideos(items, container) {
  container.innerHTML = '';
  if (!items.length) {
    { const nv = document.createElement('div'); nv.className='feed-empty'; nv.style.padding='16px 0'; nv.textContent=t.noVideos; container.textContent=''; container.appendChild(nv); }
    return;
  }

  const row = document.createElement('div'); row.className = 'video-cards-row';

  items.forEach(v => {
    const card = document.createElement('a'); card.className='video-card'; card.href=v.link; card.target='_blank';

    // Thumbnail
    const wrap = document.createElement('div'); wrap.className='video-thumb-wrap';
    if (v.thumb) {
      const img = document.createElement('img'); img.className='video-thumb'; img.src=v.thumb; img.alt='';
      img.onerror = () => { img.style.display='none'; };
      wrap.appendChild(img);
    }
    // Play overlay
    const ov = document.createElement('div'); ov.className='video-play-overlay';
    const pi = document.createElement('div'); pi.className='video-play-icon';
    pi.appendChild(mkSvgIcon('M8 5v14l11-7z'));
    ov.appendChild(pi); wrap.appendChild(ov);
    // Age + channel badge
    const ag = document.createElement('div'); ag.className='video-age';
    ag.textContent = v.age + (v.channel ? ' · ' + v.channel : '');
    wrap.appendChild(ag);

    // Title
    const title = document.createElement('div'); title.className='video-title'; title.textContent=v.title;

    card.appendChild(wrap); card.appendChild(title);
    row.appendChild(card);
  });

  container.appendChild(row);
}

// Videos modal
function renderVideoChannelModal() {
  const list = document.getElementById('videoChannelList'); list.textContent = '';
  makeDropList(list, 'channel', {});
  if (!channels.length) setMsg(list, 'empty-state', t.noChannels);
  channels.forEach(ch => {
    const card = document.createElement('div'); card.className = 'item-card';
    const info = document.createElement('div'); info.className = 'item-card-info';
    const nm = document.createElement('div'); nm.className = 'item-card-name'; nm.textContent = ch.name;
    const sb = document.createElement('div'); sb.className = 'item-card-sub'; sb.textContent = 'ID: ' + ch.id + ' · ' + ch.count + ' ' + t.videosWord;
    info.appendChild(nm); info.appendChild(sb);
    makeEditable(info, () => openEditChannel(ch.id));
    const acts = document.createElement('div'); acts.className = 'item-card-actions';
    acts.appendChild(makeBtn('btn btn-danger btn-sm', '×', () => deleteChannel(ch.id)));
    card.appendChild(makeGrip()); card.appendChild(info); card.appendChild(acts);
    makeDraggable(card, 'channel', { channelId: ch.id }, card);
    list.appendChild(card);
  });
  list.appendChild(makeAddSlot('channel', t.slotNewChannel, openAddChannel));
  lastDropped = null;
}

function openAddChannel() {
  renameTarget = null;
  setFormTexts('addChannelForm', t.addChannel, t.addChannel);
  document.getElementById('vChannelId').value = '';
  document.getElementById('vChannelName').value = '';
  document.getElementById('vCount').value = '5';
  showForm('addChannelForm');
  document.getElementById('vChannelId').focus();
}
function openEditChannel(id) {
  const ch = channels.find(c => c.id === id); if (!ch) return;
  renameTarget = { channelId: id };
  setFormTexts('addChannelForm', t.editChannel, t.save);
  document.getElementById('vChannelId').value = ch.id;
  document.getElementById('vChannelName').value = ch.name;
  document.getElementById('vCount').value = ch.count;
  showForm('addChannelForm');
  document.getElementById('vChannelName').focus();
}

function addChannel() {
  const id    = document.getElementById('vChannelId').value.trim();
  const name  = document.getElementById('vChannelName').value.trim() || t.channelDefaultName;
  const count = parseInt(document.getElementById('vCount').value) || 5;
  if (!id) { alert(t.alertFillChannel); return; }
  const editingId = renameTarget && renameTarget.channelId;
  if (channels.find(c => c.id===id && c.id!==editingId)) { alert(t.alertChannelExists); return; }
  if (editingId) {
    const ch = channels.find(c => c.id===editingId);
    if (ch) { delete videoCache[ch.id]; ch.id = id; ch.name = name; ch.count = count; }
  } else channels.push({ id, name, count });
  hideForms();
  saveChannels(); renderVideoChannelModal();
  videoCache = {}; loadVideos();
}

function deleteChannel(id) {
  channels = channels.filter(c => c.id!==id); delete videoCache[id];
  saveChannels(); renderVideoChannelModal(); loadVideos();
}



// ════════════════════════════════════════════════
//  EXPORT / IMPORT
// ════════════════════════════════════════════════
function exportConfig() {
  const config = {
    version:  2,
    engine:   activeEngine.id,
    lang:     currentLang,
    theme:    currentTheme,
    fontsize: currentFontSize,
    uptime:   uptimeConfig,
    exported: new Date().toISOString(),
    sections,
    feeds,
    markets,
    channels,
    widgets,
    // Homelab widget configs WITHOUT their secrets — never write tokens to a file
    proxmox:  { url: proxmoxConfig.url, tokenId: proxmoxConfig.tokenId, tokenSecret: '', name: proxmoxConfig.name, selected: proxmoxConfig.selected },
    docker:   { url: dockerConfig.url,  apiKey: '', endpointId: dockerConfig.endpointId, name: dockerConfig.name },
    pihole:   { url: piholeConfig.url,  password: '' },
    wall:     { ...wallSettings, src: null }, // skip image URL if any — user can re-add
  };
  // Include wall src only if it's a URL (not base64)
  if (wallSettings.src && wallSettings.src.startsWith('http')) {
    config.wall.src = wallSettings.src;
  }
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = t.exportFilename + '-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importConfig(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const config = JSON.parse(e.target.result);
      // Validate minimally
      if (!config.sections && !config.feeds && !config.markets) {
        alert(t.alertInvalidFile);
        return;
      }
      const locale = getLocale();
      const exportDate = config.exported ? new Date(config.exported).toLocaleDateString(locale) : '?';
      const ok = confirm(
        t.importConfirmTitle + ' ' + exportDate + '?\n\n' +
        '• ' + (config.sections?.length || 0) + ' ' + t.importConfirmSections + '\n' +
        '• ' + (config.feeds?.length    || 0) + ' ' + t.importConfirmFeeds    + '\n' +
        '• ' + (config.markets?.length  || 0) + ' ' + t.importConfirmMarkets  + '\n' +
        '• ' + (config.channels?.length || 0) + ' ' + t.importConfirmChannels + '\n\n' +
        t.importConfirmWarning
      );
      if (!ok) return;

      if (config.sections) { sections = config.sections; await Store.set('gd_sections', sections); }
      if (config.feeds)    { feeds    = config.feeds;    await Store.set('gd_feeds',    feeds); }
      if (config.markets)  { markets  = config.markets;  await Store.set('gd_markets',  markets); }
      if (config.channels) { channels = config.channels; await Store.set('gd_channels', channels); }
      if (config.engine)   { applyEngine(config.engine); }
      if (config.lang)     { applyLang(config.lang); }
      if (config.theme)    { applyTheme(config.theme); }
      if (config.fontsize) { applyFontSize(config.fontsize); }
      if (config.uptime)   { uptimeConfig = config.uptime; await Store.set('gd_uptime', uptimeConfig); loadUptime(true); }
      // Homelab configs: backups carry no secrets, so keep any existing local secret
      // rather than blanking it. mergeSvc applies imported fields but preserves
      // non-empty local values for the listed secret keys when the import is empty.
      const mergeSvc = (cur, inc, secrets) => {
        const out = { ...cur, ...inc };
        secrets.forEach(k => { if (!inc[k] && cur[k]) out[k] = cur[k]; });
        return out;
      };
      if (config.proxmox)  { proxmoxConfig = mergeSvc(proxmoxConfig, config.proxmox, ['tokenSecret']); await Store.set('gd_proxmox', proxmoxConfig); loadProxmox(); }
      if (config.docker)   { dockerConfig  = mergeSvc(dockerConfig,  config.docker,  ['apiKey']);      await Store.set('gd_docker',  dockerConfig);  loadDocker(); }
      if (config.pihole)   { piholeConfig  = mergeSvc(piholeConfig,  config.pihole,  ['password']);    piholeSid = null; await Store.set('gd_pihole', piholeConfig); loadPihole(); }
      if (config.wall)     { wallSettings = { ...DEFAULT_WALL, ...config.wall }; await Store.set('gd_wall', wallSettings); applyWallSettings(wallSettings); }
      if (config.widgets)  { widgets = normalizeWidgets(config.widgets); await Store.set('gd_widgets', widgets); }
      // Older backups (pre-widget-manager) carry no widget state: if Uptime is
      // configured, activate its widget so it isn't silently hidden after import.
      else if (uptimeConfig && uptimeConfig.url) {
        const uw = widgets.find(w => w.id === 'uptime');
        if (uw && !uw.active) { uw.active = true; await Store.set('gd_widgets', widgets); }
      }

      // Re-render everything
      renderSections();
      renderFeedTabs();
      renderCalendar();
      videoCache = {}; loadVideos();
      loadMarkets();
      renderWidgetLayout();
      renderModalNav();

      // Refresh modal tab if open
      const activeTab = document.querySelector('.modal-tab.active');
      if (activeTab) switchTab(activeTab.dataset.tab);

      showSyncBadge('synced');
      alert(t.alertImportOk);
    } catch {
      alert(t.alertImportError);
    }
  };
  reader.readAsText(file);
}


// ════════════════════════════════════════════════
//  SEARCH ENGINE MODAL
// ════════════════════════════════════════════════
function renderEngineModal() {
  const list = document.getElementById('engineList'); if (!list) return;
  list.innerHTML = '';
  SEARCH_ENGINES.forEach(eng => {
    const row = document.createElement('div'); row.className = 'engine-row' + (eng.id === activeEngine.id ? ' active' : '');
    const icon = document.createElement('div'); icon.className = 'engine-icon'; icon.textContent = eng.icon;
    const name = document.createElement('div'); name.className = 'engine-name'; name.textContent = eng.name;
    const url  = document.createElement('div'); url.className  = 'engine-url';  url.textContent  = eng.url.replace('https://','').split('/')[0];
    const check= document.createElement('div'); check.className= 'engine-check'; check.textContent= eng.id === activeEngine.id ? '✓' : '';
    const info = document.createElement('div'); info.style.cssText='flex:1;min-width:0;';
    info.appendChild(name); info.appendChild(url);
    row.appendChild(icon); row.appendChild(info); row.appendChild(check);
    row.addEventListener('click', () => { applyEngine(eng.id); renderEngineModal(); });
    list.appendChild(row);
  });
}



// ════════════════════════════════════════════════
//  FONT SIZE
// ════════════════════════════════════════════════
const FONT_SIZES = ['sm','md','lg','xl'];
let currentFontSize = 'md';

function applyFontSize(size, save=true) {
  if (!FONT_SIZES.includes(size)) size = 'md';
  currentFontSize = size;
  FONT_SIZES.forEach(s => document.body.classList.remove('font-' + s));
  document.body.classList.add('font-' + size);
  if (save) Store.set('gd_fontsize', size);
  // Update button states (works whenever modal is open)
  document.querySelectorAll('.font-size-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.size === size);
  });
}

// ════════════════════════════════════════════════
//  THEMES
// ════════════════════════════════════════════════
const THEMES = [
  { id:'obsidian',  name:'Obsidian',      desc_es:'Oscuro neutro · acento dorado',  desc_en:'Dark neutral · golden accent',   desc_fr:'Gris foncé neutre · accent doré', desc_de:'Neutrales Dunkelgrau · goldener Akzent', accent:'#c8b89a', bg:'#0a0a0c' },
  { id:'midnight',  name:'Midnight Blue', desc_es:'Azul profundo · acento celeste',  desc_en:'Deep blue · sky accent',         desc_fr:'Bleu profond · accent ciel', desc_de:'Tiefblau · himmelblauer Akzent', accent:'#7eb8e8', bg:'#050c16' },
  { id:'forest',    name:'Forest',        desc_es:'Verde oscuro · acento esmeralda', desc_en:'Dark green · emerald accent',    desc_fr:'Vert foncé · accent émeraude', desc_de:'Dunkelgrün · smaragdgrüner Akzent', accent:'#6dbf8a', bg:'#08100c' },
  { id:'aurora',    name:'Aurora',        desc_es:'Violeta oscuro · acento lavanda', desc_en:'Dark violet · lavender accent',  desc_fr:'Violet foncé · accent lavande', desc_de:'Dunkelviolett · lavendelfarbener Akzent', accent:'#c48de0', bg:'#100812' },
  { id:'ember',     name:'Ember',         desc_es:'Marrón cálido · acento ámbar',   desc_en:'Warm brown · amber accent',      desc_fr:'Brun chaud · accent ambre', desc_de:'Warmes Braun · bernsteinfarbener Akzent', accent:'#e89a6a', bg:'#120a06' },
  { id:'arctic',    name:'Arctic',        desc_es:'Azul glacial · acento cian',      desc_en:'Glacial blue · cyan accent',     desc_fr:'Bleu glacial · accent cyan', desc_de:'Gletscherblau · cyanfarbener Akzent', accent:'#6ab8c8', bg:'#060e12' },
];

let currentTheme = 'obsidian';

function applyTheme(themeId, save=true) {
  currentTheme = themeId;
  THEMES.forEach(th => document.body.classList.remove('theme-' + th.id));
  document.body.classList.add('theme-' + themeId);
  if (save) Store.set('gd_theme', themeId);
  if (typeof renderThemeModal === 'function') renderThemeModal();
}

function renderThemeModal() {
  const list = document.getElementById('themeList'); if (!list) return;
  list.innerHTML = '';
  THEMES.forEach(th => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 13px;border-radius:10px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.03);cursor:pointer;transition:all 0.13s;';
    if (th.id === currentTheme) row.style.borderColor = th.accent + '66';

    // Color dot
    const dot = document.createElement('div');
    dot.style.cssText = 'width:32px;height:32px;border-radius:50%;flex-shrink:0;border:2px solid ' + th.accent + '44;';
    dot.style.background = 'radial-gradient(circle at 35% 35%, ' + th.accent + '44 0%, ' + th.bg + ' 100%)';
    dot.style.boxShadow = '0 0 8px ' + th.accent + '33';

    // Info
    const info = document.createElement('div'); info.style.flex = '1';
    const nm = document.createElement('div'); nm.style.cssText = 'font-size:13px;color:var(--text-primary);';
    nm.textContent = th.name;
    const ds = document.createElement('div'); ds.style.cssText = 'font-size:10.5px;color:var(--text-muted);margin-top:2px;';
    ds.textContent = th['desc_' + currentLang] || th.desc_en;
    info.appendChild(nm); info.appendChild(ds);

    // Check
    const check = document.createElement('div'); check.className = 'engine-check';
    check.textContent = th.id === currentTheme ? '✓' : '';
    check.style.color = th.accent;

    row.appendChild(dot); row.appendChild(info); row.appendChild(check);
    row.addEventListener('mouseenter', () => { if (th.id !== currentTheme) row.style.background = 'rgba(255,255,255,0.05)'; });
    row.addEventListener('mouseleave', () => { if (th.id !== currentTheme) row.style.background = 'rgba(255,255,255,0.03)'; });
    row.addEventListener('click', () => applyTheme(th.id));
    list.appendChild(row);
  });
}


// ════════════════════════════════════════════════
//  UPTIME KUMA — Status Page API
// ════════════════════════════════════════════════
async function loadUptime(force = false) {
  const section = document.getElementById('uptimeSection');
  const grid    = document.getElementById('uptimeGrid');
  if (!uptimeConfig.url || !uptimeConfig.slug) {
    if (section) section.style.display = 'none';
    return;
  }
  if (section) section.style.display = 'flex';
  setGlobalDot('loading');

  try {
    const base = uptimeConfig.url.replace(/\/$/, '');
    const slug = uptimeConfig.slug;

    // Fetch status page info + heartbeat data in parallel
    const [pageRes, beatRes] = await Promise.all([
      fetch(base + '/api/status-page/' + slug, { signal: AbortSignal.timeout(8000) }),
      fetch(base + '/api/status-page/heartbeat/' + slug, { signal: AbortSignal.timeout(8000) }),
    ]);

    if (!pageRes.ok) throw new Error('page ' + pageRes.status);
    const pageData = await pageRes.json();
    const beatData = beatRes.ok ? await beatRes.json() : {};

    renderUptimeGrid(pageData, beatData, grid);
    applyUptimeMode();
  } catch (err) {
    grid.innerHTML = '';
    setGlobalDot('unknown');
    const lbl = document.getElementById('uptimeGlobalLabel');
    if (lbl) lbl.textContent = t.uptimeError;
    // Fail silently — hide section after 5s if persistent error
    setTimeout(() => {
      if (document.getElementById('uptimeGlobalLabel')?.textContent === t.uptimeError) {
        if (section) section.style.display = 'none';
      }
    }, 5000);
  }
}

function setGlobalDot(state) {
  const dot = document.getElementById('uptimeGlobalDot');
  const lbl = document.getElementById('uptimeGlobalLabel');
  if (!dot) return;
  dot.className = 'uptime-dot-global';
  if (state === 'up')      { dot.classList.add('up');      if (lbl) lbl.textContent = t.uptimeAllUp; }
  else if (state === 'down')    { dot.classList.add('down');    if (lbl) lbl.textContent = t.uptimeDown; }
  else if (state === 'partial') { dot.classList.add('partial'); if (lbl) lbl.textContent = t.uptimePartial; }
  else if (state === 'loading') { if (lbl) lbl.textContent = t.uptimeLoading; }
  else                          { if (lbl) lbl.textContent = ''; }
}

function renderUptimeGrid(pageData, beatData, container) {
  container.innerHTML = '';

  const groups = pageData.publicGroupList || [];
  let totalUp = 0, totalAll = 0;

  groups.forEach(group => {
    // Group label (only if >1 group)
    if (groups.length > 1) {
      const gl = document.createElement('div');
      gl.className = 'uptime-group-label';
      gl.textContent = group.name;
      container.appendChild(gl);
    }

    (group.monitorList || []).forEach(monitor => {
      const id   = monitor.id;
      const beat = beatData.heartbeatList?.[id] || [];
      const up   = beatData.uptimeList?.[id + '_24'] ?? null;

      // Determine current status from latest heartbeat
      const latest = beat[beat.length - 1];
      const status  = latest?.status ?? 3; // 0=down,1=up,2=pending,3=unknown
      const ping    = latest?.ping ?? null;

      totalAll++;
      if (status === 1) totalUp++;

      const row = document.createElement('div');
      row.className = 'uptime-row' + (status === 0 ? ' down' : '');

      // ── Line 1: dot · name · ping · status badge ──
      const line1 = document.createElement('div');
      line1.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%;';

      const dot = document.createElement('div');
      dot.className = 'uptime-dot ' + (['down','up','pending','unknown'][status] || 'unknown');

      const name = document.createElement('div');
      name.className = 'uptime-name';
      name.textContent = monitor.name;
      name.title = monitor.name;

      const pingEl = document.createElement('div');
      pingEl.className = 'uptime-ping' + (status === 0 ? ' down' : ping !== null && ping < 200 ? ' fast' : ping !== null && ping >= 800 ? ' slow' : '');
      if (status === 0)       pingEl.textContent = 'DOWN';
      else if (ping !== null) pingEl.textContent = ping + 'ms';
      else                    pingEl.textContent = '—';

      line1.appendChild(dot); line1.appendChild(name); line1.appendChild(pingEl);

      // ── Line 2: mini bar chart (last 30 beats) ──
      const line2 = document.createElement('div');
      line2.className = 'uptime-bars';

      const barsData = beat.slice(-30);
      const totalBars = 30;
      for (let i = 0; i < totalBars - barsData.length; i++) {
        const b = document.createElement('div'); b.className = 'uptime-bar empty';
        line2.appendChild(b);
      }
      barsData.forEach(hb => {
        const b = document.createElement('div');
        const st = ['down','up','pending','unknown'][hb.status] || 'unknown';
        b.className = 'uptime-bar ' + st;
        const h = hb.ping ? Math.min(100, Math.max(25, (hb.ping / 1500) * 100)) : 50;
        b.style.height = h + '%';
        b.title = hb.ping ? hb.ping + 'ms' : st;
        line2.appendChild(b);
      });

      const inner = document.createElement('div');
      inner.style.cssText = 'display:flex;flex-direction:column;gap:5px;width:100%;';
      inner.appendChild(line1); inner.appendChild(line2);
      row.appendChild(inner);
      container.appendChild(row);
    });
  });

  // Set global status
  if (totalAll === 0)         setGlobalDot('unknown');
  else if (totalUp === totalAll) setGlobalDot('up');
  else if (totalUp === 0)     setGlobalDot('down');
  else                        setGlobalDot('partial');
}

// Uptime modal
function renderUptimeModal() {
  const urlInput  = document.getElementById('ukUrl');
  const slugInput = document.getElementById('ukSlug');
  if (urlInput)  urlInput.value  = uptimeConfig.url  || '';
  if (slugInput) slugInput.value = uptimeConfig.slug || 'default';
  const result = document.getElementById('uptimeTestResult');
  if (result) result.textContent = '';
  const mode = uptimeConfig.mode || 'extended';
  document.querySelectorAll('#uptimeModeSel .widget-seg-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
}
// Compact mode caps the monitor grid height and scrolls; extended shows it all.
function applyUptimeMode() {
  const grid = document.getElementById('uptimeGrid');
  if (grid) grid.classList.toggle('compact', (uptimeConfig.mode || 'extended') === 'compact');
}
async function setUptimeMode(mode) {
  uptimeConfig.mode = (mode === 'compact') ? 'compact' : 'extended';
  await Store.set('gd_uptime', uptimeConfig);
  applyUptimeMode(); renderUptimeModal();
}

async function saveUptimeConfig() {
  const url  = document.getElementById('ukUrl')?.value.trim().replace(/\/$/, '');
  const slug = document.getElementById('ukSlug')?.value.trim() || 'default';
  const result = document.getElementById('uptimeTestResult');

  if (!url) {
    if (result) { result.textContent = '⚠ ' + t.uptimeUrl; result.style.color = 'var(--red)'; }
    return;
  }

  if (result) { result.textContent = t.uptimeLoading; result.style.color = 'var(--text-muted)'; }

  try {
    const res = await fetch(url + '/api/status-page/' + slug, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const monitors = (data.publicGroupList || []).reduce((n, g) => n + (g.monitorList?.length || 0), 0);
    if (result) {
      result.textContent = '✓ ' + monitors + ' ' + t.monitorsFound;
      result.style.color = 'var(--green)';
    }
    uptimeConfig = { url, slug, mode: uptimeConfig.mode || 'extended' }; // keep the layout mode
    await Store.set('gd_uptime', uptimeConfig);
    // Configuring Uptime activates its widget automatically
    const uw = widgets.find(w => w.id==='uptime');
    if (uw && !uw.active) { uw.active = true; saveWidgets(); renderModalNav(); }
    renderWidgetLayout();
    loadUptime(true);
  } catch (err) {
    if (result) {
      result.textContent = '✗ ' + t.uptimeError + ' — ' + err.message;
      result.style.color = 'var(--red)';
    }
  }
}

async function removeUptimeConfig() {
  uptimeConfig = { url: '', slug: 'default' };
  await Store.set('gd_uptime', uptimeConfig);
  const section = document.getElementById('uptimeSection');
  if (section) section.style.display = 'none';
  // Removing config deactivates the Uptime widget
  const uw = widgets.find(w => w.id==='uptime');
  if (uw && uw.active) { uw.active = false; saveWidgets(); renderModalNav(); renderWidgetLayout(); }
  renderUptimeModal();
  const result = document.getElementById('uptimeTestResult');
  if (result) { result.textContent = t.remove + ' ✓'; result.style.color = 'var(--text-muted)'; }
}


// ════════════════════════════════════════════════
//  HOMELAB WIDGETS — Proxmox · Docker (Portainer) · Pi-hole
//  Authenticated self-hosted APIs. Tokens are only ever sent to the host the
//  user configured; the fetch bypasses CORS via the extension's <all_urls>.
// ════════════════════════════════════════════════

// fetch() to a self-signed HTTPS host throws a TypeError with no detail. We
// classify: a thrown error = connection/cert issue (err.http falsy); a non-ok
// response = HTTP error (err.http true); 401/403 = 'auth'.
function httpErr(kind) { const e = new Error(String(kind)); e.http = true; return e; }
async function fetchService(url, opts = {}, timeout = 8000) {
  try {
    return await fetch(url, { ...opts, signal: AbortSignal.timeout(timeout) });
  } catch (err) {
    const e = new Error(err && err.name === 'TimeoutError' ? 'timeout' : 'connection');
    e.http = false; // network/TLS/cert failure — browser hides the specifics
    throw e;
  }
}
function svcErrText(err) {
  if (err && err.message === 'auth')    return t.svcAuthError;
  if (err && err.message === 'timeout') return t.svcTimeout;
  if (err && err.http)                  return t.svcHttpError + ' ' + err.message;
  return t.svcConnError;
}

// Shared header dot/label for the service widgets (reuses the Uptime header markup)
function setSvcDot(svc, state, label) {
  const dot = document.getElementById(svc + 'Dot');
  const lbl = document.getElementById(svc + 'Label');
  if (dot) {
    dot.className = 'uptime-dot-global';
    if (state === 'up' || state === 'down' || state === 'partial') dot.classList.add(state);
  }
  if (lbl) lbl.textContent = label || '';
}
// Header title: widget name, plus ": <server name>" when the user set one.
function setSvcTitle(svc, i18nKey, name) {
  const el = document.getElementById(svc + 'Title');
  if (el) el.textContent = t[i18nKey] + (name ? ':' : '');
}
// On failure: clear the widget body, mark the dot down and offer a link to open
// the URL (so the user can accept a self-signed cert), for connection errors only.
function svcError(svc, container, cfg, err) {
  if (container) container.innerHTML = '';
  setSvcDot(svc, 'down', svcErrText(err));
  if (container && (!err || !err.http) && cfg.url) {
    const a = document.createElement('a');
    a.href = cfg.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.className = 'svc-cert-link'; a.textContent = t.svcOpenUrl;
    container.appendChild(a);
  }
}
function svcTestError(result, err, url) {
  if (!result) return;
  result.innerHTML = '';
  const span = document.createElement('span');
  span.style.color = 'var(--red)'; span.textContent = '✗ ' + svcErrText(err);
  result.appendChild(span);
  if ((!err || !err.http) && url) {
    result.appendChild(document.createTextNode('  '));
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.className = 'svc-cert-link'; a.textContent = t.svcOpenUrl;
    result.appendChild(a);
  }
}
function svcMsg(el, text, color) {
  if (!el) return; el.textContent = text;
  el.style.color = color === 'red' ? 'var(--red)' : color === 'green' ? 'var(--green)' : 'var(--text-muted)';
}
const _v  = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
const _sv = (id, v) => { const e = document.getElementById(id); if (e) e.value = v || ''; };
function setWidgetActiveState(id, active) {
  const w = widgets.find(x => x.id === id); if (!w) return;
  if (w.active !== active) { w.active = active; saveWidgets(); renderModalNav(); }
  renderWidgetLayout();
}
function svcRow(isUp, midState, name, meta) {
  const row = document.createElement('div'); row.className = 'uptime-row' + (isUp ? '' : ' down');
  const line = document.createElement('div'); line.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%;';
  const dot = document.createElement('div'); dot.className = 'uptime-dot ' + midState;
  const nm = document.createElement('div'); nm.className = 'uptime-name'; nm.textContent = name; nm.title = name;
  const mt = document.createElement('div'); mt.className = 'uptime-ping'; mt.textContent = meta;
  line.appendChild(dot); line.appendChild(nm); line.appendChild(mt);
  row.appendChild(line); return row;
}
// Compact stat tiles (label + value), reused by pihole/proxmox/docker widgets.
function svcStatTiles(box, tiles) {
  const row = document.createElement('div'); row.className = 'svc-stats-row';
  tiles.forEach(x => {
    const s = document.createElement('div'); s.className = 'wstat';
    const l = document.createElement('div'); l.className = 'wstat-l'; l.textContent = x.label;
    const v = document.createElement('div'); v.className = 'wstat-v'; v.textContent = x.value;
    s.appendChild(l); s.appendChild(v); row.appendChild(s);
  });
  box.appendChild(row);
}
// Labelled progress bar (turns red past 90%).
function svcBar(box, label, pct, rightText) {
  pct = Math.min(100, Math.max(0, pct || 0));
  const wrap = document.createElement('div'); wrap.className = 'svc-bar-wrap';
  const lbl = document.createElement('div'); lbl.className = 'svc-bar-label';
  const ls = document.createElement('span'); ls.textContent = label;
  const rs = document.createElement('span'); rs.textContent = rightText;
  lbl.appendChild(ls); lbl.appendChild(rs);
  const bar = document.createElement('div'); bar.className = 'svc-bar';
  const fill = document.createElement('div'); fill.className = 'svc-bar-fill'; fill.style.width = pct + '%';
  if (pct >= 90) fill.style.background = 'var(--red)';
  bar.appendChild(fill); wrap.appendChild(lbl); wrap.appendChild(bar); box.appendChild(wrap);
}
const gbytes = b => (b || 0) / 1073741824;

// ── Proxmox VE ──
// One call to /cluster/resources returns nodes (host CPU/RAM) and guests (VMs/CTs).
async function proxmoxFetchResources(base) {
  const res = await fetchService(base + '/api2/json/cluster/resources',
    { headers: { 'Authorization': 'PVEAPIToken=' + proxmoxConfig.tokenId + '=' + proxmoxConfig.tokenSecret } });
  if (res.status === 401) throw httpErr('auth');
  if (!res.ok) throw httpErr(res.status);
  const data = await res.json();
  const items = data.data || [];
  proxmoxVms = items.filter(i => i.type === 'qemu' || i.type === 'lxc')
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return items;
}
async function loadProxmox() {
  const section = document.getElementById('proxmoxSection');
  const box = document.getElementById('proxmoxStats');
  if (!proxmoxConfig.url || !proxmoxConfig.tokenId || !proxmoxConfig.tokenSecret) { if (section) section.style.display = 'none'; return; }
  if (section) section.style.display = 'flex';
  setSvcDot('proxmox', 'loading', t.uptimeLoading);
  try {
    renderProxmoxStats(await proxmoxFetchResources(proxmoxConfig.url.replace(/\/$/, '')), box);
  } catch (err) { svcError('proxmox', box, proxmoxConfig, err); }
}
function renderProxmoxStats(items, box) {
  box.innerHTML = '';
  const nodes  = items.filter(i => i.type === 'node' && i.status === 'online');
  const guests = items.filter(i => i.type === 'qemu' || i.type === 'lxc');
  const running = guests.filter(g => g.status === 'running');
  // Host CPU/RAM aggregated across online nodes
  let maxcpu = 0, cpuAbs = 0, mem = 0, maxmem = 0;
  nodes.forEach(n => { maxcpu += (n.maxcpu || 0); cpuAbs += (n.cpu || 0) * (n.maxcpu || 0); mem += (n.mem || 0); maxmem += (n.maxmem || 0); });
  const cpuPct = maxcpu ? cpuAbs / maxcpu * 100 : 0;
  const ramPct = maxmem ? mem / maxmem * 100 : 0;
  svcStatTiles(box, [
    { label: t.proxmoxVmsLabel, value: running.length + '/' + guests.length },
    { label: 'CPU', value: cpuPct.toFixed(0) + '%' },
    { label: 'RAM', value: gbytes(mem).toFixed(1) + '/' + gbytes(maxmem).toFixed(0) + ' GB' },
  ]);
  svcBar(box, 'CPU', cpuPct, cpuPct.toFixed(0) + '%');
  svcBar(box, 'RAM', ramPct, ramPct.toFixed(0) + '%');
  // Optional per-VM detail for the VMs the user selected
  const sel = proxmoxConfig.selected || [];
  const selGuests = guests.filter(g => sel.includes(g.vmid));
  if (selGuests.length) {
    const list = document.createElement('div'); list.className = 'svc-detail-list';
    selGuests.forEach(g => {
      const isUp = g.status === 'running';
      const meta = (isUp && g.maxmem) ? Math.round(g.mem / g.maxmem * 100) + '% RAM' : g.status;
      list.appendChild(svcRow(isUp, isUp ? 'up' : 'unknown', g.name || ('VM ' + g.vmid), meta));
    });
    box.appendChild(list);
  }
  setSvcTitle('proxmox', 'proxmoxWidget', proxmoxConfig.name);
  setSvcDot('proxmox', running.length === guests.length ? 'up' : running.length === 0 ? 'down' : 'partial', proxmoxConfig.name || '');
}
async function saveProxmoxConfig() {
  const url = _v('pmUrl').replace(/\/$/, ''), tokenId = _v('pmTokenId'), tokenSecret = _v('pmTokenSecret');
  const result = document.getElementById('proxmoxTestResult');
  if (!url || !tokenId || !tokenSecret) { svcMsg(result, '⚠ ' + t.svcFillFields, 'red'); return; }
  svcMsg(result, t.uptimeLoading, 'muted');
  proxmoxConfig = { url, tokenId, tokenSecret, name: _v('pmName'), selected: proxmoxConfig.selected || [] };
  try {
    await proxmoxFetchResources(url); // populates proxmoxVms and validates the token
    svcMsg(result, '✓ ' + proxmoxVms.length + ' ' + t.proxmoxVms, 'green');
    await saveProxmoxStore(); setWidgetActiveState('proxmox', true); loadProxmox();
    renderProxmoxVmList(); // offer VM selection now that we have the list
  } catch (err) { svcTestError(result, err, url); }
}
async function removeProxmoxConfig() {
  proxmoxConfig = { url: '', tokenId: '', tokenSecret: '', name: '', selected: [] };
  proxmoxVms = [];
  await Store.set('gd_proxmox', proxmoxConfig);
  const s = document.getElementById('proxmoxSection'); if (s) s.style.display = 'none';
  setWidgetActiveState('proxmox', false); renderProxmoxModal();
  svcMsg(document.getElementById('proxmoxTestResult'), t.remove + ' ✓', 'muted');
}
function renderProxmoxModal() {
  _sv('pmName', proxmoxConfig.name); _sv('pmUrl', proxmoxConfig.url); _sv('pmTokenId', proxmoxConfig.tokenId); _sv('pmTokenSecret', proxmoxConfig.tokenSecret);
  const r = document.getElementById('proxmoxTestResult'); if (r) r.textContent = '';
  renderProxmoxVmList();
  // If already configured but the VM list isn't cached yet, fetch it quietly for the selector
  if (proxmoxConfig.url && proxmoxConfig.tokenId && !proxmoxVms.length) {
    proxmoxFetchResources(proxmoxConfig.url.replace(/\/$/, '')).then(renderProxmoxVmList).catch(() => {});
  }
}
// VM selection chips in the config tab (optional per-VM detail on the widget)
function renderProxmoxVmList() {
  const box = document.getElementById('proxmoxVmList'); if (!box) return;
  if (!proxmoxVms.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = 'block';
  box.innerHTML = '';
  const title = document.createElement('div'); title.className = 'add-form-title'; title.textContent = t.proxmoxMonitor;
  const hint = document.createElement('p'); hint.className = 'hint-text'; hint.textContent = t.proxmoxSelectHint;
  const grid = document.createElement('div'); grid.className = 'svc-vm-grid';
  const sel = proxmoxConfig.selected || [];
  proxmoxVms.forEach(vm => {
    const on = sel.includes(vm.vmid);
    const chip = document.createElement('label'); chip.className = 'svc-vm-chip' + (on ? ' on' : '');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = on;
    cb.addEventListener('change', () => {
      const s = new Set(proxmoxConfig.selected || []);
      if (cb.checked) s.add(vm.vmid); else s.delete(vm.vmid);
      proxmoxConfig.selected = [...s];
      chip.classList.toggle('on', cb.checked);
      saveProxmoxStore(); loadProxmox();
    });
    const txt = document.createElement('span'); txt.textContent = vm.name || ('VM ' + vm.vmid);
    chip.appendChild(cb); chip.appendChild(txt); grid.appendChild(chip);
  });
  box.appendChild(title); box.appendChild(hint); box.appendChild(grid);
}

// ── Docker via Portainer ──
// Resolve the Portainer environment (endpoint) id: use the configured one, and if
// it's missing or returns 404, ask /api/endpoints and take the first available.
async function dockerResolveEndpoint(base, headers) {
  const r = await fetchService(base + '/api/endpoints', { headers });
  if (r.status === 401 || r.status === 403) throw httpErr('auth');
  if (!r.ok) throw httpErr(r.status);
  const list = await r.json();
  if (Array.isArray(list) && list.length) return String(list[0].Id);
  throw httpErr(404);
}
// Resolve endpoint (with 404 fallback) and return the Portainer docker proxy base path.
async function dockerProxyBase(base, headers) {
  let ep = dockerConfig.endpointId || '';
  if (!ep) ep = await dockerResolveEndpoint(base, headers);
  // probe /docker/info; on 404 the endpoint id is wrong → auto-resolve and retry
  let res = await fetchService(base + '/api/endpoints/' + ep + '/docker/info', { headers });
  if (res.status === 404) { ep = await dockerResolveEndpoint(base, headers); res = await fetchService(base + '/api/endpoints/' + ep + '/docker/info', { headers }); }
  if (res.status === 401 || res.status === 403) throw httpErr('auth');
  if (!res.ok) throw httpErr(res.status);
  if (ep !== dockerConfig.endpointId) { dockerConfig.endpointId = ep; saveDockerStore(); }
  return { proxy: base + '/api/endpoints/' + ep + '/docker', info: await res.json() };
}
// Host CPU% a running container contributes (0-100 of total host capacity).
function dockerHostCpuPct(s) {
  try {
    const cpuDelta = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
    const sysDelta = s.cpu_stats.system_cpu_usage - s.precpu_stats.system_cpu_usage;
    if (sysDelta > 0 && cpuDelta > 0) return cpuDelta / sysDelta * 100;
  } catch (e) {}
  return 0;
}
async function dockerGetStats(base) {
  const headers = { 'X-API-Key': dockerConfig.apiKey };
  const { proxy, info } = await dockerProxyBase(base, headers);
  const out = {
    total: info.Containers || 0, running: info.ContainersRunning || 0,
    stopped: info.ContainersStopped || 0, paused: info.ContainersPaused || 0,
    images: info.Images || 0, memTotal: info.MemTotal || 0,
  };
  // Best-effort live CPU/RAM: sum per-running-container one-shot stats. Never fatal.
  try {
    const cl = await fetchService(proxy + '/containers/json?filters=' + encodeURIComponent('{"status":["running"]}'), { headers });
    if (cl.ok) {
      const ids = (await cl.json() || []).map(c => c.Id).slice(0, 40);
      const results = await Promise.allSettled(ids.map(id =>
        fetchService(proxy + '/containers/' + id + '/stats?stream=false', { headers }, 6000).then(r => r.ok ? r.json() : null)));
      let mem = 0, cpu = 0, any = false;
      results.forEach(r => {
        if (r.status === 'fulfilled' && r.value) {
          any = true; const s = r.value; const ms = s.memory_stats || {};
          const cache = (ms.stats && (ms.stats.inactive_file ?? ms.stats.cache)) || 0;
          mem += Math.max(0, (ms.usage || 0) - cache);
          cpu += dockerHostCpuPct(s);
        }
      });
      if (any) { out.memBytes = mem; out.cpuPct = cpu; }
    }
  } catch (e) {}
  return out;
}
async function loadDocker() {
  const section = document.getElementById('dockerSection');
  const box = document.getElementById('dockerStats');
  if (!dockerConfig.url || !dockerConfig.apiKey) { if (section) section.style.display = 'none'; return; }
  if (section) section.style.display = 'flex';
  setSvcDot('docker', 'loading', t.uptimeLoading);
  try {
    renderDockerStats(await dockerGetStats(dockerConfig.url.replace(/\/$/, '')), box);
  } catch (err) { svcError('docker', box, dockerConfig, err); }
}
function renderDockerStats(s, box) {
  box.innerHTML = '';
  svcStatTiles(box, [
    { label: t.dockerRunning, value: s.running + '/' + s.total },
    { label: t.dockerStopped, value: String(s.stopped) },
    { label: t.dockerImages, value: String(s.images) },
  ]);
  if (s.memBytes != null && s.memTotal) svcBar(box, 'RAM', s.memBytes / s.memTotal * 100, gbytes(s.memBytes).toFixed(1) + ' GB');
  if (s.cpuPct != null) svcBar(box, 'CPU', s.cpuPct, s.cpuPct.toFixed(0) + '%');
  setSvcTitle('docker', 'dockerWidget', dockerConfig.name);
  setSvcDot('docker', s.running === s.total ? 'up' : s.running === 0 ? 'down' : 'partial', dockerConfig.name || '');
}
async function saveDockerConfig() {
  const url = _v('dkUrl').replace(/\/$/, ''), apiKey = _v('dkApiKey'), endpointId = _v('dkEndpoint');
  const result = document.getElementById('dockerTestResult');
  if (!url || !apiKey) { svcMsg(result, '⚠ ' + t.svcFillFields, 'red'); return; }
  svcMsg(result, t.uptimeLoading, 'muted');
  dockerConfig = { url, apiKey, endpointId, name: _v('dkName') }; // endpointId may be empty → auto-detected
  try {
    const s = await dockerGetStats(url);
    svcMsg(result, '✓ ' + s.running + '/' + s.total + ' ' + t.dockerContainers, 'green');
    await saveDockerStore(); setWidgetActiveState('docker', true); loadDocker();
  } catch (err) { svcTestError(result, err, url); }
}
async function removeDockerConfig() {
  dockerConfig = { url: '', apiKey: '', endpointId: '', name: '' };
  await Store.set('gd_docker', dockerConfig);
  const s = document.getElementById('dockerSection'); if (s) s.style.display = 'none';
  setWidgetActiveState('docker', false); renderDockerModal();
  svcMsg(document.getElementById('dockerTestResult'), t.remove + ' ✓', 'muted');
}
function renderDockerModal() {
  _sv('dkName', dockerConfig.name); _sv('dkUrl', dockerConfig.url); _sv('dkApiKey', dockerConfig.apiKey); _sv('dkEndpoint', dockerConfig.endpointId);
  const r = document.getElementById('dockerTestResult'); if (r) r.textContent = '';
}

// ── Pi-hole v6 (session auth; SID kept in memory only) ──
async function piholeAuth(base) {
  const res = await fetchService(base + '/api/auth',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: piholeConfig.password }) });
  if (res.status === 401) throw httpErr('auth');
  if (!res.ok) throw httpErr(res.status);
  const data = await res.json();
  const sid = data && data.session && data.session.sid;
  if (!sid || (data.session && data.session.valid === false)) throw httpErr('auth');
  return sid;
}
async function piholeSummary(base) {
  if (!piholeSid) piholeSid = await piholeAuth(base);
  let res = await fetchService(base + '/api/stats/summary', { headers: { 'X-FTL-SID': piholeSid } });
  if (res.status === 401) { piholeSid = await piholeAuth(base); res = await fetchService(base + '/api/stats/summary', { headers: { 'X-FTL-SID': piholeSid } }); }
  if (!res.ok) throw httpErr(res.status);
  return res.json();
}
async function loadPihole() {
  const section = document.getElementById('piholeSection');
  const box = document.getElementById('piholeStats');
  if (!piholeConfig.url || !piholeConfig.password) { if (section) section.style.display = 'none'; return; }
  if (section) section.style.display = 'flex';
  setSvcDot('pihole', 'loading', t.uptimeLoading);
  try {
    renderPiholeStats(await piholeSummary(piholeConfig.url.replace(/\/$/, '')), box);
  } catch (err) { piholeSid = null; svcError('pihole', box, piholeConfig, err); }
}
function renderPiholeStats(data, box) {
  box.innerHTML = '';
  const q = (data && data.queries) || {}, g = (data && data.gravity) || {};
  const total = q.total ?? 0, blocked = q.blocked ?? 0;
  const pct = q.percent_blocked != null ? q.percent_blocked : (total ? blocked / total * 100 : 0);
  const domains = g.domains_being_blocked ?? 0;
  const fmt = n => (n || 0).toLocaleString(getLocale());
  svcStatTiles(box, [
    { label: t.piholeQueries, value: fmt(total) },
    { label: t.piholeBlocked, value: fmt(blocked) },
    { label: t.piholeDomains, value: fmt(domains) },
  ]);
  svcBar(box, t.piholeBlockPct, pct, pct.toFixed(1) + '%');
  setSvcDot('pihole', 'up', pct.toFixed(0) + '%');
}
async function savePiholeConfig() {
  const url = _v('phUrl').replace(/\/$/, ''), password = _v('phPassword');
  const result = document.getElementById('piholeTestResult');
  if (!url || !password) { svcMsg(result, '⚠ ' + t.svcFillFields, 'red'); return; }
  svcMsg(result, t.uptimeLoading, 'muted');
  piholeConfig = { url, password }; piholeSid = null;
  try {
    const data = await piholeSummary(url);
    const q = (data && data.queries) || {};
    const pct = q.percent_blocked != null ? q.percent_blocked : 0;
    svcMsg(result, '✓ ' + pct.toFixed(1) + '% ' + t.piholeBlockPct.toLowerCase(), 'green');
    await savePiholeStore(); setWidgetActiveState('pihole', true); loadPihole();
  } catch (err) { piholeSid = null; svcTestError(result, err, url); }
}
async function removePiholeConfig() {
  piholeConfig = { url: '', password: '' }; piholeSid = null;
  await Store.set('gd_pihole', piholeConfig);
  const s = document.getElementById('piholeSection'); if (s) s.style.display = 'none';
  setWidgetActiveState('pihole', false); renderPiholeModal();
  svcMsg(document.getElementById('piholeTestResult'), t.remove + ' ✓', 'muted');
}
function renderPiholeModal() {
  _sv('phUrl', piholeConfig.url); _sv('phPassword', piholeConfig.password);
  const r = document.getElementById('piholeTestResult'); if (r) r.textContent = '';
}



// ════════════════════════════════════════════════
//  EDIT LINK
// ════════════════════════════════════════════════
let editLinkTarget = null;

function openEditLink(sectionId, groupId, linkId) {
  const sec = sections.find(s => s.id === sectionId);
  const grp = sec?.groups.find(g => g.id === groupId);
  const lnk = grp?.links.find(l => l.id === linkId);
  if (!lnk) return;
  editLinkTarget = { sectionId, groupId, linkId };
  document.getElementById('editLinkGroupName').textContent = grp.name;
  document.getElementById('elName').value = lnk.name;
  document.getElementById('elUrl').value  = lnk.url;
  document.getElementById('elIcon').value = lnk.icon || '';
  document.getElementById('elOpen').value = linkOpenMode(lnk);
  updateEditIconPreview(lnk.icon || '');
  showForm('editLinkForm');
  document.getElementById('elName').focus();
}

function closeEditLink() {
  editLinkTarget = null;
  hideForms();
  document.getElementById('elName').value = '';
  document.getElementById('elUrl').value  = '';
  document.getElementById('elIcon').value = '';
  updateEditIconPreview('');
}

function saveEditLink() {
  if (!editLinkTarget) return;
  const name = document.getElementById('elName').value.trim();
  const url  = document.getElementById('elUrl').value.trim();
  const icon = document.getElementById('elIcon').value.trim() || null;
  if (!name || !url) { alert(t.alertAddLink); return; }
  const sec = sections.find(s => s.id === editLinkTarget.sectionId);
  const grp = sec?.groups.find(g => g.id === editLinkTarget.groupId);
  const lnk = grp?.links.find(l => l.id === editLinkTarget.linkId);
  if (!lnk) return;
  lnk.name = name; lnk.url = url; lnk.icon = icon;
  lnk.openIn = document.getElementById('elOpen').value; delete lnk.sameTab;
  save(); closeEditLink(); renderSections(); renderSectionModal();
}

function updateEditIconPreview(url) {
  const img   = document.getElementById('editIconPreviewImg');
  const empty = document.getElementById('editIconPreviewEmpty');
  if (!img) return;
  if (!url) {
    img.src = ''; img.classList.remove('loaded');
    if (empty) empty.style.display = '';
    return;
  }
  img.onload  = () => { img.classList.add('loaded'); if (empty) empty.style.display = 'none'; };
  img.onerror = () => { img.classList.remove('loaded'); if (empty) empty.style.display = ''; };
  img.src = url;
}

// ════════════════════════════════════════════════
//  ABOUT
// ════════════════════════════════════════════════
// Fallback only for when the page is opened outside the extension context
// (e.g. dashboard.html served as a plain file). The real source of truth is manifest.json.
const APP_VERSION_FALLBACK = '1.12.0';

function getAppVersion() {
  try {
    const rt = (typeof browser!=='undefined' && browser.runtime) || (typeof chrome!=='undefined' && chrome.runtime);
    if (rt && rt.getManifest) return rt.getManifest().version;
  } catch(e) {}
  return APP_VERSION_FALLBACK;
}

// What's-new list shown in the About tab. Newest first; items translated per language.
const CHANGELOG = [
  { v: '1.12.0',
    es: ['Configuración rediseñada: menú por grupos, descripción en cada panel y diálogos aparte para añadir y editar', 'Arrastrar y soltar para ordenar links, secciones, grupos, vídeos, feeds, mercados y widgets (en dos columnas, izquierda y derecha)', 'Cada link se abre en pestaña nueva, pestaña actual o ventana nueva', 'Nuevos idiomas: francés y alemán', 'Modal de bienvenida en el primer uso y nuevo logo'],
    en: ['Redesigned settings: grouped menu, a description on each panel and separate dialogs to add and edit', 'Drag & drop to reorder links, sections, groups, videos, feeds, markets and widgets (in two columns, left and right)', 'Each link opens in a new tab, the current tab or a new window', 'New languages: French and German', 'Welcome dialog on first use and a new logo'],
    ru: ['Новый дизайн настроек: меню по группам, описание на каждой панели и отдельные окна для добавления и изменения', 'Перетаскивание для изменения порядка ссылок, разделов, групп, видео, лент, рынков и виджетов (в двух колонках: слева и справа)', 'Каждая ссылка открывается в новой вкладке, текущей вкладке или новом окне', 'Новые языки: французский и немецкий', 'Окно приветствия при первом запуске и новый логотип'],
    fr: ['Paramètres repensés : menu par groupes, description sur chaque panneau et boîtes de dialogue séparées pour ajouter et modifier', 'Glisser-déposer pour réorganiser les liens, sections, groupes, vidéos, flux, marchés et widgets (sur deux colonnes, gauche et droite)', 'Chaque lien s\'ouvre dans un nouvel onglet, l\'onglet actuel ou une nouvelle fenêtre', 'Nouvelles langues : français et allemand', 'Fenêtre de bienvenue à la première utilisation et nouveau logo'],
    de: ['Neu gestaltete Einstellungen: gruppiertes Menü, Beschreibung auf jedem Panel und eigene Dialoge zum Hinzufügen und Bearbeiten', 'Drag & Drop zum Umsortieren von Links, Abschnitten, Gruppen, Videos, Feeds, Märkten und Widgets (in zwei Spalten, links und rechts)', 'Jeder Link öffnet sich in einem neuen Tab, im aktuellen Tab oder in einem neuen Fenster', 'Neue Sprachen: Französisch und Deutsch', 'Willkommensdialog bei der ersten Nutzung und neues Logo'] },
  { v: '1.11.0',
    es: ['Selector de tipo de fondo: URL, Bing Daily, Wallhaven y gradientes', 'Fondo de Bing diario por defecto'],
    en: ['Background type selector: URL, Bing Daily, Wallhaven and gradients', 'Bing daily wallpaper by default'],
    ru: ['Выбор типа фона: URL, Bing Daily, Wallhaven и градиенты', 'Ежедневные обои Bing по умолчанию'],
    fr: ["Sélecteur du type d'arrière-plan : URL, Bing Daily, Wallhaven et dégradés", "Fond d'écran Bing du jour par défaut"],
    de: ['Auswahl des Hintergrundtyps: URL, Bing Daily, Wallhaven und Farbverläufe', 'Bing-Hintergrund des Tages als Standard'] },
  { v: '1.10.0',
    es: ['Widgets de homelab: Proxmox, Docker (Portainer) y Pi-hole', 'Nombre de servidor y formato compacto en Uptime Kuma'],
    en: ['Homelab widgets: Proxmox, Docker (Portainer) and Pi-hole', 'Server name and compact layout for Uptime Kuma'],
    ru: ['Виджеты homelab: Proxmox, Docker (Portainer) и Pi-hole', 'Имя сервера и компактный вид Uptime Kuma'],
    fr: ['Widgets homelab : Proxmox, Docker (Portainer) et Pi-hole', "Nom du serveur et affichage compact pour Uptime Kuma"],
    de: ['Homelab-Widgets: Proxmox, Docker (Portainer) und Pi-hole', 'Servername und kompaktes Layout für Uptime Kuma'] },
  { v: '1.9.0',
    es: ['Gestor de widgets: activar, desactivar, mover entre barras y reordenar'],
    en: ['Widget manager: enable, disable, move between bars and reorder'],
    ru: ['Менеджер виджетов: включение, отключение, перемещение и порядок'],
    fr: ['Gestionnaire de widgets : activer, désactiver, déplacer entre les barres et réorganiser'],
    de: ['Widget-Manager: aktivieren, deaktivieren, zwischen den Leisten verschieben und umsortieren'] },
];

function renderAbout() {
  const v = getAppVersion();
  const badge = document.getElementById('aboutVersion');
  if (badge) badge.textContent = 'v' + v;
  const row = document.getElementById('aboutVersionRow');
  if (row) row.textContent = v;
  const cl = document.getElementById('aboutChangelog');
  if (cl) {
    cl.innerHTML = '';
    const lang = LANGUAGES[currentLang] ? currentLang : 'en';
    CHANGELOG.forEach(entry => {
      const items = entry[lang] || entry.en || [];
      if (!items.length) return;
      const ver = document.createElement('div'); ver.className = 'changelog-ver'; ver.textContent = 'v' + entry.v;
      const ul = document.createElement('ul'); ul.className = 'changelog-list';
      items.forEach(it => { const li = document.createElement('li'); li.textContent = it; ul.appendChild(li); });
      cl.appendChild(ver); cl.appendChild(ul);
    });
  }
}

// ════════════════════════════════════════════════
//  NOTES
// ════════════════════════════════════════════════
const notepad=document.getElementById('notepad');
let _noteTimer=null;
notepad.addEventListener('input',()=>{ clearTimeout(_noteTimer); _noteTimer=setTimeout(async()=>{ showSyncBadge('syncing'); await Store.set('gd_note',notepad.value); },800); });

// ════════════════════════════════════════════════
//  KEYBOARD
// ════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (e.key==='Escape' && document.getElementById('welcomeOverlay').classList.contains('open')) { closeWelcome(false); return; }
  if (e.key==='Escape') { if (document.getElementById('formOverlay').classList.contains('open')) hideForms(); else closeModal(); }
  if (e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) { e.preventDefault(); document.getElementById('searchInput').focus(); }
});

// ════════════════════════════════════════════════
//  WIRE UP ALL EVENT LISTENERS (no inline handlers)
// ════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Gear button
  document.getElementById('gearBtn').addEventListener('click', ()=>openModal('links'));
  // Sidebar feeds refresh
  document.getElementById('btnRefreshFeeds').addEventListener('click', refreshFeeds);
  // Modal
  document.getElementById('modalOverlay').addEventListener('click', e=>{ if(e.target.id==='modalOverlay')closeModal(); });
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('btnModalFooterClose').addEventListener('click', closeModal);
  document.getElementById('btnWelcomeStart').addEventListener('click', () => closeWelcome(false));
  document.getElementById('btnWelcomeSettings').addEventListener('click', () => closeWelcome(true));
  document.getElementById('btnExport').addEventListener('click', exportConfig);
  document.getElementById('btnImport').addEventListener('click', () => document.getElementById('importFileInput').click());
  document.getElementById('importFileInput').addEventListener('change', e => { importConfig(e.target.files[0]); e.target.value=''; });
  document.querySelectorAll('.modal-tab').forEach(t=>t.addEventListener('click',()=>switchTab(t.dataset.tab)));
  // Links tab
  document.getElementById('btnAddSection').addEventListener('click', addSection);
  document.getElementById('btnAddGroup').addEventListener('click', addGroup);
  document.getElementById('btnCancelGroup').addEventListener('click', ()=>{ hideForms(); pendingSection=null; });
  document.getElementById('btnAddLink').addEventListener('click', addLink);
  // Icon picker live preview
  document.getElementById('lName').addEventListener('input', () => { clearTimeout(_iconDebounce); _iconDebounce = setTimeout(suggestIcon, 350); });
  document.getElementById('lUrl').addEventListener('input',  () => { clearTimeout(_iconDebounce); _iconDebounce = setTimeout(suggestIcon, 350); });
  document.getElementById('lIcon').addEventListener('input', e => updateIconPreview(e.target.value.trim()));
  document.getElementById('btnCloseAddLink').addEventListener('click', ()=>{ hideForms(); pendingGroup=null; });
  document.getElementById('btnCancelSection').addEventListener('click', hideForms);
  document.getElementById('formOverlay').addEventListener('click', e=>{ if(e.target.id==='formOverlay') hideForms(); });
  document.getElementById('formOverlay').addEventListener('keydown', e=>{
    if (e.key!=='Enter' || e.target.tagName!=='INPUT') return;
    const form = e.target.closest('.add-form'); const ok = form && form.querySelector('.btn-primary');
    if (ok) { e.preventDefault(); ok.click(); }
  });
  document.getElementById('btnSaveEditLink').addEventListener('click', saveEditLink);
  document.getElementById('btnCloseEditLink').addEventListener('click', closeEditLink);
  document.getElementById('elIcon').addEventListener('input', e => updateEditIconPreview(e.target.value.trim()));
  document.getElementById('elName').addEventListener('input', () => {
    clearTimeout(_iconDebounce);
    _iconDebounce = setTimeout(() => {
      if (document.getElementById('elIcon').value.trim()) return;
      const si = getSimpleIconUrl(document.getElementById('elName').value.trim(), document.getElementById('elUrl').value.trim());
      if (si) { document.getElementById('elIcon').value = si; updateEditIconPreview(si); }
    }, 350);
  });
  // Feeds tab
  document.getElementById('btnAddFeed').addEventListener('click', addFeed);
  document.getElementById('btnTogglePresets').addEventListener('click', togglePresets);
  document.getElementById('btnCancelFeed').addEventListener('click', hideForms);
  document.getElementById('btnCancelMarket').addEventListener('click', hideForms);
  // Calendar
  document.getElementById('calPrev').addEventListener('click', () => {
    calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar();
  });
  document.getElementById('calNext').addEventListener('click', () => {
    calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar();
  });
  // Videos tab
  document.getElementById('btnManageVideos').addEventListener('click',  ()=>openModal('videos'));
  document.getElementById('btnRefreshVideos').addEventListener('click', ()=>{ videoCache={}; loadVideos(true); });
  document.getElementById('btnAddChannel').addEventListener('click', addChannel);
  document.getElementById('btnCancelChannel').addEventListener('click', hideForms);
  // Markets tab
  document.getElementById('btnManageUptime').addEventListener('click', () => openModal('uptime'));
  document.getElementById('btnRefreshUptime').addEventListener('click', () => loadUptime(true));
  document.getElementById('btnSaveUptime').addEventListener('click', saveUptimeConfig);
  document.getElementById('btnRemoveUptime').addEventListener('click', removeUptimeConfig);
  document.getElementById('uptimeModeSel').addEventListener('click', e => {
    const b = e.target.closest('.widget-seg-btn'); if (b) setUptimeMode(b.dataset.mode);
  });
  // Homelab widgets (Proxmox / Docker / Pi-hole)
  document.getElementById('btnManageProxmox').addEventListener('click', () => openModal('proxmox'));
  document.getElementById('btnRefreshProxmox').addEventListener('click', loadProxmox);
  document.getElementById('btnSaveProxmox').addEventListener('click', saveProxmoxConfig);
  document.getElementById('btnRemoveProxmox').addEventListener('click', removeProxmoxConfig);
  document.getElementById('btnManageDocker').addEventListener('click', () => openModal('docker'));
  document.getElementById('btnRefreshDocker').addEventListener('click', loadDocker);
  document.getElementById('btnSaveDocker').addEventListener('click', saveDockerConfig);
  document.getElementById('btnRemoveDocker').addEventListener('click', removeDockerConfig);
  document.getElementById('btnManagePihole').addEventListener('click', () => openModal('pihole'));
  document.getElementById('btnRefreshPihole').addEventListener('click', () => { piholeSid = null; loadPihole(); });
  document.getElementById('btnSavePihole').addEventListener('click', savePiholeConfig);
  document.getElementById('btnRemovePihole').addEventListener('click', removePiholeConfig);
  document.getElementById('btnManageMarkets').addEventListener('click', () => openModal('markets'));
  document.getElementById('btnRefreshMarkets').addEventListener('click', loadMarkets);
  document.getElementById('btnAddMarket').addEventListener('click', addMarket);
  document.getElementById('btnMarketPresets').addEventListener('click', toggleMarketPresets);
  // Wall tab
  document.getElementById('wallUrlInput').addEventListener('input', e=>onWallUrlInput(e.target.value));
  document.getElementById('btnApplyWallUrl').addEventListener('click', ()=>applyWallUrl());
  document.getElementById('wallTypeSel').addEventListener('click', e=>{ const b=e.target.closest('.widget-seg-btn'); if(b) setWallSource(b.dataset.src); });
  document.getElementById('btnBingApply').addEventListener('click', ()=>fetchBingWallpaper(true));
  document.getElementById('btnWhSearch').addEventListener('click', ()=>wallhavenSearch(document.getElementById('whSearch').value.trim(), 1));
  document.getElementById('whSearch').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); wallhavenSearch(e.target.value.trim(), 1); } });
  document.getElementById('whPrev').addEventListener('click', ()=>{ if(whPage>1) wallhavenSearch(whQuery, whPage-1); });
  document.getElementById('whNext').addEventListener('click', ()=>{ if(whPage<whLastPage) wallhavenSearch(whQuery, whPage+1); });
  document.getElementById('slOpacity').addEventListener('input', e=>onWallSlider('opacity',e.target.value));
  document.getElementById('slDim').addEventListener('input',     e=>onWallSlider('dim',    e.target.value));
  document.getElementById('slBlur').addEventListener('input',    e=>onWallSlider('blur',   e.target.value));
  document.getElementById('slTint').addEventListener('input',    e=>onWallSlider('tint',   e.target.value));
  document.getElementById('slGlass').addEventListener('input',   e=>onWallSlider('glass',  e.target.value));
  document.getElementById('btnRemoveWall').addEventListener('click', removeWallpaper);
  document.getElementById('btnResetWall').addEventListener('click',  resetWallSettings);
  // Font size buttons — event delegation
  document.addEventListener('click', e => {
    const btn = e.target.closest('.font-size-btn');
    if (btn && btn.dataset.size) applyFontSize(btn.dataset.size);
  });
});

// ════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════
async function init() {
  // Migrate old gd_groups format if needed
  const oldGroups = await Store.get('gd_groups', null);
  if (oldGroups && !await Store.get('gd_sections', null)) {
    sections = [{ id:uid(), name:'Main', groups: oldGroups }];
    await Store.set('gd_sections', sections);
  } else {
    sections = await Store.get('gd_sections', DEFAULT_SECTIONS);
  }
  feeds       = await Store.get('gd_feeds',    DEFAULT_FEEDS);
  notepad.value = await Store.get('gd_note', '');
  // Fresh install (no saved gd_wall) defaults to the Bing daily wallpaper.
  // DEFAULT_WALL stays 'none' so "Remove background"/"Restore" still clear it.
  const wallMeta = await Store.get('gd_wall', { ...DEFAULT_WALL, type: 'bing', source: 'bing' });
  wallSettings = { ...DEFAULT_WALL, ...wallMeta };
  // Migrate configs saved before the source selector existed: derive the active tab from type.
  if (wallMeta.source === undefined) {
    wallSettings.source = wallSettings.type === 'gradient' ? 'gradient' : wallSettings.type === 'bing' ? 'bing' : 'url';
  }
  applyWallSettings(wallSettings);
  if (wallSettings.type === 'bing') fetchBingWallpaper(false); // fetch/refresh today's Bing image (best-effort)

  markets  = await Store.get('gd_markets',  DEFAULT_MARKETS);
  const savedEngine = await Store.get('gd_engine', 'google');
  applyEngine(savedEngine);
  // Use the saved preference if any; otherwise detect the browser language (fallback EN).
  // save=false so we don't persist until the user explicitly picks a language.
  const savedLang = await Store.get('gd_lang', null);
  applyLang(savedLang || getBrowserLang(), false);
  const savedTheme = await Store.get('gd_theme', 'obsidian');
  applyTheme(savedTheme);
  const savedFont = await Store.get('gd_fontsize', 'md');
  applyFontSize(savedFont);
  uptimeConfig = await Store.get('gd_uptime', { url: '', slug: 'default' });
  proxmoxConfig = await Store.get('gd_proxmox', proxmoxConfig);
  dockerConfig  = await Store.get('gd_docker',  dockerConfig);
  piholeConfig  = await Store.get('gd_pihole',  piholeConfig);
  channels = await Store.get('gd_channels', DEFAULT_CHANNELS);
  widgets = normalizeWidgets(await Store.get('gd_widgets', null) || DEFAULT_WIDGETS.map(w => ({ ...w })));
  renderAbout();
  renderCalendar();
  renderSections();
  renderFeedTabs();
  loadVideos();
  loadUptime();
  loadProxmox();
  loadDocker();
  loadPihole();
  loadMarkets();
  loadWeather();
  renderWidgetLayout();

  const badge=document.getElementById('syncBadge');
  // Auto-refresh the live service widgets every 60s
  setInterval(() => { loadUptime(); loadProxmox(); loadDocker(); loadPihole(); }, 60000);
  if (badge) {
    if (USE_SYNC) { badge.textContent=t.syncActiveMsg; badge.style.color='var(--green)'; badge.style.opacity='1'; setTimeout(()=>badge.style.opacity='0',3500); }
    else { badge.textContent=t.syncLocalMsg; badge.style.color='var(--text-muted)'; badge.style.opacity='1'; }
  }
}
// First run: a short welcome explaining the add-on. Anyone who already has saved settings
// (e.g. an existing user after an update, or a synced browser) never sees it.
async function maybeShowWelcome() {
  if (await Store.get('gd_welcomed', false)) return;
  const hasConfig = await Store.get('gd_sections', null) !== null || await Store.get('gd_lang', null) !== null;
  if (hasConfig) { await Store.set('gd_welcomed', true); return; }
  document.getElementById('welcomeOverlay').classList.add('open');
}
async function closeWelcome(openSettings) {
  document.getElementById('welcomeOverlay').classList.remove('open');
  await Store.set('gd_welcomed', true);
  if (openSettings) openModal('links');
}
init().then(maybeShowWelcome);
