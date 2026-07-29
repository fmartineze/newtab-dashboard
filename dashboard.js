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
const DEFAULT_WALL = { opacity:100, dim:45, blur:0, tint:0, glass:18, src:null, type:'none', grad:null };
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
let videoCache = {};   // channelId → [{title,link,thumb,age}]

let markets   = DEFAULT_MARKETS;
let sections  = DEFAULT_SECTIONS;
let feeds     = DEFAULT_FEEDS;
let wallSettings = { ...DEFAULT_WALL };
let activeFeedId = null;
let feedCache    = {};

// pending add state
let pendingSection = null; // section id waiting for a new group
let pendingGroup   = null; // {sectionId, groupId} waiting for a new link

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


// ════════════════════════════════════════════════
//  i18n — Internationalization
// ════════════════════════════════════════════════
const LANGUAGES = {
  es: {
    // General
    settings:       'Configuración',
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
    linksHint:      'Los grupos se organizan en <strong>secciones</strong>. Cada sección es una fila de columnas en el dashboard.',
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
    save:           'Guardar',
    remove:         'Eliminar',
    uptimeAllUp:    'Todos operativos',
    uptimePartial:  'Degradado',
    uptimeDown:     'Incidente activo',
    uptimeError:    'Error al conectar',
    uptimeLoading:  'Conectando…',
    // Tab Acerca de
    about:            'Acerca de',
    aboutTagline:     'Nueva pestaña minimalista para Firefox',
    aboutProject:     'Proyecto',
    aboutDeveloper:   'Desarrollador',
    aboutContributors:'Colaboradores',
    aboutContributorsLink:'Ver colaboradores',
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
    linksHint:      'Groups are organized into <strong>sections</strong>. Each section is a row of columns in the dashboard.',
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
    save:           'Save',
    remove:         'Remove',
    uptimeAllUp:    'All operational',
    uptimePartial:  'Degraded',
    uptimeDown:     'Active incident',
    uptimeError:    'Connection error',
    uptimeLoading:  'Connecting…',
    // Tab About
    about:            'About',
    aboutTagline:     'A minimal new tab for Firefox',
    aboutProject:     'Project',
    aboutDeveloper:   'Developer',
    aboutContributors:'Contributors',
    aboutContributorsLink:'View contributors',
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
    refresh: 'Обновить', manage: 'Управлять', name: 'Название', items: 'Элементы', popular: 'Популярные…',
    clickToSelect: 'Нажмите, чтобы выбрать', clickToAdd: 'Нажмите, чтобы добавить', loading: 'Загрузка...',
    symbol: 'Символ', displayName: 'Отображаемое имя', export: 'Экспорт', import: 'Импорт',
    news: 'Новости', feedEmpty: 'Добавьте RSS-ленту во вкладке Links.',
    goodMorning: 'Доброе утро', goodAfternoon: 'Добрый день', goodEvening: 'Добрый вечер',
    weather: 'Погода', wind: 'Ветер', humidity: 'Влажность', feelsLike: 'Ощущ.', calendar: 'Календарь',
    markets: 'Рынки', quickNote: 'Быстрая заметка', writeSomething: 'Напишите что-нибудь...',
    searchPlaceholder: 'Поиск или переход по URL...', links: 'Ссылки', videos: 'Видео',
    searchEngine: 'Поисковик', background: 'Фон', language: 'Язык',
    linksHint: 'Группы организованы в <strong>разделы</strong>. Каждый раздел — это ряд колонок на дашборде.',
    newSection: 'Новый раздел', sectionName: 'Название раздела', sectionPlaceholder: 'Работа, Dev, Дом…',
    createSection: 'Создать раздел', newGroupIn: 'Новая группа в:', groupName: 'Название группы',
    groupPlaceholder: 'Gmail, GitHub, Proxmox…', createGroup: 'Создать группу', addLinkTo: 'Добавить ссылку в:',
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
    uptimeUrl: 'URL Uptime Kuma', save: 'Сохранить', remove: 'Удалить',
    uptimeAllUp: 'Все работают', uptimePartial: 'Частичные сбои', uptimeDown: 'Активный инцидент',
    uptimeError: 'Ошибка подключения', uptimeLoading: 'Подключение…',
    about: 'О программе', aboutTagline: 'Минималистичная новая вкладка для Firefox',
    aboutProject: 'Проект', aboutDeveloper: 'Разработчик', aboutVersionLabel: 'Версия',
    aboutContributors: 'Соавторы', aboutContributorsLink: 'Посмотреть соавторов',
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
  }
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
  return 'en-GB';
}

