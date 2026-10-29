# claude-progressbar

Zwei Mods für [Claude Code](https://claude.com/claude-code), die über der Eingabe zeigen, woran Claude gerade arbeitet und wie viel vom Kontingent schon verbraucht ist.

| Mod | Was er zeigt |
| --- | --- |
| `wochen-nutzung` | Sitzung (5-Stunden-Fenster) und Woche als dünne Balken mit Prozent, bei der Woche zusätzlich, wie viel davon lokal in Claude Code und wie viel woanders (Web, Handy) verbraucht wurde. Blau, ab 75 % orange, ab 90 % rot. Details über `/nutzung`. |
| `fortschritt` | Den aktuellen Schritt der Aufgabenliste, einen gepunkteten Fortschrittsbalken („2/5“, Prozent), die Zahl der laufenden Agents und klein rechts die Reset-Zeiten von 5-Stunden-Fenster und Woche. |

Beide laufen einzeln, zusammen ergeben sie die komplette Leiste: oben die Nutzung, darunter der Fortschritt. Jede Leiste lässt sich mit ✕ ausblenden.

**Hinweis:** `fortschritt` liest die Aufgabenliste, die Claude im Code-Tab der Claude-Desktop-App führt. Die Leiste steht immer da, auch ohne Aufgabenliste: dann mit leerem Balken, den laufenden Agents und den Reset-Zeiten. Die Texte sind auf Deutsch.

## Installieren

Im Terminal an der Eingabe von Claude Code:

```
/plugin install wochen-nutzung --marketplace Merv9310/claude-progressbar
```

```
/plugin install fortschritt --marketplace Merv9310/claude-progressbar
```

Aus einer Shell:

```bash
claude plugin install wochen-nutzung --marketplace Merv9310/claude-progressbar
```

```bash
claude plugin install fortschritt --marketplace Merv9310/claude-progressbar
```

In der Desktop-App, wo `/plugin` nicht läuft: auf **+** neben der Eingabe klicken, dann **Plugins**, **Add marketplace** mit `Merv9310/claude-progressbar`, dann **Add plugin**.

Beim ersten Mal fragt Claude Code `Add marketplace?`, das beantwortest du mit `y`. Danach wählst du den Bereich, für alle Sitzungen ist das `user`.

## Entwickeln

Jeder Mod liegt unter `plugins/<name>/` und hat eigene Tests:

```bash
claude plugin validate plugins/fortschritt
```

```bash
claude plugin test plugins/fortschritt
```

## Danke

Die Optik des Fortschrittsbalkens in `fortschritt`, also die gepunktete Füllung und die Zeile als ein SVG, ist an [savvy-progress](https://github.com/johnnyvizz/claude-kit/tree/main/plugins/savvy-progress) von johnnyvizz (MIT) angelehnt.

## Lizenz

MIT, siehe [LICENSE](LICENSE).
