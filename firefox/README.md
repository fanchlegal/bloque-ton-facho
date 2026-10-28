# Threads Quick Block pour Firefox

Firefox 142 ou plus récent.

## Essai rapide (temporaire)

L'extension est retirée au redémarrage de Firefox.

1. Télécharge [`threads-quick-block-firefox.xpi`](threads-quick-block-firefox.xpi) (bouton **Download raw file** sur la page GitHub).
2. Ouvre `about:debugging#/runtime/this-firefox`.
3. Clique **Charger un module complémentaire temporaire…** et choisis le fichier `.xpi`.
4. Recharge l'onglet Threads.

## Installation permanente

Firefox (version standard) n'installe durablement que des extensions **signées par Mozilla**. Le `.xpi` de ce dépôt n'est pas signé, donc deux options :

**Option A : signer soi-même (gratuit, n'importe quel Firefox)**

1. Crée un compte sur [addons.mozilla.org/developers](https://addons.mozilla.org/developers/).
2. **Soumettre un module** → choisis **« Sur votre propre site »** (non listé : rien n'est publié).
3. Envoie le `.xpi`. La signature automatique prend quelques minutes.
4. Télécharge le `.xpi` signé et ouvre-le dans Firefox (ou glisse-le dans la fenêtre) → **Ajouter**.

**Option B : Firefox Developer Edition, Nightly ou ESR**

1. Ouvre `about:config`, passe `xpinstall.signatures.required` à `false`.
2. `about:addons` → ⚙ → **Installer un module depuis un fichier…** → choisis le `.xpi`.

> Ce réglage est ignoré par la version standard de Firefox.

## Si aucun bouton n'apparaît

Firefox peut demander l'accès aux sites à part :
`about:addons` → **Threads Quick Block** → onglet **Permissions** → autorise `threads.com` et `threads.net`.

Puis recharge l'onglet Threads.

Astuce : clique sur l'icône pièce de puzzle 🧩 en haut à droite de Firefox et épingle Threads Quick Block pour garder son icône visible.

## Mise à jour

- Temporaire : `about:debugging` → **Recharger** (ou recharge le nouveau `.xpi`).
- Permanente : installe le nouveau `.xpi` (signé) par-dessus, les réglages sont conservés.

## Désinstallation

`about:addons` → **⋯** → **Supprimer**.

Voir le [README principal](../README.md) pour l'utilisation.