function renderLangModal() {
  const list = document.getElementById('langList'); if (!list) return;
  list.innerHTML = '';
  const langs = [
    { code:'es', label:'Español', flag:'🇪🇸' },
    { code:'en', label:'English', flag:'🇬🇧' },
    { code:'ru', label:'Русский', flag:'🇷🇺' },
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
  const h = n.getHours();
  document.getElementById('greetSub').textContent = h<12 ? t.goodMorning : h<20 ? t.goodAfternoon : t.goodEvening;
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
        const a = document.createElement('a'); a.className = 'link-row'; a.href = l.url; a.target = '_blank';
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
//  MODAL
// ════════════════════════════════════════════════
function openModal(tab='links') { document.getElementById('modalOverlay').classList.add('open'); switchTab(tab); }
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); resetPending(); }
function resetPending() { pendingSection=null; pendingGroup=null; document.getElementById('addGroupForm').style.display='none'; document.getElementById('addLinkForm').style.display='none'; }

function switchTab(tab) {
  document.querySelectorAll('.modal-tab').forEach(t => t.classList.toggle('active', t.dataset.tab===tab));
  document.querySelectorAll('.modal-panel').forEach(p => p.classList.toggle('active', p.id==='tab-'+tab));
  if (tab==='links') renderSectionModal();
  if (tab==='feeds') renderFeedModal();
  if (tab==='markets') renderMarketModal();
  if (tab==='engine')  renderEngineModal();
  if (tab==='lang')    renderLangModal();
  if (tab==='uptime')  renderUptimeModal();
  if (tab==='videos')  renderVideoChannelModal();
  if (tab==='about')   renderAbout();
  if (tab==='appearance') { renderThemeModal(); renderGradientPresets(); updateWallPreview(wallSettings.type==='image'?wallSettings.src:null); }
}

// ── Section / Group / Link modal ──
function makeBtn(cls, text, fn) {
  const b = document.createElement('button'); b.className=cls; b.textContent=text;
  b.addEventListener('click', fn); return b;
}

