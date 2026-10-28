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

init();
