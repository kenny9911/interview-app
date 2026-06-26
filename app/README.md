# viva — AI Video Interview App (web implementation)

Faithful web implementation of the **`Interview App.dc.html`** Claude Design handoff
(art direction *"Atelier"* — bone paper, plum ink, electric persimmon; Bricolage
Grotesque + Hanken Grotesk).

All 11 screens are reproduced inside a real iOS device frame (ported from the
bundle's `ios-frame.jsx`): dynamic island, status bar, and home indicator.

## Run it

No build step — it's static. Serve the folder and open it:

```bash
cd app
python3 -m http.server 8777
# open http://localhost:8777/
```

(Open `index.html` directly with `file://` works too, but a server keeps the
relative font/script loads clean.)

## Two views

- **Gallery** — every screen laid out like the original design canvas, grouped
  into Onboarding, Core flow, and Pricing. Click any phone to jump into it.
- **Prototype** — one centered device with the core flow wired click-through.
  Use the dropdown, the ◀ ▶ buttons, or the arrow keys to move between screens.
  Primary CTAs advance the flow (e.g. *Get started → Create account → Home →
  Choose a mode → Set up → Live → Results*; *Profile tab → Plans → Payment*).

## Files

| File | Purpose |
|---|---|
| `index.html` | The 11 screens + toolbar. Per-screen styles are kept inline, matching the source pixel-for-pixel. |
| `styles.css` | Design tokens, the iOS device frame, animations, gallery/prototype layout. |
| `prototype.js` | Injects the device chrome and runs gallery/prototype navigation. |

## Screens

Onboarding — Welcome · Sign in · Create account
Core flow — Home · Choose a mode · Set up · Live interview · Results
Pricing — Plans · Payment · Live (deep-night variant)

## Design tokens (Atelier)

| Token | Value |
|---|---|
| Bone paper | `#F4EFE4` (canvas `#e7e5df`) |
| Plum ink | `#2E2142` / `#3A2952` / `#241634` |
| Persimmon (hero) | `#FF5836` / `#D8401C` / light `#FF8A5C` |
| Sand | `#E7C8A0` |
| Ink / muted text | `#1F1A17` / `#8B8576` |
| Display / text type | Bricolage Grotesque / Hanken Grotesk |

## Next step → React Native

This static build pins the visual layer. Porting to the recommended **React
Native (Expo)** stack is then mechanical: the device frame becomes the
`SafeAreaView`/screen container, each screen a component, the shared tokens above
a theme file, and the orb/voice-bar/ring CSS keyframes become Reanimated loops.
The persimmon CTA, cards, inputs, and tab bar are the reusable primitives.
