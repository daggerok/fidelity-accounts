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
6. Press 👀 in the navbar: Fidelity opens on Positions, the script reads it and writes the sheet, the viewer reads it from there. While 👀 is on and the market is open (9:30 to 16:00 New York, weekdays), Positions refresh every 10 minutes and the numbers in the viewer follow the market; opening or reloading a Fidelity page never jumps or refreshes by itself; press 👀 again to stop. For fresh numbers right now reload the viewer (Cmd+R): an open Fidelity tab presses its Refresh Positions, writes what changed to the sheet, and the viewer reads it in a few seconds

Once Google is connected the data comes by itself: from the sheet, or with 👀 started for you when the sheet is empty and you never switched 👀 yourself. 👀 stays as you set it (in the viewer or on the script panel on Fidelity, whose dot is green while watching and grey when not); nothing pauses it by the clock. The Google sign-in is kept until it expires (about an hour), so a reload needs no click; ☁️ shows in the navbar only while Google is not connected, Disconnect is in ⚙️. On another computer: Connect Google and the data loads from the sheet, no script needed.

## How it works

One way: Fidelity -> your Google Sheet -> the viewer. The viewer only asks for a read and only reads the sheet

```
 viewer: Cmd+R or 👀            Fidelity tab (userscript)            Google Sheet            viewer
 asks for a read  ----------->  reads Positions, the daily  ------>  fidelity_* tabs  ---->  reads the sets
 (Tampermonkey storage)         values, transactions; writes         fidelity_updates        that changed
                                only what changed, then signals ------------------------->  (signal: at once,
                                                                                             else every 10 min)
```

- The Positions page keeps Fidelity's own answer (about 100 fields per position) in its grid. A tiny reader in the page copies those rows, no extra request is sent. It reads once when Positions opens and when you press ⬇ on the corner panel; with 👀 on it presses the page's own Refresh Positions button every 10 minutes while the market is open (a read) and writes the changes to the sheet at most every 10 minutes (at once when you asked)
- The account list on the left gives the groups (Investment, Retirement) and balances. In the viewer the accounts strip sits in the navbar (All accounts on the left, the rest scrolls sideways with ‹ ›) and shows accounts as solid chips and groups as outlined ones; a click on All accounts or a group folds or unfolds it, a click on an account shows only it, and the checkboxes choose any set (All accounts ticks or clears every account, a group its own accounts)
- Summary cards: movers by % or $ (the biggest loser at the very bottom), accounts sorted by value or by today's or total P&L in $ or %, upcoming dividends with the expected payout for the shares held (ex-dates until the end of the month by default; MTD, 1M, QTD or 3M); ⤢ on a card opens its full view big
- Positions table: our own columns first, then Fidelity's. DRIP and DRIP $: how many shares, or dollars at the last price, to buy so the next dividend of that position buys at least 0.001 share by DRIP (Fidelity reinvests to 3 decimals). A plus is what to buy (rounded up, so it is enough), a minus in green means the next payout already buys 0.001 share or more. Example: DRIP +0.012 and DRIP $ +$5.23 = buy 0.012 shares or $5.23 of them. The sliders icon in the Symbol header opens the columns window: all columns by group with a filter on the left, the chosen ones in order on the right, moved by ≡ (mouse, finger or arrow keys); changes show at once, Default brings every column back
- Once a day the script also reads Fidelity's own daily account values (the data of its Summary balance chart): since each account opened the first time, then the last month. The Balance card draws them for the chosen accounts with periods from 1D to 3Y (the card shows the main ones, the big chart every step: 1D..3D, WTD, 1W..3W, MTD, 1M..11M, QTD, 1Q..3Q, YTD, 1Y..3Y); ⤢ grows the card into a big window, ✕, a click outside or Esc shrinks it back. The change shown is the balance change (deposits are in it), not a return
- Right after that it reads the transactions history of every account (the same read the Activity page makes): the first time month by month since the account's first daily value, then the last days only. The Income card shows the dividends and interest really received this year, quarter and month next to the plan (received plus what still comes at today's holdings) with a progress bar; until the history is read it shows --
- Only the Fidelity tab writes the sheet, with the Google token the viewer hands over, and only the data sets that changed: summary (accounts and daily balances), positions, transactions. Then it marks them in `fidelity_updates` and signals the viewer, which reads just those sets back. No signal (another computer, no script): the viewer checks `fidelity_updates` every 10 minutes and whenever its tab comes back into view. Without a token the writes wait until the viewer is open and connected
- At the bottom of ⚙️ Settings: Reset view (theme, language, account, tab, sort, columns, panels; the setup stays) and Full reset, off until its switch is ticked (also the Google setup and the cached data; the script forgets its data and Google token, the Fidelity login stays under 🔑)
- What the browser keeps: the public Client ID and the spreadsheet id (localStorage), the last data (IndexedDB), your choices: account, tab, sort, columns, theme, language. The Google token and its expiry stay in localStorage until it expires. The Fidelity login, if saved, lives only in the script's Tampermonkey storage

Sheet tabs:

| Tab | What | Written |
|-----|------|---------|
| `fidelity_accounts` | one row per account: group, type, balance, gains, cost basis, income, cash | rewritten when changed |
| `fidelity_positions` | positions now, the main columns plus every field as JSON | rewritten |
| `fidelity_balances_daily` | balance history, one row per day and account, since each account opened | added and updated |
| `fidelity_positions_all` | every field of every position as its own column; new fields add columns | rewritten |
| `fidelity_transactions` | the transactions history of every account | rewritten after its daily read |
| `fidelity_transactions_synced` | how far each account's transactions were read | rewritten with it |
| `fidelity_updates` | when each data set (summary, positions, transactions) was last written | updated after every write |

## When Fidelity changes something

Everything this app relies on at Fidelity is listed in `src/shared/contract.ts`: each entry says what we expect (a page address, a selector, the fields of a row, the shape of an answer) and which of our files use it. The script checks the real data against it on every read; a broken entry shows on the corner panel and under ⚙️ in the viewer as `✗ grid.fields: POSITION.curVal is gone (fix in src/shared/parse.ts)`. The tests run the same checks on recorded shapes and on broken copies

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
