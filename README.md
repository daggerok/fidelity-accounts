# fidelity-accounts

Your Fidelity accounts in your own viewer and your own Google Sheet. A Tampermonkey script reads the Positions page in your logged-in browser, read only, and the viewer on GitHub Pages shows it: accounts as tabs, a Summary of cards and a Positions table. No server, no Fidelity API, no secrets in code, $0. Not affiliated with Fidelity

Live: https://daggerok.github.io/fidelity-accounts/

Script: https://daggerok.github.io/fidelity-accounts/fidelity-accounts-sync.user.js

## Get started

⚙️ Settings slide down from the navbar by themselves while something needs setup: Get started sits on top, expanded, and lists only the open steps; Enter or ✕ slides the panel up. Google Sheets is part of Get started. Once everything is set, 🚀 leaves the navbar and Get started stays squashed on top of Settings (click its header to open it):

1. Google OAuth Client ID: in [console.cloud.google.com](https://console.cloud.google.com/) enable the Google Sheets API, set the OAuth consent screen to External with your email under Test users, create an OAuth client ID of type Web application with the authorized JavaScript origin `https://daggerok.github.io` (and `http://localhost:1237` for local work). The client of youtube, twitter or mykplan-adp works too. Paste the Client ID into the window
2. Connect Google: pick your account once, later the page connects by itself
3. Google Sheet: press Create a spreadsheet, or paste the link of your own
4. Install [Tampermonkey](https://www.tampermonkey.net/). In Chrome open its extension details, turn on Allow User Scripts and allow the sites `digital.fidelity.com` and `daggerok.github.io`. Open the script link above, press Install, reload the viewer
5. Optional: open Fidelity, press 🔑 in the script's corner panel and save your username and password. The script then logs in by itself when Fidelity asks; a one-time code you type yourself
6. Press ⬇ in the navbar: Fidelity opens on Positions, the script reads it, the data shows up in the viewer and in the sheet

Later just press ⬇. On another computer: Connect Google and the viewer loads the data back from the sheet, no script needed. Demo data with made-up accounts is one click away in ⚙️ Settings

## How it works

```
digital.fidelity.com (you are logged in)     daggerok.github.io/fidelity-accounts      Google
+-------------------------------+            +------------------------------+          +-------------------+
| userscript: reads the         | Tamper-    | same userscript: bridge      |  Sheets  | your spreadsheet  |
| positions grid and the        | monkey     | viewer: Summary, Positions   |  API v4  | fidelity_* tabs   |
| account list (read only)      | storage    | Google sign-in (GIS)         | -------> |                   |
| writes the sheet after a read | ------------------------------------------------------>|                   |
+-------------------------------+            +------------------------------+          +-------------------+
```

- The Positions page keeps Fidelity's own answer (about 100 fields per position) in its grid. A tiny reader in the page copies those rows, nothing is clicked and no extra request is sent. Reads happen when you press ⬇, and by themselves at most every 10 minutes while the page is open
- The account list on the left gives the groups (Investment, Retirement) and balances
- The viewer hands its Google token to the script, so the Fidelity tab writes the sheet right after a read. Without a token the data waits until the viewer is open and connected
- What the browser keeps: the public Client ID and the spreadsheet id (localStorage), the last data (IndexedDB), your choices: account, tab, sort, columns, theme, language. The Google token stays in memory. The Fidelity login, if saved, lives only in the script's Tampermonkey storage

Sheet tabs:

| Tab | What | Written |
|-----|------|---------|
| `fidelity_accounts` | one row per account: group, type, balance, gains, cost basis, income, cash | rewritten on every read |
| `fidelity_positions` | positions now, the main columns plus every field as JSON | rewritten |
| `fidelity_balances_daily` | balance history, one row per day and account | added and updated |
| `fidelity_positions_all` | every field of every position as its own column; new fields add columns | rewritten |

## Safety

- Read only: the script never trades, transfers or submits anything on Fidelity; the only form it fills is the login, with your saved login, at most once per 30 minutes, and it stops for good when the password is refused
- Your data goes from your browser to your Google Sheet and nowhere else. The repo holds no account data: tests use made-up numbers

## Develop

Bun, Parcel, React 19, TypeScript, Tailwind 4. All code lives in `src/`:

- `src/viewer` the React app (`app/` state, Google, i18n; `ui/` screens)
- `src/shared` framework-free code used by the viewer and the script: data model, parser, Google Sheets client and tabs (ready for a Solid 2.0 viewer later)
- `src/userscript` the Tampermonkey script: page reader, corner panel, login, Sheets writes
- `src/build` userscript bundle, CSP

```bash
bun install
bun run serve        # http://localhost:1237, with a dev userscript at /fidelity-accounts-sync.user.js
bun test
bun run build        # dist/: the viewer and the userscript
```

Pull requests run the tests and the build; main deploys GitHub Pages. Bump `version` in `package.json` on every script change, Tampermonkey updates by it
