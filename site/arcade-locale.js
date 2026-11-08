import { LANGUAGES, MESSAGES } from './arcade-locales.js';

const STORAGE_KEY = 'pd.ui.language';
const RTL = new Set(['ar', 'ur']);
const GENRES = ['arcade', 'driving', 'sport', 'action', 'shooter', 'adventure', 'puzzle', 'strategy', 'horror', 'multiplayer'];
const WORLDS = [...GENRES, 'new', 'popular', 'friends'];
const TITLES = new Map(WORLDS.map(key => [MESSAGES.en[key], key]));
const FORMATS = new Map(LANGUAGES.map(([code]) => [code, new Intl.NumberFormat(code)]));
const SINGLE = {
  en: { gameCount: '{count} game', resultCount: '{count} result for “{query}”' },
  es: { gameCount: '{count} juego', resultCount: '{count} resultado para «{query}»' },
  pt: { gameCount: '{count} jogo', resultCount: '{count} resultado para «{query}»' },
};

function readLocale() {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (Object.hasOwn(MESSAGES, saved)) return saved;
  } catch { /* storage can be blocked */ }
  return 'en';
}

function saveLocale(code) {
  try { globalThis.localStorage?.setItem(STORAGE_KEY, code); } catch { /* still works on this page */ }
}

function initialLocale() {
  const requested = new URLSearchParams(globalThis.location?.search).get('lang');
  if (!Object.hasOwn(MESSAGES, requested)) return readLocale();
  saveLocale(requested);
  return requested;
}

let locale = initialLocale();
export const getLocale = () => locale;

export function translate(key, values = {}, code = locale) {
  if (!Object.hasOwn(MESSAGES, code)) code = 'en';
  const template = (values.count === 1 && SINGLE[code]?.[key]) || MESSAGES[code][key] || MESSAGES.en[key] || key;
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    if (!Object.hasOwn(values, name)) return match;
    if (name === 'count' && typeof values.count === 'number') return FORMATS.get(code).format(values.count);
    return String(values[name]);
  });
}

const normalizeSearch = value => value.toLowerCase().normalize('NFKD')
  .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
  .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim();