function renderSectionModal() {
  const list = document.getElementById('sectionItemList'); list.innerHTML='';
  if (!sections.length) { setMsg(list, 'empty-state', t.noSections); return; }

  sections.forEach((sec, si) => {
    // Section card
    const sc = document.createElement('div'); sc.className='item-card'; sc.style.flexDirection='column'; sc.style.alignItems='stretch'; sc.style.gap='8px';

    const scHead = document.createElement('div'); scHead.style.cssText='display:flex;align-items:center;gap:9px;';
    const scInfo = document.createElement('div'); scInfo.className='item-card-info';
    const scName = document.createElement('div'); scName.className='item-card-name'; scName.textContent=sec.name;
    const scSub  = document.createElement('div'); scSub.className='item-card-sub'; scSub.textContent=sec.groups.length+' '+t.groups;
    scInfo.appendChild(scName); scInfo.appendChild(scSub);

    const scAct = document.createElement('div'); scAct.className='item-card-actions';
    scAct.appendChild(makeBtn('btn btn-ghost btn-sm', t.addGroupBtn, () => openAddGroup(sec.id)));
    if (si>0)               scAct.appendChild(makeBtn('btn btn-ghost btn-sm','↑',() => moveSection(sec.id,-1)));
    if (si<sections.length-1) scAct.appendChild(makeBtn('btn btn-ghost btn-sm','↓',() => moveSection(sec.id, 1)));
    scAct.appendChild(makeBtn('btn btn-danger btn-sm','×',() => deleteSection(sec.id)));

    scHead.appendChild(scInfo); scHead.appendChild(scAct);
    sc.appendChild(scHead);

    // Groups inside section
    if (sec.groups.length) {
      const subList = document.createElement('div'); subList.className='modal-sub-list';
      sec.groups.forEach((g, gi) => {
        const gc = document.createElement('div'); gc.className='modal-sub-card'; gc.style.flexDirection='column'; gc.style.alignItems='stretch'; gc.style.gap='6px';

        const gcHead = document.createElement('div'); gcHead.style.cssText='display:flex;align-items:center;gap:8px;';
        const gcInfo = document.createElement('div'); gcInfo.className='item-card-info';
        const gcName = document.createElement('div'); gcName.className='item-card-name'; gcName.style.fontSize='11.5px'; gcName.textContent=g.name;
        const gcSub  = document.createElement('div'); gcSub.className='item-card-sub'; gcSub.textContent=g.links.length+' '+t.linksWord;
        gcInfo.appendChild(gcName); gcInfo.appendChild(gcSub);

        const gcAct = document.createElement('div'); gcAct.className='item-card-actions';
        gcAct.appendChild(makeBtn('btn btn-ghost btn-sm',t.addLinkBtn,() => openAddLink(sec.id, g.id)));
        if (gi>0)               gcAct.appendChild(makeBtn('btn btn-ghost btn-sm','↑',() => moveGroup(sec.id,g.id,-1)));
        if (gi<sec.groups.length-1) gcAct.appendChild(makeBtn('btn btn-ghost btn-sm','↓',() => moveGroup(sec.id,g.id, 1)));
        gcAct.appendChild(makeBtn('btn btn-danger btn-sm','×',() => deleteGroup(sec.id,g.id)));

        gcHead.appendChild(gcInfo); gcHead.appendChild(gcAct);
        gc.appendChild(gcHead);

        // Links inside group
        if (g.links.length) {
          const lList = document.createElement('div'); lList.style.cssText='display:flex;flex-direction:column;gap:2px;padding-left:10px;';
          g.links.forEach((l, li) => {
            const lc = document.createElement('div'); lc.style.cssText='display:flex;align-items:center;gap:7px;padding:3px 0;';
            const lInfo = document.createElement('div'); lInfo.style.cssText='flex:1;min-width:0;';
            const lName = document.createElement('span'); lName.style.cssText='font-size:11px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'; lName.textContent=l.name;
            const lSub  = document.createElement('span'); lSub.style.cssText='font-size:9.5px;color:var(--text-muted);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'; lSub.textContent=l.url;
            lInfo.appendChild(lName); lInfo.appendChild(lSub);
            const lAct = document.createElement('div'); lAct.className='item-card-actions';
            lAct.appendChild(makeBtn('btn btn-ghost btn-sm','✎',() => openEditLink(sec.id,g.id,l.id)));
            if (li>0)              lAct.appendChild(makeBtn('btn btn-ghost btn-sm','↑',() => moveLink(sec.id,g.id,l.id,-1)));
            if (li<g.links.length-1) lAct.appendChild(makeBtn('btn btn-ghost btn-sm','↓',() => moveLink(sec.id,g.id,l.id, 1)));
            lAct.appendChild(makeBtn('btn btn-danger btn-sm','×',() => deleteLink(sec.id,g.id,l.id)));
            lc.appendChild(lInfo); lc.appendChild(lAct);
            lList.appendChild(lc);
          });
          gc.appendChild(lList);
        }

        subList.appendChild(gc);
      });
      sc.appendChild(subList);
    }
    list.appendChild(sc);
  });
}

