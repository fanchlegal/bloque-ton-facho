(() => {
  'use strict';

  // Chrome expose l'API « chrome », Firefox « browser » (les deux renvoient des promesses en MV3)
  const api = globalThis.browser ?? globalThis.chrome;

  // Libellés normalisés (minuscules, sans accents), selon la langue de l'interface Threads
  const MORE_LABELS = [
    'plus', "plus d'options", 'plus d’options', 'autres options',
    'more', 'more options', 'mas', 'mas opciones', 'mehr', 'altro', 'meer'
  ];

  const ACTIONS = {
    block: {
      icon: '⛔', verb: 'Bloquer', done: 'bloqué',
      menu: ['bloquer', 'block', 'bloquear', 'blockieren', 'blocca', 'blokkeren'],
      confirm: 'required'
    },
    mute: {
      icon: '🔇', verb: 'Mettre en sourdine', done: 'mis en sourdine',
      menu: ['mettre en sourdine', 'sourdine', 'mute', 'silenciar', 'stummschalten', 'silenzia', 'dempen'],
      confirm: 'optional'
    },
    report: {
      icon: '🚩', verb: 'Signaler comme faux compte', done: 'signalé',
      menu: ['signaler', 'report', 'denunciar', 'melden', 'segnala', 'rapporteren'],
      flow: 'report'
    },
    all: {
      icon: '⚡', verb: 'Signaler, mettre en sourdine et bloquer', done: 'traité'
    },
    reply: {
      icon: '💬', verb: 'Répondre (phrase aléatoire)', done: 'a reçu ta réponse'
    }
  };
  const REPLY_LABELS = ['repondre', 'reply', 'responder', 'antworten', 'rispondi'];
  const SEND_LABELS = ['publier', 'repondre', 'post', 'reply', 'publicar', 'posten', 'pubblica'];
  // Ordre de la chaîne : signaler d'abord (le menu « … » disparaît une fois bloqué)
  const CHAIN = ['report', 'mute', 'block'];

  // Parcours de signalement : motif visé, catégorie parente éventuelle, boutons de validation
  // (Threads FR, oct. 2026 : catégorie « Bot ou faux compte » au premier écran d'un post ;
  // depuis un profil : « Signaler le compte » → « Publication de contenu qui ne devrait pas… »
  // → « C'est un bot ou un faux compte »). Pas d'« usurpation » : ce parcours demande qui est imité.
  const FAKE_PATTERNS = [
    'bot ou faux compte', 'faux compte', 'faux profil', 'compte frauduleux',
    'bot', 'automatis', 'automated', 'bot or fake',
    'fake account', 'fake profile',
    'cuenta falsa', 'perfil falso', 'fake-konto', 'gefalschtes', 'account falso'
  ];
  const PARENT_PATTERNS = [
    'signaler le compte', 'report account', 'qui ne devrait pas', 'shouldn',
    'arnaque', 'fraude', 'spam', 'scam', 'fraud', 'estafa', 'betrug', 'truffa'
  ];
  const SUBMIT_WORDS = ['envoyer', 'envoyer le signalement', 'signaler', 'submit', 'submit report', 'report', 'enviar', 'senden', 'invia'];
  const NEXT_WORDS = ['suivant', 'continuer', 'next', 'continue', 'siguiente', 'weiter', 'avanti'];
  const THANKS_PATTERNS = ['merci', 'thanks', 'thank you', 'gracias', 'danke', 'grazie'];
  const CLOSE_WORDS = ['fermer', 'terminer', 'termine', 'ok', 'close', 'done', 'cerrar', 'schliessen', 'chiudi'];

  const MIN_DELAY_MS = 3000;

  const DEFAULTS = {
    keywords: [], highlight: true, confirmEach: false,
    showBlock: true, showMute: true, showReport: true, showAll: true,
    hourlyLimit: 40, // 0 = pas de plafond
    showReply: true,
    replies: []
  };
  let settings = { ...DEFAULTS };
  let matchers = [];
  const done = { block: new Set(), mute: new Set(), report: new Set() };
  const repliedPosts = new Set(); // identifiants de posts déjà répondus via l'extension
  let lastReply = null;
  const recent = [];
  const queue = [];
  let running = false;
  let lastActionAt = 0;

  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exact = (words) => (t) => words.includes(t);
  const contains = (pats) => (t) => pats.some((p) => t.includes(p));
  const enabledActions = () => ['reply', 'all', 'block', 'mute', 'report'].filter(
    (k) => settings[`show${k[0].toUpperCase()}${k.slice(1)}`]
  );

  // ---------- Réglages ----------

  function compile() {
    matchers = (settings.keywords || [])
      .map((k) => k.trim())
      .filter(Boolean)
      .map((raw) => {
        const k = norm(raw);
        if (/^[\p{L}\p{N}_ '-]+$/u.test(k)) {
          return { raw, re: new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRe(k)}(?=$|[^\\p{L}\\p{N}_])`, 'u') };
        }
        return { raw, sub: k };
      });
  }

  function matchText(text) {
    const t = norm(text);
    for (const m of matchers) {
      if (m.re ? m.re.test(t) : t.includes(m.sub)) return m.raw;
    }
    return null;
  }

  async function load() {
    settings = await api.storage.sync.get(DEFAULTS);
    const { history = [] } = await api.storage.local.get({ history: [] });
    for (const k of Object.keys(done)) done[k].clear();
    repliedPosts.clear();
    for (const h of history) {
      if (h.action === 'reply') { if (h.post) repliedPosts.add(h.post); continue; }
      done[h.action || 'block']?.add(h.u);
    }
    compile();
  }

  api.storage.onChanged.addListener(async () => { await load(); scan(true); });

  // ---------- Utilitaires DOM ----------

  function usernameFromPost(post) {
    for (const a of post.querySelectorAll('a[href*="/@"]')) {
      const m = (a.getAttribute('href') || '').match(/\/@([\w.]+)/);
      if (m) return m[1];
    }
    return null;
  }

  // Threads met le nom de l'icône soit en aria-label, soit dans un <title> interne au SVG
  const svgLabel = (svg) => norm(svg.getAttribute('aria-label') || svg.querySelector('title')?.textContent || '');

  function findMoreButton(root) {
    if (!root) return null;
    for (const svg of root.querySelectorAll('svg')) {
      if (!MORE_LABELS.includes(svgLabel(svg))) continue;
      return svg.closest('[role="button"], button') || svg.parentElement;
    }
    return null;
  }

  // Boutons « … » proches du pseudo affiché sur la page (hors posts, hors barre latérale),
  // le plus probable d'abord. Évite de viser ta propre colonne profil.
  function profileMoreCandidates(u) {
    const out = [];
    const nu = norm(u);
    for (const svg of document.querySelectorAll('svg')) {
      if (!MORE_LABELS.includes(svgLabel(svg))) continue;
      if (svg.closest('[data-pressable-container], nav, [role="navigation"], .tqb-ui')) continue;
      const b = svg.closest('[role="button"], button');
      if (!b) continue;
      const r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue; // élément masqué ou en cours de démontage
      let x = b;
      let near = false;
      for (let i = 0; i < 10 && x; i++) {
        x = x.parentElement;
        if (x && norm(x.textContent).includes(nu)) { near = true; break; }
      }
      if (near) out.push(b);
    }
    const score = (b) => (b.getAttribute('aria-haspopup') === 'dialog' ? 10000 : 0) + b.getBoundingClientRect().top;
    return out.sort((a, b) => score(b) - score(a));
  }

  const isOnProfile = (u) => new RegExp(`^/@${escapeRe(u)}/?$`, 'i').test(location.pathname);

  // « Bloquer » n'est proposé que sur la page de profil : on y va par l'historique
  // (le routeur de Threads ignore les clics simulés sur les liens), puis on revient.
  async function gotoProfile(u) {
    if (isOnProfile(u)) return false;
    // Boutons déjà présents (fil, ta colonne profil) : on attend qu'un nouveau « … » apparaisse
    const before = new Set(document.querySelectorAll('[role="button"], button'));
    // Firefox isole les objets du script : on crée l'état côté page avec cloneInto
    const state = typeof cloneInto === 'function' ? cloneInto({}, window) : {};
    history.pushState(state, '', `/@${u}`);
    window.dispatchEvent(new PopStateEvent('popstate', { state }));
    const fresh = () => profileMoreCandidates(u).filter((b) => !before.has(b));
    let ok = await waitFor(
      () => isOnProfile(u) && fresh().some((b) => b.getAttribute('aria-haspopup') === 'dialog'), 8000
    );
    if (!ok) ok = isOnProfile(u) && fresh().length > 0;
    if (!ok) {
      if (isOnProfile(u)) await goBack(u);
      throw new Error('profil non chargé');
    }
    await sleep(600);
    return true;
  }

  async function goBack(u) {
    history.back();
    await waitFor(() => !isOnProfile(u), 5000);
    await sleep(400);
  }

  // Essaie les « … » candidats du profil jusqu'à trouver celui dont le menu propose l'action
  async function performOnProfile(key, u) {
    const cands = profileMoreCandidates(u);
    if (!cands.length) throw new Error('bouton « … » du profil introuvable');
    let lastErr;
    for (const b of cands) {
      try {
        return await performMenuAction(key, () => b);
      } catch (e) {
        lastErr = e;
        if (!/absente du menu/.test(e.message)) throw e;
        await sleep(400);
      }
    }
    throw lastErr;
  }

  function findPostByUser(u) {
    for (const p of document.querySelectorAll('[data-pressable-container]')) {
      if (usernameFromPost(p) === u && findMoreButton(p)) return p;
    }
    return null;
  }

  function realClick(el) {
    const opts = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.click();
  }

  function pressEscape() {
    const target = document.activeElement || document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  }

  const CLICKABLE = '[role="button"], [role="menuitem"], [role="radio"], [role="option"], [role="link"], button, label';

  // Cherche le dernier élément (texte "feuille") correspondant dans les menus / dialogues
  function findClickable(test, { exclude = null, dialogOnly = false, requireRole = false } = {}) {
    let last = null;
    for (const el of document.querySelectorAll('span, div')) {
      if (el.childElementCount > 0) continue;
      const t = norm(el.textContent.trim());
      if (!t || t.length > 80 || !test(t)) continue;
      if (el.closest('[data-pressable-container], .tqb-ui')) continue;
      if (dialogOnly && !el.closest('[role="dialog"]')) continue;
      const roleEl = el.closest(CLICKABLE);
      if (requireRole && !roleEl) continue;
      const target = roleEl || el;
      if (exclude && exclude.has(target)) continue;
      last = target;
    }
    return last;
  }

  async function waitFor(fn, timeout = 4000, step = 120) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(step);
    }
    return null;
  }

  // ---------- Séquences d'action ----------

  // Action depuis le menu « … » du post ; si l'option n'y est pas (ex. « Bloquer » absent
  // pour un compte suivi) ou si le post a disparu, on passe par la page de profil.
  async function performAction(key, getMore, username) {
    if (isOnProfile(username)) return performOnProfile(key, username);
    try {
      return await performMenuAction(key, getMore);
    } catch (e) {
      if (key === 'report' || !/absente du menu|« … » introuvable/.test(e.message)) throw e;
    }
    const navigated = await gotoProfile(username);
    try {
      return await performOnProfile(key, username);
    } finally {
      if (navigated) await goBack(username);
    }
  }

  async function performMenuAction(key, getMore) {
    const a = ACTIONS[key];
    const more = getMore();
    if (!more) throw new Error('bouton « … » introuvable');
    realClick(more);

    const item = await waitFor(() => findClickable(exact(a.menu)));
    if (!item) {
      pressEscape();
      await sleep(250);
      if (document.querySelector('[role="menu"]')) realClick(more);
      await sleep(250);
      throw new Error(`option « ${a.verb} » absente du menu`);
    }
    realClick(item);

    if (a.flow === 'report') return reportFlow();

    const required = a.confirm === 'required';
    const confirmBtn = await waitFor(
      () => findClickable(exact(a.menu), { exclude: new Set([item]), dialogOnly: true }),
      required ? 4000 : 2000
    );
    if (!confirmBtn) {
      if (required) { pressEscape(); throw new Error('bouton de confirmation introuvable'); }
      return 'ok'; // action appliquée sans confirmation
    }
    realClick(confirmBtn);
    await waitFor(() => !confirmBtn.isConnected, 4000);
    return 'ok';
  }

  async function closeThanks() {
    const btn = await waitFor(
      () => findClickable(exact(CLOSE_WORDS), { dialogOnly: true, requireRole: true }), 2000
    );
    if (btn) realClick(btn); else pressEscape();
  }

  // Parcourt les écrans de signalement : catégorie → "faux compte" → envoi.
  // Si un écran ne correspond à rien de connu, on s'arrête et on laisse la main.
  async function reportFlow() {
    const clicked = new Set();
    let reasonPicked = false;
    const opts = () => ({ exclude: clicked, dialogOnly: true, requireRole: true });

    for (let step = 0; step < 7; step++) {
      const pick = await waitFor(() => {
        if (reasonPicked && findClickable(contains(THANKS_PATTERNS), { dialogOnly: true })) {
          return { kind: 'thanks' };
        }
        const fake = findClickable(contains(FAKE_PATTERNS), opts());
        if (fake) return { el: fake, kind: 'reason' };
        if (reasonPicked) {
          const submit = findClickable(exact(SUBMIT_WORDS), opts());
          if (submit) return { el: submit, kind: 'submit' };
          const next = findClickable(exact(NEXT_WORDS), opts());
          if (next) return { el: next, kind: 'next' };
        } else {
          const parent = findClickable(contains(PARENT_PATTERNS), opts());
          if (parent) return { el: parent, kind: 'parent' };
        }
        return null;
      }, 3500);

      if (!pick) break;
      if (pick.kind === 'thanks') { await closeThanks(); return 'ok'; }

      clicked.add(pick.el);
      realClick(pick.el);
      if (pick.kind === 'reason') reasonPicked = true;
      if (pick.kind === 'submit') {
        await sleep(1200);
        if (findClickable(contains(THANKS_PATTERNS), { dialogOnly: true })) await closeThanks();
        return 'ok';
      }
      await sleep(600);
    }

    // Certains parcours envoient dès le choix du motif, sans écran de remerciement détectable
    if (reasonPicked && !document.querySelector('[role="dialog"]')) return 'ok';
    return 'manual';
  }

  // ---------- Réponse avec phrase aléatoire ----------

  function postIdOf(post) {
    for (const a of post.querySelectorAll('a[href*="/post/"]')) {
      const m = (a.getAttribute('href') || '').match(/\/post\/([\w-]+)/);
      if (m) return m[1];
    }
    return null;
  }

  function pickPhrase() {
    const phrases = (settings.replies || []).map((t) => t.trim()).filter(Boolean);
    if (!phrases.length) return null;
    let text = phrases[Math.floor(Math.random() * phrases.length)];
    for (let i = 0; phrases.length > 1 && text === lastReply && i < 10; i++) {
      text = phrases[Math.floor(Math.random() * phrases.length)];
    }
    return text;
  }

  const btnLabels = (b) => [norm(b.innerText.trim()), ...[...b.querySelectorAll('svg')].map(svgLabel)];

  // Bouton d'envoi : flèche qui apparaît à droite du champ une fois du texte saisi,
  // ou « Publier » dans une fenêtre. On ne cherche que sur la ligne du champ.
  function findSendButton(editor, beforeBtns) {
    const ok = (b) => !b.closest('.tqb-ui') && b.getAttribute('aria-disabled') !== 'true' &&
      btnLabels(b).some((l) => SEND_LABELS.includes(l));
    const e = editor.getBoundingClientRect();
    const onRow = (b) => {
      const r = b.getBoundingClientRect();
      if (!r.width) return false;
      const cy = r.y + r.height / 2;
      return cy > e.top - 40 && cy < e.bottom + 40;
    };
    let x = editor;
    for (let i = 0; i < 10 && x; i++) {
      x = x.parentElement;
      if (!x || x.getBoundingClientRect().height > 260) break;
      const btns = [...x.querySelectorAll('[role="button"], button')].filter((b) => ok(b) && onRow(b));
      const fresh = btns.find((b) => !beforeBtns.has(b));
      if (fresh || btns[0]) return fresh || btns[0];
    }
    const dlg = editor.closest('[role="dialog"]');
    if (dlg) {
      return [...dlg.querySelectorAll('[role="button"], button')]
        .find((b) => ok(b) && SEND_LABELS.includes(norm(b.innerText.trim()))) || null;
    }
    return null;
  }

  async function performReply(post, u) {
    const text = pickPhrase();
    if (!text) throw new Error('aucune phrase configurée dans le popup');
    const replyBtn = [...post.querySelectorAll('svg')]
      .find((sv) => REPLY_LABELS.includes(svgLabel(sv)))?.closest('[role="button"], button');
    if (!replyBtn) throw new Error('bouton « Répondre » introuvable');

    const pathBefore = location.pathname;
    const beforeEds = new Set(document.querySelectorAll('[contenteditable="true"]'));
    const beforeBtns0 = new Set(document.querySelectorAll('[role="button"], button'));
    realClick(replyBtn);

    const nu = norm(u).slice(0, 10);
    const editor = await waitFor(() => {
      const eds = [...document.querySelectorAll('[contenteditable="true"]')].filter((e) => !e.closest('.tqb-ui'));
      return eds.find((e) => norm(e.getAttribute('aria-placeholder') || '').includes(nu) && !e.innerText.trim()) ||
        eds.find((e) => !beforeEds.has(e) && !e.innerText.trim());
    }, 6000);
    if (!editor) throw new Error('champ de réponse introuvable');

    editor.focus();
    await sleep(300);
    const beforeBtns = new Set(document.querySelectorAll('[role="button"], button'));
    document.execCommand('insertText', false, text);
    await sleep(600);
    if (!norm(editor.innerText).includes(norm(text).slice(0, 8))) throw new Error('impossible de saisir le texte');

    const send = await waitFor(() => findSendButton(editor, beforeBtns), 4000);
    if (!send) throw new Error("bouton d'envoi introuvable (texte laissé dans le champ)");
    realClick(send);

    // Envoi considéré comme fait si : champ vidé/retiré, bouton d'envoi disparu ou désactivé,
    // ou la phrase apparaît publiée ailleurs que dans un champ de saisie.
    const probe = norm(text).slice(0, 25);
    const published = () => [...document.querySelectorAll('span, div')].some((el) =>
      el.childElementCount === 0 && !el.closest('[contenteditable], .tqb-ui') && norm(el.textContent).includes(probe));
    const sent = await waitFor(() =>
      !editor.isConnected || !editor.innerText.trim() ||
      !send.isConnected || send.getAttribute('aria-disabled') === 'true' ||
      published(), 10000, 250);
    lastReply = text;
    if (!sent) return { text, unsure: true };
    await sleep(800);

    // Revenir au fil : historique si l'URL a changé, sinon flèche « retour » apparue dans la colonne
    if (location.pathname !== pathBefore) {
      history.back();
      await waitFor(() => location.pathname === pathBefore, 5000);
    } else {
      const back = [...document.querySelectorAll('[role="button"], button')].find((b) =>
        !beforeBtns0.has(b) && btnLabels(b).some((l) => ['retour', 'back', 'precedent'].includes(l)));
      if (back) realClick(back);
    }
    return { text, unsure: false };
  }

  async function recordReply(u, postId, text) {
    if (postId) repliedPosts.add(postId);
    const { history = [] } = await api.storage.local.get({ history: [] });
    history.unshift({ u, at: Date.now(), action: 'reply', post: postId, text });
    await api.storage.local.set({ history: history.slice(0, 1000) });
  }

  async function record(key, u, kw) {
    done[key].add(u);
    const { history = [] } = await api.storage.local.get({ history: [] });
    history.unshift({ u, at: Date.now(), kw: kw || null, action: key });
    await api.storage.local.set({ history: history.slice(0, 1000) });
  }

  async function run() {
    if (running) return;
    running = true;
    while (queue.length) {
      const job = queue.shift();
      const a = ACTIONS[job.action];
      const wait = lastActionAt + MIN_DELAY_MS - Date.now();
      if (wait > 0) {
        job.onStatus('wait');
        await sleep(wait + Math.random() * 1000);
      }
      job.onStatus('busy');
      if (job.action === 'reply') {
        try {
          const post = job.getPost();
          if (!post) throw new Error('post introuvable');
          const { text, unsure } = await performReply(post, job.username);
          recent.push(Date.now());
          // Enregistrée dans tous les cas : le clic d'envoi a eu lieu, on évite une double réponse
          await recordReply(job.username, job.postId, text);
          job.onStatus('done');
          const short = text.length > 50 ? text.slice(0, 50) + '…' : text;
          toast(unsure
            ? `Réponse envoyée à @${job.username} (non vérifiée à l'écran) : « ${short} »`
            : `Réponse envoyée à @${job.username} : « ${short} »`);
        } catch (e) {
          job.onStatus('error');
          toast(`Échec (réponse) pour @${job.username} : ${e.message}`, true);
        }
        lastActionAt = Date.now();
        continue;
      }
      const steps = job.action === 'all'
        ? CHAIN.filter((k) => !done[k].has(job.username) && !(k === 'mute' && done.block.has(job.username)))
        : [job.action];
      let current = steps[0];
      let navigated = false;
      try {
        let stopped = false;
        for (let i = 0; i < steps.length; i++) {
          current = steps[i];
          if (i > 0) await sleep(MIN_DELAY_MS + Math.random() * 1000);
          const result = await performAction(current, job.getMore, job.username);
          recent.push(Date.now());
          lastActionAt = Date.now();
          if (result === 'manual') {
            job.onStatus(null);
            toast(
              `Signalement de @${job.username} ouvert : termine-le à la main` +
              (steps.length > 1 ? ', puis relance ⚡ pour la suite' : ''),
              true
            );
            stopped = true;
            break;
          }
          await record(current, job.username, job.keyword);
          if (steps.length > 1) toast(`@${job.username} ${ACTIONS[current].done} (${i + 1}/${steps.length})`);
        }
        if (!stopped) {
          job.onStatus('done');
          toast(`@${job.username} ${a.done}`);
        }
      } catch (e) {
        job.onStatus('error');
        toast(`Échec (${ACTIONS[current].verb.toLowerCase()}) pour @${job.username} : ${e.message}`, true);
      } finally {
        if (navigated) await goBack(job.username);
      }
      lastActionAt = Date.now();
    }
    running = false;
  }

  function overHourlyLimit() {
    const limit = Number(settings.hourlyLimit) || 0;
    if (limit <= 0) return false;
    const hourAgo = Date.now() - 3600e3;
    while (recent.length && recent[0] < hourAgo) recent.shift();
    return recent.length + queue.length >= limit;
  }

  function requestAction(key, username, keyword, getMore, setStatus, getPost) {
    const a = ACTIONS[key];
    let postId = null;
    if (key === 'reply') {
      if (!pickPhrase()) { toast('Ajoute des phrases de réponse dans le popup de l’extension', true); return; }
      const post = getPost?.();
      postId = post ? postIdOf(post) : null;
      if (postId && repliedPosts.has(postId)) { toast('Tu as déjà répondu à ce post via l’extension'); return; }
      if (queue.some((j) => j.action === 'reply' && j.postId === postId)) return;
    } else if (key === 'all') {
      if (CHAIN.every((k) => done[k].has(username)) || (done.report.has(username) && done.block.has(username))) {
        toast(`@${username} est déjà signalé et bloqué`); return;
      }
    } else {
      if (done[key].has(username)) { toast(`@${username} est déjà ${a.done}`); return; }
      if (done.block.has(username) && key !== 'report') { toast(`@${username} est déjà bloqué`); return; }
    }
    if (key !== 'reply' && queue.some((j) => j.username === username && j.action === key)) return;
    if (settings.confirmEach && !window.confirm(`${a.verb} @${username} ?`)) return;
    if (overHourlyLimit() && !window.confirm(
      `Plus de ${settings.hourlyLimit} actions en une heure : Threads peut limiter ton compte. Continuer quand même ?`
    )) return;
    queue.push({ action: key, username, keyword, getMore, getPost, postId, onStatus: setStatus });
    run();
  }

  // ---------- UI ----------

  function setStatus(btn, status) {
    btn.classList.remove('tqb-wait', 'tqb-busy', 'tqb-done', 'tqb-error');
    if (status) btn.classList.add(`tqb-${status}`);
  }

  function makeGroup(getUser, getKw, getMore, isFab = false) {
    const group = document.createElement('span');
    group.className = 'tqb-ui tqb-group';
    const stop = (e) => e.stopPropagation();
    group.addEventListener('pointerdown', stop);
    group.addEventListener('mousedown', stop);
    for (const key of enabledActions()) {
      if (isFab && key === 'reply') continue;
      const a = ACTIONS[key];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tqb-btn tqb-${key}`;
      btn.dataset.action = key;
      btn.textContent = a.icon;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const u = getUser();
        if (u) {
          requestAction(key, u, getKw(), () => getMore(btn), (st) => setStatus(btn, st),
            () => btn.closest('[data-pressable-container]'));
        }
      });
      group.appendChild(btn);
    }
    return group;
  }

  function refreshTitles(group, u) {
    for (const btn of group.querySelectorAll('.tqb-btn')) {
      const a = ACTIONS[btn.dataset.action];
      const title = `${a.verb} @${u}`;
      if (btn.title !== title) btn.title = title;
    }
  }

  // Lien texte du pseudo de l'auteur (pas l'avatar), pour y accoler les boutons
  function authorLink(post, u) {
    for (const a of post.querySelectorAll('a[href*="/@"]')) {
      const m = (a.getAttribute('href') || '').match(/\/@([\w.]+)\/?$/);
      if (m && m[1] === u && a.textContent.trim() && !a.querySelector('img')) return a;
    }
    return null;
  }

  function processPost(post, rebuild) {
    const u = usernameFromPost(post);
    if (!u) return;

    post.classList.toggle('tqb-blocked', done.block.has(u));
    post.classList.toggle('tqb-muted', !done.block.has(u) && done.mute.has(u));

    const kw = settings.highlight && matchers.length ? matchText(post.innerText) : null;
    post.classList.toggle('tqb-flagged', !!kw);

    let group = post.querySelector('.tqb-group');
    if (group && rebuild) { group.remove(); group = null; }
    if (!enabledActions().length) { group?.remove(); return; }
    if (!group) {
      // Sur la ligne du pseudo, juste après l'heure (sinon directement après le pseudo)
      const time = post.querySelector('time');
      const anchor = (time && (time.closest('a') || time)) || authorLink(post, u);
      if (!anchor) return;
      group = makeGroup(
        () => group.dataset.user,
        () => group.dataset.kw,
        (btn) => {
          const user = group.dataset.user;
          const p = btn.isConnected ? btn.closest('[data-pressable-container]') : null;
          return findMoreButton(p || findPostByUser(user));
        }
      );
      anchor.insertAdjacentElement('afterend', group);
    }
    if (group.dataset.user !== u) group.dataset.user = u;
    if (kw) { if (group.dataset.kw !== kw) group.dataset.kw = kw; }
    else if ('kw' in group.dataset) delete group.dataset.kw;
    refreshTitles(group, u);
    const rb = group.querySelector('.tqb-reply');
    if (rb && !rb.classList.contains('tqb-busy') && !rb.classList.contains('tqb-wait')) {
      const id = postIdOf(post);
      rb.classList.toggle('tqb-done', !!id && repliedPosts.has(id));
    }
  }

  // Barre flottante sur une page de profil
  function updateProfileBar(rebuild) {
    const m = location.pathname.match(/^\/@([\w.]+)\/?$/);
    let bar = document.querySelector('.tqb-fab');
    if (bar && rebuild) { bar.remove(); bar = null; }
    if (!m || !enabledActions().length) { bar?.remove(); return; }
    const u = m[1];
    if (!bar) {
      bar = makeGroup(
        () => bar.dataset.user,
        () => null,
        () => null, // sur un profil, performAction passe par performOnProfile
        true
      );
      bar.classList.add('tqb-fab');
      document.body.appendChild(bar);
    }
    if (bar.dataset.user !== u) {
      bar.dataset.user = u;
      bar.querySelectorAll('.tqb-btn').forEach((b) => setStatus(b, null));
    }
    refreshTitles(bar, u);
  }

  let toastTimer;
  function toast(msg, isError = false) {
    let el = document.querySelector('.tqb-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'tqb-ui tqb-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.toggle('tqb-toast-error', isError);
    el.classList.add('tqb-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('tqb-show'), 4000);
  }

  function scan(rebuild = false) {
    document.querySelectorAll('[data-pressable-container]').forEach((p) => processPost(p, rebuild));
    updateProfileBar(rebuild);
  }

  // ---------- Démarrage ----------

  load().then(() => {
    scan();
    let t;
    new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => scan(false), 300);
    }).observe(document.body, { childList: true, subtree: true });
  });
})();