export function localizedGameQuery(query, code = locale) {
  if (code === 'en' || !Object.hasOwn(MESSAGES, code)) return query;
  const aliases = new Map(GENRES.map(key => [normalizeSearch(MESSAGES[code][key]), key]));
  aliases.set(normalizeSearch(MESSAGES[code].pixel), 'pixel art');
  if (code === 'th') aliases.set('เกมแข่งรถ', 'driving');
  const normalized = normalizeSearch(query);
  const terms = [...aliases.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp('(?<![\\p{L}\\p{N}\\p{M}])(?:' + terms.join('|') + ')(?![\\p{L}\\p{N}\\p{M}])', 'gu');
  const translated = normalized.replace(pattern, term => aliases.get(term));
  return translated === normalized ? query : translated;
}

const LABELS = [
  ['.arcade-nav a[href="/browse/"], .feed-heading h1', 'browse'],
  ['.arcade-nav a[href="/category/"], body[data-arcade-page="categories"] .browse-heading h1', 'categories'],
  ['.arcade-nav a[href="/me/"]', 'profile'],
  ['.arcade-nav a[href="/settings/"]', 'settings'],
  ['.feed-heading h1 + p', 'feedIntro'],
  ['#searchForm label', 'searchGames'], ['#searchForm button[type="submit"]', 'search'],
  ['#clearSearch', 'clear'], ['#searchEmpty', 'searchEmpty'],
  ['body[data-arcade-page="categories"] .browse-heading h1 + p', 'categoryIntro'],
  ['body[data-arcade-page="categories"] .browse-heading .backlink', 'allGames', 'after'],
  ['.world-hero .backlink', 'allCategories', 'before'],
  ['#start', 'play'], ['#goonline', 'playOnline'], ['#full', 'fullscreen'], ['#reload', 'restart'],
  ['.stagebar .lnk[href="/browse/"]', 'allGames'],
  ['.play .about h4:has(+ #keys)', 'controls'], ['.play .about h4:has(+ #tags)', 'tags'],
  ['.play .side .panel h4', 'moreGames'],
  ['.monitor-chin small, #arcadeBoot .boot-label', 'homeArcade'],
  ['.profile-tabs a[href="#recent"], #me #recent h2', 'returnRecent'],
  ['.profile-tabs a[href="#favorites"], #me #favorites h2', 'favorites'],
  ['.profile-tabs a[href="#quest"], #me #quest h2', 'dailyQuest'],
  ['.profile-tabs a[href="#badges"], #me #badges h2', 'badges'],
  ['#me > .eyebrow', 'saveScreen'],
  ['body[data-arcade-page="settings"] .arcade-main > h1', 'settingsInfo'],
  ['body[data-arcade-page="settings"] .arcade-main > h1 + p', 'settingsIntro'],
  ['body[data-arcade-page="settings"] .arcade-main > h2', 'moreInfo'],
  ['body[data-arcade-page="settings"] .arcade-main > .backlink', 'backHome', 'before'],
  ['.display-options h2', 'displayOptions'],
  ['.display-options label:has(#reduceMotion)', 'reduceMotion'],
  ['.display-options .pp-fine', 'deviceMotion'],
  ['.arcade-info-back', 'settingsInfo', 'before'],
  ['.skip[href="#main"]', 'skipContent'], ['.skip[href="#stage"]', 'skipGame'],
];

const PAGE_KEYS = [
  ['/settings/', 'settingsInfo'], ['/site/about.html', 'about'], ['/site/updates.html', 'updates'],
  ['/devlog/', 'devLog'], ['/articles/', 'myPicks'], ['/site/contact.html', 'contact'],
  ['/site/settings.html', 'privacySaves'], ['/site/privacy.html', 'privacy'],
  ['/site/terms.html', 'terms'], ['/site/credits.html', 'credits'], ['/site/parents.html', 'parents'],
  ['/site/cookies.html', 'cookies'], ['/site/accessibility.html', 'accessibility'], ['/site/advertise.html', 'advertise'],
];

const originalText = new WeakMap();
const countValues = new WeakMap();
const labelKeys = new WeakMap();

function setText(el, text, restoreEnglish = true) {
  if (!el) return;
  const node = Array.from(el.childNodes).find(child => child.nodeType === 3 && child.data.trim());
  if (!node) return;
  if (!originalText.has(node)) originalText.set(node, node.data);
  const before = originalText.get(node);
  const value = locale === 'en' && restoreEnglish ? before : before.match(/^\s*/)[0] + text + before.match(/\s*$/)[0];
  if (node.data !== value) node.data = value;
}

function setLabel(el, key, arrow) {
  const backward = RTL.has(locale) ? '→' : '←';
  const forward = RTL.has(locale) ? '←' : '→';
  let text = translate(key);
  if (arrow === 'before') text = backward + ' ' + text;
  if (arrow === 'after') text += ' ' + forward;
  setText(el, text);
}

function translatePage() {
  const doc = document;
  for (const [selector, key, arrow] of LABELS) {
    for (const el of doc.querySelectorAll(selector)) setLabel(el, key, arrow);
  }
  for (const [href, key] of PAGE_KEYS) {
    const links = doc.querySelectorAll('.arcade-footer nav a[href="' + href + '"], .settings-secondary a[href="' + href + '"]');
    for (const link of links) setLabel(link, key);
    const card = doc.querySelector('.settings-card[href="' + href + '"]');
    if (card) {
      setLabel(card.querySelector('strong'), key, 'after');
      setLabel(card.querySelector('p'), key + 'Desc');
    }
  }
  for (const el of doc.querySelectorAll('.world-name, .world-hero h1, .feed-card .cmeta > span:first-child, .cartridge-top > span:first-child')) {
    const key = labelKeys.get(el) || TITLES.get(el.textContent.trim());
    if (key) { labelKeys.set(el, key); setLabel(el, key); }
  }
  for (const el of doc.querySelectorAll('.world-count')) {
    const count = countValues.get(el) ?? Number(el.textContent.match(/^\d+/)?.[0]);
    if (Number.isFinite(count)) { countValues.set(el, count); setText(el, translate('gameCount', { count })); }
  }
  for (const el of doc.querySelectorAll('.feed-play')) setText(el, '▶ ' + translate('play'));
  for (const el of doc.querySelectorAll('[data-i18n]')) setText(el, translate(el.dataset.i18n), false);
  const input = doc.getElementById('q');
  if (input) { input.placeholder = translate('searchHint'); input.dir = 'auto'; }
  const count = doc.getElementById('gameCount');
  const raw = count?.textContent.match(/^(\d+) games?$/);
  if (raw && locale !== 'en') setText(count, translate('gameCount', { count: Number(raw[1]) }), false);

  // Original game names, guides and shortcut text still use their own language.
  for (const el of doc.querySelectorAll('.cname, #ttl, #barttl, #h1, #lede, #blurb, #about, .guide, .keys, .prose, .card-hook, .world-hook, .world-catch, .world-hero p, .pp-dtitle, .return-copy b')) {
    if (!el.hasAttribute('lang')) { el.lang = 'en'; el.dir = 'ltr'; }
  }
}

function mount() {
  const slot = document.getElementById('localeSlot');
  if (!slot || slot.querySelector('select')) return;
  const label = document.createElement('label');
  label.className = 'arcade-language';
  const icon = document.createElement('span');
  icon.textContent = '🌐';
  icon.setAttribute('aria-hidden', 'true');
  const select = document.createElement('select');
  select.id = 'arcadeLanguage';
  for (const [code, autonym] of LANGUAGES) {
    const option = new Option(autonym, code);
    option.lang = code;
    option.dir = RTL.has(code) ? 'rtl' : 'ltr';
    select.add(option);
  }
  label.append(icon, select);
  slot.append(label);
  const footer = document.querySelector('.arcade-footer');
  const note = document.createElement('small');
  note.className = 'arcade-language-note';
  footer?.append(note);

  function applyLocale() {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = RTL.has(locale) ? 'rtl' : 'ltr';
    root.dataset.ppLocale = locale;
    select.value = locale;
    select.setAttribute('aria-label', translate('language'));
    note.hidden = locale === 'en';
    note.textContent = translate('englishContent');
    translatePage();
    dispatchEvent(new CustomEvent('pp-locale', { detail: { locale } }));
  }

  select.addEventListener('change', () => {
    locale = select.value;
    saveLocale(locale);
    applyLocale();
  });
  addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    locale = readLocale();
    applyLocale();
  });
  applyLocale();

  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; translatePage(); });
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-i18n'] });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
}