// Pending add forms
function openAddGroup(sectionId) {
  pendingSection = sectionId; pendingGroup = null;
  const sec = sections.find(s => s.id===sectionId);
  document.getElementById('addGroupSectionName').textContent = sec ? sec.name : '';
  document.getElementById('addGroupForm').style.display = 'flex';
  document.getElementById('addLinkForm').style.display  = 'none';
  document.getElementById('gName').value = '';
  document.getElementById('gName').focus();
}
function openAddLink(sectionId, groupId) {
  pendingGroup = { sectionId, groupId }; pendingSection = null;
  const sec = sections.find(s => s.id===sectionId);
  const grp = sec && sec.groups.find(g => g.id===groupId);
  document.getElementById('addLinkGroupName').textContent = grp ? grp.name : '';
  document.getElementById('addLinkForm').style.display  = 'flex';
  document.getElementById('addGroupForm').style.display = 'none';
  document.getElementById('lName').value = '';
  document.getElementById('lUrl').value  = '';
  document.getElementById('lIcon').value = '';
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
  sections.push({ id:uid(), name, groups:[] });
  document.getElementById('sName').value='';
  save(); renderSections(); renderSectionModal();
}
function deleteSection(id) { sections = sections.filter(s => s.id!==id); save(); renderSections(); renderSectionModal(); }
function moveSection(id, dir) {
  const i = sections.findIndex(s => s.id===id); const ni=i+dir;
  if (ni<0||ni>=sections.length) return;
  [sections[i],sections[ni]]=[sections[ni],sections[i]]; save(); renderSections(); renderSectionModal();
}
function addGroup() {
  const name = document.getElementById('gName').value.trim(); if (!name||!pendingSection) return;
  const sec = sections.find(s => s.id===pendingSection); if (!sec) return;
  sec.groups.push({ id:uid(), name, links:[] });
  document.getElementById('addGroupForm').style.display='none';
  pendingSection=null;
  save(); renderSections(); renderSectionModal();
}
function deleteGroup(sectionId, groupId) {
  const sec = sections.find(s => s.id===sectionId); if (!sec) return;
  sec.groups = sec.groups.filter(g => g.id!==groupId);
  save(); renderSections(); renderSectionModal();
}
function moveGroup(sectionId, groupId, dir) {
  const sec = sections.find(s => s.id===sectionId); if (!sec) return;
  const i=sec.groups.findIndex(g => g.id===groupId); const ni=i+dir;
  if (ni<0||ni>=sec.groups.length) return;
  [sec.groups[i],sec.groups[ni]]=[sec.groups[ni],sec.groups[i]]; save(); renderSections(); renderSectionModal();
}
function addLink() {
  const name = document.getElementById('lName').value.trim();
  const url  = document.getElementById('lUrl').value.trim();
  const icon = document.getElementById('lIcon').value.trim() || null;
  if (!name||!url||!pendingGroup) return;
  const sec = sections.find(s => s.id===pendingGroup.sectionId); if (!sec) return;
  const grp = sec.groups.find(g => g.id===pendingGroup.groupId); if (!grp) return;
  grp.links.push({ id:uid(), name, url, icon });
  document.getElementById('addLinkForm').style.display='none'; pendingGroup=null;
  save(); renderSections(); renderSectionModal();
}
function deleteLink(sectionId, groupId, linkId) {
  const sec = sections.find(s => s.id===sectionId); if (!sec) return;
  const grp = sec.groups.find(g => g.id===groupId); if (!grp) return;
  grp.links = grp.links.filter(l => l.id!==linkId);
  save(); renderSections(); renderSectionModal();
}
function moveLink(sectionId, groupId, linkId, dir) {
  const sec = sections.find(s => s.id===sectionId); if (!sec) return;
  const grp = sec.groups.find(g => g.id===groupId); if (!grp) return;
  const i=grp.links.findIndex(l => l.id===linkId); const ni=i+dir;
  if (ni<0||ni>=grp.links.length) return;
  [grp.links[i],grp.links[ni]]=[grp.links[ni],grp.links[i]]; save(); renderSections(); renderSectionModal();
}

