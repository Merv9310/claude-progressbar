# claude-progressbar

Two mods for [Claude Code](https://claude.com/claude-code) that show, above the prompt, what Claude is working on right now and how much of your usage limit is already used.

| Mod | What it shows |
| --- | --- |
| `wochen-nutzung` | The session (5-hour window) and the week as thin bars, each with its percentage and reset time. Blue, orange from 75 %, red from 90 %. It also measures how much of the week was used locally in Claude Code and how much elsewhere (web, phone). Details via `/nutzung`. |
| `fortschritt` | The current step of the task list, a dotted progress bar ("2/5", percentage), the number of running agents and, small on the right, how much of the week was used locally and on the web. |

Each mod runs on its own; together they make up the full bar: usage on top, progress below. Each bar can be hidden with ✕.

**Note:** `fortschritt` reads the task list Claude keeps in the Code tab of the Claude desktop app. The bar is always shown, even without a task list: then with an empty bar and the running agents. The local / web split comes from `wochen-nutzung`; without that mod the spot stays empty. The mods' on-screen text is in German.

## Install

At the Claude Code prompt in a terminal:

```
/plugin install wochen-nutzung --marketplace Merv9310/claude-progressbar
```

```
/plugin install fortschritt --marketplace Merv9310/claude-progressbar
```

From a shell:

```bash
claude plugin install wochen-nutzung --marketplace Merv9310/claude-progressbar
```

```bash
claude plugin install fortschritt --marketplace Merv9310/claude-progressbar
```

In the desktop app, where `/plugin` doesn't run: click **+** next to the prompt, then **Plugins**, **Add marketplace** with `Merv9310/claude-progressbar`, then **Add plugin**.

The first time, Claude Code asks `Add marketplace?`; answer `y`. Then pick the scope; for all sessions that is `user`.

## Development

Each mod lives under `plugins/<name>/` and has its own tests:

```bash
claude plugin validate plugins/fortschritt
```

```bash
claude plugin test plugins/fortschritt
```

## Credits

The look of the progress bar in `fortschritt`, the dotted fill and the row drawn as one SVG, is inspired by [savvy-progress](https://github.com/johnnyvizz/claude-kit/tree/main/plugins/savvy-progress) by johnnyvizz (MIT).

## License

MIT, see [LICENSE](LICENSE).
