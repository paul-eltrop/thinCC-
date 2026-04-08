@AGENTS.md

# Frontend Design System

Visueller Stil: **Pastel-Glass / Soft Modern**. Inspiriert von Calm-/Wellness-Apps,
aber professionell. Viel Licht, viel Luft, abgerundete Ecken überall, weiche
Schatten, frosted glass cards. Alle neuen Pages müssen sich an dieses System
halten. Keine Abweichungen ohne expliziten Anlass.

Referenz-Implementierung: [src/app/page.tsx](src/app/page.tsx).

## Background

Jede Page-Wurzel bekommt diesen radialen Multi-Gradient-Hintergrund:

```tsx
<div
  className="min-h-screen text-slate-900"
  style={{
    background: `radial-gradient(ellipse 90% 60% at 0% 0%, #E8F1FE 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 100% 0%, #FDE8E8 0%, transparent 50%), radial-gradient(ellipse 80% 70% at 50% 100%, #EFE5FE 0%, transparent 55%), #F7F3FB`,
  }}
>
```

Hellblau oben links, Peach oben rechts, Lavendel unten, auf hellem Lila-Weiß.
Nicht ändern ohne Grund.

## Farben

- **Text primär**: `text-slate-900`
- **Text sekundär**: `text-slate-500` / `text-slate-600`
- **Text tertiär**: `text-slate-400`
- **Akzent (Highlights, Calendar-Today, Bars)**: `bg-blue-500` / `text-blue-500`
- **Primary Button**: `bg-slate-900 text-white`
- **Positiv** (Delta, Ready): `bg-emerald-100 text-emerald-700`
- **Negativ**: `bg-rose-100 text-rose-700`
- **Warnung**: `bg-amber-100 text-amber-700`
- **Info**: `bg-blue-100 text-blue-700`

Keine grellen Farben. Pastels und Slate-Töne sind die Norm.

## Cards

Standard-Card:

```tsx
className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl"
```

- **Radius**: `rounded-3xl` für große Cards, `rounded-2xl` für kompakte
- **Background**: immer `bg-white/70` + `backdrop-blur-xl` für Frosted Glass
- **Border**: `border-white/60` (subtiler innerer Glow, kein harter Rand)
- **Shadow**: weich und low-opacity: `shadow-[0_2px_24px_rgba(15,23,42,0.04)]`
- **Padding**: `p-6` Standard, `p-5` für schmale Side-Cards

Akzent-Cards (Urgent / Highlight) bekommen farbigen Background statt Weiß
(`bg-blue-50`, `bg-emerald-50`, `bg-amber-50`), aber gleicher Radius / Shadow.

## Typografie

Font: **Geist Sans** (im Root-Layout geladen, automatisch über `font-sans`).
Keine zweite Display-Schrift.

Hierarchie:
- **Page Title**: `text-[28px] font-semibold tracking-tight`
- **Big Number (Eyecatcher in StatCards)**: `text-[44px] font-semibold leading-none tracking-tight`
- **Card Title**: `text-base font-semibold` (16px)
- **Body**: `text-sm` (14px)
- **Secondary**: `text-xs text-slate-500` (12px)
- **Labels / Eyebrow**: `text-[11px] font-medium` oder `text-[10px] uppercase tracking-wide`

Regel: `tracking-tight` für alles ab 18px. Standard sonst.

## Buttons

**Primary** (dunkel, immer `rounded-full`):
```tsx
className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
```

**Secondary**: gleiches Layout, aber `bg-white/70 border border-white/60`.

**Segmented Control** (Week/Month/Year-Pattern):
```tsx
<div className="flex items-center gap-1 rounded-full border border-white/60 bg-white/50 p-1 backdrop-blur-xl">
  {/* active: bg-slate-900 text-white */}
  {/* inactive: text-slate-600 hover:text-slate-900 */}
</div>
```

Buttons sind **immer** `rounded-full`. Niemals `rounded-md` / `rounded-lg`.

## Badges / Pills

Klein, abgerundet, farbiger Background + dunklerer Text:

```tsx
<span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-700">
  ↑ +5%
</span>
```

Tonpaarungen siehe Farben oben.

## Avatare

Immer `rounded-full`. Initialen-Avatare bekommen einen Gradient:
```tsx
className="bg-gradient-to-br from-blue-400 to-purple-400 text-white font-semibold"
```

## Icons

Lucide-Style Stroke-Icons, inline als SVG (keine Icon-Library):

```tsx
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
  {/* paths */}
</svg>
```

- Stroke-Width: `1.8`
- `strokeLinecap` und `strokeLinejoin`: `round`
- Größe: `18` für Sidebar/Standard, `14` für inline-klein, `12` für Mini

## Layout

- **TopBar**: `px-8 py-5`, Logo links, Account rechts. Logo = `size-9 rounded-2xl` Icon-Box + Wordmark.
- **Linke Sidebar**: `w-[88px]` Icon-Rail. Jedes Nav-Item ist Icon (`size-10 rounded-xl`) + Label (`text-[10px]`) drunter, vertikal gestapelt. Aktives Item: weiße Glas-Card + blauer Icon-Background.
- **Main**: 2-Spalten-Grid: `grid-cols-[1fr_340px] gap-6`. Linke Spalte = Hauptinhalt, rechte (340px) = Side-Widgets (Kalender, Upcoming, Activity).
- **Vertical Spacing**: `space-y-6` zwischen Cards in einer Spalte. `gap-4` zwischen Stat-Cards in einer Row.

## Charts

Bar Charts: gestaffelte Blautöne von hell nach dunkel, mit diagonalem
Stripe-Overlay:

```ts
const barColors = ["#DBEAFE", "#BFDBFE", "#93C5FD", "#60A5FA", "#3B82F6", "#2563EB", "#1D4ED8"];
```

```tsx
style={{
  backgroundImage: `repeating-linear-gradient(45deg, rgba(255,255,255,0.22) 0 4px, transparent 4px 8px), linear-gradient(180deg, ${color}, ${color})`,
}}
```

Bars sind `rounded-2xl`. Datenvisualisierung ist immer weich und ruhig, niemals
aggressiv.

## Fit-Score-Ringe

Für Tender-Fit-Scores wird ein Conic-Gradient-Ring genutzt:

```tsx
<div
  className="grid size-11 place-items-center rounded-full text-white"
  style={{ background: `conic-gradient(${color} ${fit * 3.6}deg, #F1F5F9 0deg)` }}
>
  <div className="grid size-9 place-items-center rounded-full bg-white text-slate-900">
    {fit}
  </div>
</div>
```

Farbe: `#3B82F6` ab fit ≥ 80, `#94A3B8` ab 60, sonst `#CBD5E1`.

## Was NICHT tun

- Keine harten Borders (`border-slate-300`, `border-zinc-200`) — nur `border-white/60` oder gar keine.
- Keine eckigen Buttons — Buttons sind **immer** `rounded-full`.
- Keine grellen Primärfarben — Pastels und Slate.
- Keine schwarzen Drop-Shadows (`shadow-lg`, `shadow-xl`) — immer custom mit `rgba(15,23,42, ≤0.06)`.
- Kein Serif, kein Mono als Display-Font — Geist überall.
- Keine Glas-Cards ohne `backdrop-blur` — der Hintergrund muss durchscheinen.
- Keine dichten Tabellen, keine Operator-Looks, keine Editorial-Hero-Sektionen.
- Kein dunkler Mode (vorerst) — der Light-Pastel-Look ist der einzige Mode.