// ── Feed modal ──
function renderFeedModal() {
  const list = document.getElementById('feedItemList'); list.innerHTML='';
  if (!feeds.length) { setMsg(list, 'empty-state', t.noFeeds); return; }
  feeds.forEach((f,i) => {
    const card = document.createElement('div'); card.className='item-card';
    const info = document.createElement('div'); info.className='item-card-info';
    const nm = document.createElement('div'); nm.className='item-card-name'; nm.textContent=f.name;
    const sb = document.createElement('div'); sb.className='item-card-sub'; sb.textContent=f.url;
    info.appendChild(nm); info.appendChild(sb);
    const badge = document.createElement('span'); badge.className='badge'; badge.textContent=f.count+'i';
    const acts = document.createElement('div'); acts.className='item-card-actions';
    if (i>0)            acts.appendChild(makeBtn('btn btn-ghost btn-sm','↑',() => moveFeed(f.id,-1)));
    if (i<feeds.length-1) acts.appendChild(makeBtn('btn btn-ghost btn-sm','↓',() => moveFeed(f.id, 1)));
    acts.appendChild(makeBtn('btn btn-danger btn-sm','×',() => deleteFeed(f.id)));
    card.appendChild(info); card.appendChild(badge); card.appendChild(acts);
    list.appendChild(card);
  });
}
function addFeed() {
  const name  = document.getElementById('fName').value.trim();
  const url   = document.getElementById('fUrl').value.trim();
  const count = parseInt(document.getElementById('fCount').value)||8;
  if (!name||!url) { alert(t.alertAddFeed); return; }
  feeds.push({id:uid(),name,url,count}); saveFeeds();
  document.getElementById('fName').value=''; document.getElementById('fUrl').value=''; document.getElementById('fCount').value='8';
  renderFeedModal(); renderFeedTabs();
}
function deleteFeed(id) { feeds=feeds.filter(f=>f.id!==id); delete feedCache[id]; saveFeeds(); renderFeedModal(); renderFeedTabs(); }
function moveFeed(id, dir) {
  const i=feeds.findIndex(f=>f.id===id); const ni=i+dir;
  if (ni<0||ni>=feeds.length) return;
  [feeds[i],feeds[ni]]=[feeds[ni],feeds[i]]; saveFeeds(); renderFeedModal(); renderFeedTabs();
}
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
  if(src&&!src.startsWith('linear-gradient')) {
    img.onload=()=>img.classList.add('loaded');
    img.onerror=()=>{ img.classList.remove('loaded'); if(txt)txt.textContent=t.errorImageLoad; };
    img.src=src; if(inp&&inp.value!==src)inp.value=src;
    if(txt)txt.textContent=t.wallPreview;
  } else {
    img.src=''; img.classList.remove('loaded');
    if(inp)inp.value=''; if(txt)txt.textContent=t.wallEnterUrl;
  }
}
function removeWallpaper() { wallSettings={...DEFAULT_WALL}; applyWallSettings(wallSettings); saveWall(); updateWallPreview(null); renderGradientPresets(); }
function resetWallSettings() { const {src,type,grad}=wallSettings; wallSettings={...DEFAULT_WALL,src,type,grad}; applyWallSettings(wallSettings); saveWall(); }
function renderGradientPresets() {
  const wrap=document.getElementById('wallPresets'); if(!wrap)return; wrap.innerHTML='';
  const none=document.createElement('div'); none.className='wall-preset wall-preset-none'+(wallSettings.type==='none'?' active':''); none.textContent=t.noBackground;
  none.addEventListener('click',removeWallpaper); wrap.appendChild(none);
  GRADIENT_PRESETS.forEach(p => {
    const d=document.createElement('div'); d.className='wall-preset'+(wallSettings.grad===p.grad?' active':''); d.style.background=p.grad; d.title=p.label;
    d.addEventListener('click',()=>{ wallSettings.src=null; wallSettings.type='gradient'; wallSettings.grad=p.grad; applyWallSettings(wallSettings); saveWall(); updateWallPreview(null); renderGradientPresets(); });
    wrap.appendChild(d);
  });
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
  const list = document.getElementById('marketItemList'); list.innerHTML = '';
  if (!markets.length) { setMsg(list, 'empty-state', t.noAssets); return; }
  markets.forEach((m, i) => {
    const card = document.createElement('div'); card.className = 'item-card';
    const info = document.createElement('div'); info.className = 'item-card-info';
    const nm = document.createElement('div'); nm.className = 'item-card-name'; nm.textContent = m.symbol.toUpperCase() + ' · ' + m.name;
    const sb = document.createElement('div'); sb.className = 'item-card-sub';   sb.textContent = m.id;
    info.appendChild(nm); info.appendChild(sb);
    const acts = document.createElement('div'); acts.className = 'item-card-actions';
    if (i > 0)             acts.appendChild(makeBtn('btn btn-ghost btn-sm', '↑', () => moveMarket(m.id, -1)));
    if (i < markets.length-1) acts.appendChild(makeBtn('btn btn-ghost btn-sm', '↓', () => moveMarket(m.id,  1)));
    acts.appendChild(makeBtn('btn btn-danger btn-sm', '×', () => deleteMarket(m.id)));
    card.appendChild(info); card.appendChild(acts);
    list.appendChild(card);
  });
}

