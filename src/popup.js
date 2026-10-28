const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);
const DEFAULTS = {
  keywords: [], highlight: true, confirmEach: false,
  showBlock: true, showMute: true, showReport: true, showAll: true,
  hourlyLimit: 40, showReply: true, replies: []
};
const ICONS = { block: '⛔', mute: '🔇', report: '🚩', reply: '💬' };
const TOGGLES = ['highlight', 'confirmEach', 'showReply', 'showAll', 'showBlock', 'showMute', 'showReport'];

async function init() {
  const s = await api.storage.sync.get(DEFAULTS);
  $('keywords').value = s.keywords.join('\n');
  for (const k of TOGGLES) $(k).checked = s[k];
  $('hourlyLimit').value = s.hourlyLimit;
  $('replies').value = (s.replies || []).join('\n');
  renderHistory();
}

async function renderHistory() {
  const { history = [] } = await api.storage.local.get({ history: [] });
  $('count').textContent = history.length;
  const ul = $('history');
  ul.textContent = '';
  for (const h of history.slice(0, 100)) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `https://www.threads.com/@${h.u}`;
    a.target = '_blank';
    a.textContent = `${ICONS[h.action || 'block']} @${h.u}`;
    const meta = document.createElement('span');
    meta.textContent = new Date(h.at).toLocaleDateString('fr-FR') + (h.kw ? ` · ${h.kw}` : '');
    if (h.action === 'reply' && h.text) meta.title = h.text;
    li.append(a, meta);
    ul.appendChild(li);
  }
}

$('save').addEventListener('click', async () => {
  const keywords = [...new Set(
    $('keywords').value.split('\n').map((k) => k.trim()).filter(Boolean)
  )];
  const data = { keywords };
  for (const k of TOGGLES) data[k] = $(k).checked;
  data.replies = $('replies').value.split('\n').map((t) => t.trim()).filter(Boolean);
  data.hourlyLimit = Math.max(0, parseInt($('hourlyLimit').value, 10) || 0);
  await api.storage.sync.set(data);
  $('keywords').value = keywords.join('\n');
  $('saved').style.opacity = 1;
  setTimeout(() => ($('saved').style.opacity = 0), 1500);
});

$('clear').addEventListener('click', async () => {
  if (!confirm("Vider l'historique local ? (Rien ne change sur Threads.)")) return;
  await api.storage.local.set({ history: [] });
  renderHistory();
});

$('export').addEventListener('click', async () => {
  const { history = [] } = await api.storage.local.get({ history: [] });
  const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `threads-blocages-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
});

// ---------- Blocage d'une liste : le popup l'enregistre, l'onglet Threads la traite ----------

function parseHandles(text) {
  const handles = new Set();
  const bad = [];
  for (const raw of text.split(/[\s,;]+/).filter(Boolean)) {
    const u = (raw.match(/threads\.(?:net|com)\/@([\w.]+)/i)?.[1] ?? raw.replace(/^@/, '')).toLowerCase();
    if (/^[\w.]{1,30}$/.test(u)) handles.add(u); else bad.push(raw);
  }
  return { handles: [...handles], bad };
}

async function renderBulk() {
  const { bulk } = await api.storage.local.get({ bulk: null });
  if (!bulk) { $('bulkStatus').textContent = ''; return; }
  const state = bulk.running ? (bulk.list.length ? 'en cours' : 'terminé') : 'à l’arrêt';
  $('bulkStatus').textContent = `${state} · ${bulk.list.length} à traiter · ${bulk.blocked} bloqués` +
    (bulk.failed.length ? ` · échecs : ${bulk.failed.map((u) => '@' + u).join(', ')}` : '') +
    (bulk.note ? ` · ${bulk.note}` : '');
}

$('bulkStart').addEventListener('click', async () => {
  const { handles, bad } = parseHandles($('bulkList').value);
  if (!handles.length) { $('bulkStatus').textContent = 'Aucun compte valide dans la liste.'; return; }
  const warn = bad.length ? `\n(${bad.length} entrées ignorées, ex. « ${bad[0]} »)` : '';
  if (!confirm(`Bloquer ${handles.length} comptes sur Threads ?${warn}\n\nGarde un onglet Threads ouvert et visible pendant le traitement.`)) return;
  await api.storage.local.set({ bulk: { list: handles, running: true, blocked: 0, failed: [], note: '' } });
});

$('bulkStop').addEventListener('click', async () => {
  const { bulk } = await api.storage.local.get({ bulk: null });
  if (bulk) await api.storage.local.set({ bulk: { ...bulk, running: false, note: 'arrêté' } });
});

api.storage.onChanged.addListener((changes) => {
  if (changes.bulk) renderBulk();
  if (changes.history) renderHistory();
});

init();
renderBulk();
