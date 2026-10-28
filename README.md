# Bloque ton facho

Une extension de navigateur pour bloquer, mettre en sourdine ou signaler un compte **en un clic** sur [Threads](https://www.threads.com) (version web), et repérer les comptes selon tes propres mots-clés.

Version 0.7.0 · Chrome / Chromium et Firefox · Threads sur ordinateur (pas l'application mobile) · aucune donnée envoyée ailleurs.

## Installation

| Navigateur | Fichier | Guide |
|---|---|---|
| Chrome, Edge, Brave, Opera, Arc… | [`chrome/bloque-ton-facho.zip`](chrome/bloque-ton-facho.zip) | [Installer sur Chrome](chrome/README.md) |
| Firefox 142+ | [`firefox/bloque-ton-facho-firefox.xpi`](firefox/bloque-ton-facho-firefox.xpi) | [Installer sur Firefox](firefox/README.md) |

L'extension n'est pas (encore) sur le Chrome Web Store ni sur addons.mozilla.org : elle s'installe à la main, en quelques clics.

## Ce que ça fait

Des boutons apparaissent sur la ligne du pseudo de chaque post :

| Bouton | Action |
|---|---|
| ⚡ **Tout enchaîner** | Signale le post comme faux compte, met en sourdine, puis bloque. Les étapes déjà faites sont sautées. |
| ⛔ **Bloquer** | Bloque depuis le menu « … » du post. Si l'option n'y est pas (par exemple pour un compte que tu suis), passe par la page de profil puis revient au fil. |
| 🔇 **Sourdine** | Même principe avec « Mettre en sourdine ». |
| 🚩 **Signaler** | Signale comme « Bot ou faux compte » et envoie. Si un écran est inconnu, l'extension s'arrête et te laisse finir à la main. |
| 💬 **Répondre** | Publie une phrase tirée au hasard dans ta liste. Une seule réponse par post. |

Sur une page de profil, les mêmes boutons sont dans une barre flottante en bas à droite.

Un message en bas de l'écran confirme chaque action, et le bouton passe au vert une fois l'action faite.

**Mots-clés** : les posts dont le pseudo, le nom ou le texte contient un de tes mots-clés sont marqués d'une barre rouge. Rien n'est bloqué automatiquement, c'est toi qui décides.

Les posts de comptes déjà bloqués via l'extension sont grisés, ceux en sourdine atténués.

## Réglages

Clique sur l'icône de l'extension pour :

- saisir tes mots-clés (insensibles à la casse et aux accents, emojis acceptés) ;
- saisir tes phrases de réponse 💬 ;
- masquer les boutons dont tu ne te sers pas ;
- demander une confirmation avant chaque action ;
- régler l'alerte d'actions par heure ;
- consulter, exporter (JSON) ou vider l'historique local.

Pense à cliquer sur **Enregistrer** après une modification.

## Garde-fous

- 3 à 4 secondes minimum entre deux actions (les clics rapides sont mis en file d'attente).
- Alerte au-delà de 40 actions par heure par défaut (réglable, 0 = désactivée). Meta ne publie aucun seuil officiel : c'est une limite de prudence, pas une garantie.
- Varie tes phrases de réponse : des messages identiques en série peuvent être pris pour du spam.

## Vie privée

L'extension n'a accès qu'à `threads.com` / `threads.net`. Tes réglages sont stockés dans le navigateur (synchronisés via ton compte navigateur si tu l'as activé), l'historique reste en local. Rien n'est envoyé à un serveur tiers.

## Si ça ne marche plus

Threads change régulièrement son interface. En cas de message rouge d'erreur, fais l'action à la main pour cette fois et ouvre une issue en indiquant l'action et le message. Les libellés à ajuster sont dans `content.js` : `MORE_LABELS`, `ACTIONS[...].menu`, et pour le signalement `FAKE_PATTERNS`, `PARENT_PATTERNS`, `SUBMIT_WORDS`.