function addMarket() {
  const id     = document.getElementById('mCoinId').value.trim().toLowerCase();
  const symbol = document.getElementById('mSymbol').value.trim();
  const name   = document.getElementById('mName').value.trim();
  if (!id || !symbol) { alert(t.alertFillFields); return; }
  if (markets.find(m => m.id === id)) { alert(t.alertAssetExists); return; }
  markets.push({ id, symbol, name: name || symbol.toUpperCase() });
  document.getElementById('mCoinId').value = '';
  document.getElementById('mSymbol').value = '';
  document.getElementById('mName').value   = '';
  saveMarkets(); renderMarketModal(); loadMarkets();
}

function deleteMarket(id) {
  markets = markets.filter(m => m.id !== id);
  saveMarkets(); renderMarketModal(); loadMarkets();
}

function moveMarket(id, dir) {
  const i = markets.findIndex(m => m.id === id); const ni = i + dir;
  if (ni < 0 || ni >= markets.length) return;
  [markets[i], markets[ni]] = [markets[ni], markets[i]];
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
        panel.style.display = 'none';
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
  const list = document.getElementById('videoChannelList'); list.innerHTML='';
  if (!channels.length) { setMsg(list, 'empty-state', t.noChannels); return; }
  channels.forEach((ch, i) => {
    const card = document.createElement('div'); card.className='item-card';
    const info = document.createElement('div'); info.className='item-card-info';
    const nm = document.createElement('div'); nm.className='item-card-name'; nm.textContent=ch.name;
    const sb = document.createElement('div'); sb.className='item-card-sub'; sb.textContent='ID: '+ch.id+' · '+ch.count+' vídeos';
    info.appendChild(nm); info.appendChild(sb);
    const acts = document.createElement('div'); acts.className='item-card-actions';
    if (i>0)             acts.appendChild(makeBtn('btn btn-ghost btn-sm','↑',()=>moveChannel(ch.id,-1)));
    if (i<channels.length-1) acts.appendChild(makeBtn('btn btn-ghost btn-sm','↓',()=>moveChannel(ch.id, 1)));
    acts.appendChild(makeBtn('btn btn-danger btn-sm','×',()=>deleteChannel(ch.id)));
    card.appendChild(info); card.appendChild(acts);
    list.appendChild(card);
  });
}

function addChannel() {
  const id    = document.getElementById('vChannelId').value.trim();
  const name  = document.getElementById('vChannelName').value.trim() || 'Canal';
  const count = parseInt(document.getElementById('vCount').value) || 5;
  if (!id) { alert(t.alertFillChannel); return; }
  if (channels.find(c => c.id===id)) { alert(t.alertChannelExists); return; }
  channels.push({ id, name, count });
  document.getElementById('vChannelId').value='';
  document.getElementById('vChannelName').value='';
  document.getElementById('vCount').value='5';
  saveChannels(); renderVideoChannelModal();
  videoCache = {}; loadVideos();
}

