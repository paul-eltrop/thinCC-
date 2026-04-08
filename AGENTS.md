# Coding Guidelines

## Kommentare

- **Keine Inline-Kommentare.** Kein `// increment counter` neben `i++`.
- Jede Datei beginnt mit genau **einem Kommentarblock (3 Zeilen)**, der beschreibt was die Datei tut. Nicht mehr, nicht weniger.
- Kommentare im Code nur wenn die Logik **wirklich nicht offensichtlich** ist – z.B. ein Workaround, ein bekannter Bug, oder eine Business-Regel die man aus dem Code allein nicht ablesen kann.
- Wenn du das Gefühl hast einen Kommentar schreiben zu müssen, benenne stattdessen die Variable oder Funktion besser.

## Error Handling

- **Kein defensives Try-Catch um Code der nicht failen kann.** Wenn eine Variable aus einer Zuweisung kommt und kein I/O, Netzwerk oder Parsing involviert ist, braucht sie kein Try-Catch.
- Try-Catch nur dort wo tatsächlich Laufzeitfehler auftreten können: Dateizugriff, Netzwerk-Requests, JSON-Parsing von externem Input, Datenbankzugriffe.
- Keine leeren Catch-Blöcke. Wenn du einen Fehler fängst, tu etwas Sinnvolles damit.

## Code-Stil

- Schreibe Code so wie ein erfahrener Entwickler ihn bei einem Code-Review sehen will: kurz, klar, ohne Boilerplate.
- Bevorzuge frühe Returns statt tief verschachtelter If-Else-Blöcke.
- Keine Variablen deklarieren die nur einmal benutzt werden um sie direkt weiterzugeben – inline wenn es lesbar bleibt.
- Keine unnötigen Abstraktionen. Nicht alles braucht eine eigene Klasse, ein Interface oder ein Pattern. Einfacher Code > cleverer Code.
- Funktionen kurz halten. Wenn eine Funktion mehr als ~30 Zeilen hat, aufteilen.

## Naming

- Variablen- und Funktionsnamen sollen den Zweck beschreiben, nicht den Typ. `users` statt `userArray`, `isValid` statt `validationBooleanFlag`.
- Keine Abkürzungen außer allgemein bekannte (`id`, `url`, `config`, `err`, `ctx`).
- Konsistent bleiben: wenn im Projekt `fetch` verwendet wird, nicht plötzlich `get` oder `retrieve` einführen.

## Struktur

- Importe oben, gruppiert nach extern/intern, mit einer Leerzeile dazwischen.
- Keine toten Importe, keine auskommentierten Code-Blöcke.
- Dateien sollen eine Aufgabe haben. Wenn eine Datei zwei unabhängige Dinge tut, aufteilen.

## Was du NICHT tun sollst

- Keinen Code generieren der nur existiert um "sicher" auszusehen (leere Catch-Blöcke, redundante Null-Checks auf non-nullable Werte, überflüssige Type-Assertions).
- Keine `console.log`-Statements als Debugging-Überbleibsel hinterlassen.
- Keine TODO-Kommentare hinterlassen die nie bearbeitet werden.
- Keinen Code wiederholen – wenn du Copy-Paste machst, extrahiere eine Funktion.