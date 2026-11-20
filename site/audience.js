// Optional first-party repeat-visit measurement. Never reads saves or profiles.
const CHOICE = 'pp.analytics.choice';
const VISITOR = 'pp.analytics.visitor';
const LIFETIME = 90 * 24 * 60 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const privacyBlocked = () => Boolean(navigator.globalPrivacyControl || navigator.doNotTrack === '1');
export const isAudienceStorageKey = key => key === null || key === CHOICE || key === VISITOR;

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function removeVisitor() {
  try { localStorage.removeItem(VISITOR); } catch {}
}
export function analyticsChoice() {
  if (privacyBlocked()) { removeVisitor(); return false; }
  const saved = read(CHOICE);
  const age = Date.now() - saved?.at;
  if (typeof saved?.allowed === 'boolean' && age >= 0 && age < LIFETIME) return saved.allowed;
  removeVisitor();
  return null;
}

function savedVisitor() {
  const saved = read(VISITOR);
  const remaining = saved?.expires - Date.now();
  return UUID.test(saved?.id || '') && remaining > 0 && remaining <= LIFETIME ? saved : null;
}

export function visitorCode() {
  if (analyticsChoice() !== true || !globalThis.crypto?.randomUUID) { removeVisitor(); return null; }
  const existing = savedVisitor();
  if (existing) return existing.id;
  const consent = read(CHOICE);
  const expires = Math.min(Date.now() + LIFETIME, consent.at + LIFETIME);
  const saved = { id: crypto.randomUUID(), expires };
  try { localStorage.setItem(VISITOR, JSON.stringify(saved)); } catch { return null; }
  return saved.id;
}

export function setAnalyticsChoice(allowed) {
  const next = allowed === true && !privacyBlocked();
  const current = analyticsChoice();
  // Repeating Allow must not split a browser's history or renew its expiry.
  if (next === current && (!next || savedVisitor())) return;
  window.dispatchEvent(new Event('pp-analytics-choice-changing'));
  removeVisitor();
  try { localStorage.setItem(CHOICE, JSON.stringify({ allowed: next, at: Date.now() })); } catch {}
  window.dispatchEvent(new Event('pp-analytics-choice-changed'));
}

export function showAnalyticsChoice() {
  if (!document.body || document.getElementById('pp-analytics-choice')) return;
  const settings = ['/settings/', '/settings', '/site/settings.html'].includes(location.pathname);
  const choice = analyticsChoice();
  if (privacyBlocked() || (choice !== null && !settings)) return;
  const panel = document.createElement('section');
  panel.id = 'pp-analytics-choice';
  panel.setAttribute('aria-label', 'Repeat-visit analytics choice');
  const layout = settings ? 'position:relative;margin:24px auto;' : 'position:fixed;bottom:12px;left:12px;right:12px;margin:auto;';
  panel.style.cssText = layout + 'box-sizing:border-box;max-width:640px;z-index:10000;background:#152b2c;color:#fff;border:2px solid #dfbe75;border-radius:12px;padding:14px;box-shadow:0 8px 32px #0005;font:16px/1.4 system-ui';
  panel.innerHTML = '<strong>Help improve PlayPile?</strong><p style="margin:8px 0">Allow a random browser code to measure return visits and time spent across visits? No names or game saves. The code expires after 90 days. Games work either way.</p><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button type="button" data-choice="no">No thanks</button><button type="button" data-choice="yes">Allow</button><a href="/site/privacy.html#analytics" style="color:#f5d99b">Privacy details</a></div><small style="display:block;margin-top:8px;font-size:14px">Change your choice in Settings &amp; info.</small>';
  const updateStatus = () => {
    const selected = analyticsChoice();
    panel.querySelector('strong').textContent = selected === true ? 'Repeat-visit analytics is on' : selected === false ? 'Repeat-visit analytics is off' : 'Help improve PlayPile?';
    const decline = panel.querySelector('[data-choice="no"]');
    decline.textContent = settings ? 'Turn off' : 'No thanks';
    panel.querySelector('[data-choice="yes"]').textContent = settings ? 'Allow' : 'Allow';
  };
  for (const button of panel.querySelectorAll('button')) {
    button.style.cssText = 'min-height:44px;padding:8px 16px;border:1px solid #dfbe75;border-radius:6px;background:#fff;color:#152b2c;font:inherit;cursor:pointer';
    button.addEventListener('click', () => {
      setAnalyticsChoice(button.dataset.choice === 'yes');
      if (settings) updateStatus();
      else panel.remove();
    });
  }
  if (settings) updateStatus();
  const host = settings ? document.querySelector('main') || document.body : document.body;
  host.appendChild(panel);
}