function deleteChannel(id) {
  channels = channels.filter(c => c.id!==id); delete videoCache[id];
  saveChannels(); renderVideoChannelModal(); loadVideos();
}

function moveChannel(id, dir) {
  const i=channels.findIndex(c=>c.id===id); const ni=i+dir;
  if (ni<0||ni>=channels.length) return;
  [channels[i],channels[ni]]=[channels[ni],channels[i]];
  saveChannels(); renderVideoChannelModal(); videoCache={}; loadVideos();
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
      if (config.wall)     { wallSettings = { ...DEFAULT_WALL, ...config.wall }; await Store.set('gd_wall', wallSettings); applyWallSettings(wallSettings); }

      // Re-render everything
      renderSections();
      renderFeedTabs();
      renderCalendar();
      videoCache = {}; loadVideos();
      loadMarkets();

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
  { id:'obsidian',  name:'Obsidian',      desc_es:'Oscuro neutro · acento dorado',  desc_en:'Dark neutral · golden accent',   accent:'#c8b89a', bg:'#0a0a0c' },
  { id:'midnight',  name:'Midnight Blue', desc_es:'Azul profundo · acento celeste',  desc_en:'Deep blue · sky accent',         accent:'#7eb8e8', bg:'#050c16' },
  { id:'forest',    name:'Forest',        desc_es:'Verde oscuro · acento esmeralda', desc_en:'Dark green · emerald accent',    accent:'#6dbf8a', bg:'#08100c' },
  { id:'aurora',    name:'Aurora',        desc_es:'Violeta oscuro · acento lavanda', desc_en:'Dark violet · lavender accent',  accent:'#c48de0', bg:'#100812' },
  { id:'ember',     name:'Ember',         desc_es:'Marrón cálido · acento ámbar',   desc_en:'Warm brown · amber accent',      accent:'#e89a6a', bg:'#120a06' },
  { id:'arctic',    name:'Arctic',        desc_es:'Azul glacial · acento cian',      desc_en:'Glacial blue · cyan accent',     accent:'#6ab8c8', bg:'#060e12' },
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
    ds.textContent = currentLang === 'es' ? th.desc_es : th.desc_en;
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
    setSidebarSplit(false);
    return;
  }
  if (section) section.style.display = 'flex';
  setSidebarSplit(true);
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

    setSidebarSplit(true);
    renderUptimeGrid(pageData, beatData, grid);
  } catch (err) {
    grid.innerHTML = '';
    setGlobalDot('unknown');
    const lbl = document.getElementById('uptimeGlobalLabel');
    if (lbl) lbl.textContent = t.uptimeError;
    // Fail silently — hide section after 5s if persistent error
    setTimeout(() => {
      if (document.getElementById('uptimeGlobalLabel')?.textContent === t.uptimeError) {
        if (section) section.style.display = 'none';
        setSidebarSplit(false);
      }
    }, 5000);
  }
}

function setSidebarSplit(hasUptime) {
  const feeds  = document.querySelector('.sidebar-feeds');
  const uptime = document.querySelector('.sidebar-uptime');
  if (!feeds || !uptime) return;
  if (hasUptime) {
    feeds.style.flex  = '1';
    uptime.style.flex = '1';
  } else {
    feeds.style.flex  = '1';
    uptime.style.flex = '0';
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
    uptimeConfig = { url, slug };
    await Store.set('gd_uptime', uptimeConfig);
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
  renderUptimeModal();
  const result = document.getElementById('uptimeTestResult');
  if (result) { result.textContent = t.remove + ' ✓'; result.style.color = 'var(--text-muted)'; }
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
  updateEditIconPreview(lnk.icon || '');
  document.getElementById('addLinkForm').style.display  = 'none';
  document.getElementById('addGroupForm').style.display = 'none';
  document.getElementById('editLinkForm').style.display = 'flex';
  document.getElementById('elName').focus();
}

function closeEditLink() {
  editLinkTarget = null;
  document.getElementById('editLinkForm').style.display = 'none';
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
const APP_VERSION_FALLBACK = '1.8.4';

function getAppVersion() {
  try {
    const rt = (typeof browser!=='undefined' && browser.runtime) || (typeof chrome!=='undefined' && chrome.runtime);
    if (rt && rt.getManifest) return rt.getManifest().version;
  } catch(e) {}
  return APP_VERSION_FALLBACK;
}

function renderAbout() {
  const v = getAppVersion();
  const badge = document.getElementById('aboutVersion');
  if (badge) badge.textContent = 'v' + v;
  const row = document.getElementById('aboutVersionRow');
  if (row) row.textContent = v;
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
  if (e.key==='Escape') closeModal();
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
  document.getElementById('btnExport').addEventListener('click', exportConfig);
  document.getElementById('btnImport').addEventListener('click', () => document.getElementById('importFileInput').click());
  document.getElementById('importFileInput').addEventListener('change', e => { importConfig(e.target.files[0]); e.target.value=''; });
  document.querySelectorAll('.modal-tab').forEach(t=>t.addEventListener('click',()=>switchTab(t.dataset.tab)));
  // Links tab
  document.getElementById('btnAddSection').addEventListener('click', addSection);
  document.getElementById('btnAddGroup').addEventListener('click', addGroup);
  document.getElementById('btnCancelGroup').addEventListener('click', ()=>{ document.getElementById('addGroupForm').style.display='none'; pendingSection=null; });
  document.getElementById('btnAddLink').addEventListener('click', addLink);
  // Icon picker live preview
  document.getElementById('lName').addEventListener('input', () => { clearTimeout(_iconDebounce); _iconDebounce = setTimeout(suggestIcon, 350); });
  document.getElementById('lUrl').addEventListener('input',  () => { clearTimeout(_iconDebounce); _iconDebounce = setTimeout(suggestIcon, 350); });
  document.getElementById('lIcon').addEventListener('input', e => updateIconPreview(e.target.value.trim()));
  document.getElementById('btnCloseAddLink').addEventListener('click', ()=>{ document.getElementById('addLinkForm').style.display='none'; pendingGroup=null; });
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
  // Markets tab
  document.getElementById('btnManageUptime').addEventListener('click', () => openModal('uptime'));
  document.getElementById('btnRefreshUptime').addEventListener('click', () => loadUptime(true));
  document.getElementById('btnSaveUptime').addEventListener('click', saveUptimeConfig);
  document.getElementById('btnRemoveUptime').addEventListener('click', removeUptimeConfig);
  document.getElementById('btnManageMarkets').addEventListener('click', () => openModal('markets'));
  document.getElementById('btnRefreshMarkets').addEventListener('click', loadMarkets);
  document.getElementById('btnAddMarket').addEventListener('click', addMarket);
  document.getElementById('btnMarketPresets').addEventListener('click', toggleMarketPresets);
  // Wall tab
  document.getElementById('wallUrlInput').addEventListener('input', e=>onWallUrlInput(e.target.value));
  document.getElementById('btnApplyWallUrl').addEventListener('click', ()=>applyWallUrl());
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
  const wallMeta = await Store.get('gd_wall', DEFAULT_WALL);
  wallSettings = { ...DEFAULT_WALL, ...wallMeta };
  applyWallSettings(wallSettings);

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
  channels = await Store.get('gd_channels', DEFAULT_CHANNELS);
  renderAbout();
  renderCalendar();
  renderSections();
  renderFeedTabs();
  loadVideos();
  loadUptime();
  loadMarkets();
  loadWeather();

  const badge=document.getElementById('syncBadge');
  // Auto-refresh uptime every 60s
  setInterval(() => loadUptime(), 60000);
  if (badge) {
    if (USE_SYNC) { badge.textContent=t.syncActiveMsg; badge.style.color='var(--green)'; badge.style.opacity='1'; setTimeout(()=>badge.style.opacity='0',3500); }
    else { badge.textContent=t.syncLocalMsg; badge.style.color='var(--text-muted)'; badge.style.opacity='1'; }
  }
}
init();
