# fidelity-accounts

Your Fidelity accounts in your own viewer and your own Google Sheet. A Tampermonkey script reads the Positions page in your logged-in browser, read only, and the viewer on GitHub Pages shows it: accounts as tabs, a Summary of cards and a Positions table. No server, no Fidelity API, no secrets in code, $0. Not affiliated with Fidelity

Live: https://daggerok.github.io/fidelity-accounts/

Script: https://daggerok.github.io/fidelity-accounts/fidelity-accounts-sync.user.js

## Get started

⚙️ Settings slide down from the navbar by themselves while something needs setup: Get started sits on top, expanded, and lists only the open steps; Enter or ✕ slides the panel up. Google Sheets is part of Get started. Once everything is set, 🚀 leaves the navbar and Get started stays squashed on top of Settings (click its header to open it):

1. Google OAuth Client ID: in [console.cloud.google.com](https://console.cloud.google.com/) enable the Google Sheets API, set the OAuth consent screen to External with your email under Test users, create an OAuth client ID of type Web application with the authorized JavaScript origin `https://daggerok.github.io` (and `http://localhost:1237` for local work). An OAuth client you already use for another web app works too (add the origin to it). Paste the Client ID into Get started in the ⚙️ panel
2. Connect Google: pick your account once, later the page connects by itself. With your own client in Testing mode Google shows "Google hasn't verified this app": press Advanced, then Go to (your app's name), and allow the Sheets access
3. Google Sheet: press Create a spreadsheet, or paste the link of your own. The script writes only to the spreadsheet allowed on its corner panel on Fidelity: a new one asks there once (Allow, or Keep the current one), and the viewer shows a red line until you answer
4. Install [Tampermonkey](https://www.tampermonkey.net/). In Chrome open its extension details, turn on Allow User Scripts and allow the sites `digital.fidelity.com` and `daggerok.github.io`. Open the script link above, press Install, reload the viewer
5. Optional: open Fidelity, press 🔑 in the script's corner panel and save your username and password. The script then logs in by itself when Fidelity asks; a one-time code you type yourself
6. Press 👀 in the navbar: Fidelity opens on Positions, the script reads it and writes the sheet, the viewer reads it from there. While 👀 is on and the market is open (9:30 to 16:00 New York, weekdays), every 10 minutes the Fidelity tab reads Positions and the numbers in the viewer follow the market; opening or reloading a Fidelity page never jumps or refreshes by itself; press 👀 again to stop. For fresh numbers right now reload the viewer (Cmd+R): the Fidelity tab reads Positions, writes what changed to the sheet, and the viewer reads it in a few seconds. When the Fidelity tab shows another page (Summary, Activity), the script opens Positions, reads it and goes back to that page; when it already shows Positions, it presses the page's Refresh Positions and reads

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

- The Positions page keeps Fidelity's own answer (about 100 fields per position) in its grid. A tiny reader in the page copies those rows, no extra request is sent. It reads once when Positions opens and when you press ⬇ on the corner panel; with 👀 on it reads Positions every 10 minutes while the market is open (on Positions with the page's own Refresh Positions button, from another page with a trip to Positions and back) and writes the changes to the sheet at most every 10 minutes (at once when you asked)
- The account list on the left gives the groups (Investment, Retirement) and balances. Under the navbar a panel of the same look holds the page tabs (Summary, Positions) on the left and the time of our last read (As of) on the right. In the viewer the accounts strip sits in the navbar (All accounts on the left, the rest scrolls sideways with ‹ ›) and shows accounts as solid chips and groups as outlined ones, names only (the numbers are on the Balance card), in the middle between the logo and the buttons while they all fit; a click on All accounts or a group folds or unfolds it, a click on an account shows only it, and the checkboxes choose any set (All accounts ticks or clears every account, a group its own accounts)
- Summary cards, titled in the green of the logo: the first one is named after what is shown (All accounts, a group, or the chosen accounts joined by +; the time of our last read sits on the right of the tabs as "As of"), movers by % or $ (the biggest loser at the very bottom), accounts sorted by value or by today's or total P&L in $ or %, upcoming dividends with the expected payout for the shares held (ex-dates until the end of the month by default, MTD, 1M, QTD or 1Q on the right; ⤢ adds the DRIP of each, per account, summed over the accounts still short, with the total to buy), tickers near a 52-week high in green and near a low in red; ⤢ on a card opens its full view big
- Positions table: our own columns first, then Fidelity's (every column of Fidelity's own view is there: quote data, fundamentals, returns, expense ratios and more; the ones beyond your view start hidden, turn them on in the columns window). DRIP and DRIP $: how many shares, or dollars at the last price, to buy so the next dividend of that position buys at least 0.001 share by DRIP (Fidelity reinvests to 3 decimals). A plus is what to buy (rounded up, so it is enough), a minus in green means the next payout already buys 0.001 share or more. Example: DRIP +0.012 and DRIP $ +$5.23 = buy 0.012 shares or $5.23 of them. The sliders icon in the Symbol header opens the columns window: all columns by group with a filter on the left, the chosen ones in order on the right, moved by ≡ (mouse, finger or arrow keys); changes show at once, Default brings the default columns back
- Every table sorts and filters by column, Positions and the ⤢ tables of the cards alike (the table engine of the investments apps). A column knows its type from what it shows: text, number, %, $, date or payment frequency; the small badge next to its name tells which, a click on it sets the next type, Shift+click returns the detected one. A click on a name sorts: text from A to Z first, the rest largest first, payment frequency by payments a year (Monthly, Quarterly, Semi-annually, Annually), empty cells always last
- Under every name sits its filter: a space is AND, a comma is OR, `!` is NOT, `?` is empty. Text: `energy, !tech`, `"real estate"`. Numbers, % and $: `>10 <50`, `10..50`, `>1B`. Dates: `>2026-12-01`, `>Dec-01-2026`, `2026-12` (the whole month), `today..`, `-30d..`. Frequency: `monthly`, `>=quarterly`, `>=4`. It applies as you stop typing or on Enter; ✕ or Esc clears one, Clear next to Symbol clears all. The Symbol filter searches the symbol and the name, the number in it counts the positions left; an account with none left is not shown. Positions filters and types are remembered
- After 20:00 New York of each workday, when the day is posted, the script also reads Fidelity's own daily account values (the data of its Summary balance chart): since each account opened the first time, then the last month. The Balance card draws them for the chosen accounts with periods from 1D to 3Y (the card shows the main ones, the big chart every step: 1D..3D, WTD, 1W..3W, MTD, 1M..11M, QTD, 1Q..3Q, YTD, 1Y..3Y); ⤢ grows the card into a big window, ✕, a click outside or Esc shrinks it back. The change shown is the balance change (deposits are in it), not a return
- Right after that it reads the transactions history of every account (the same read the Activity page makes): the first time month by month since the account's first daily value, then the last 10 days again. That read runs after 20:00 New York and once more after the market opens at 9:30 (not before: nothing new comes overnight); with 👀 on it also reads yesterday and today every 10 minutes of the session and writes the sheet only when something new came. A read missed because the Fidelity tab was closed runs when a Fidelity page opens next. The Income card shows the dividends and interest really received this year, quarter and month next to the plan (received plus what still comes at today's holdings) with a progress bar; until the history is read it shows --
- Then, once a day, the beta of every holding, all from Fidelity and read only: stocks from its stock screener (5Y beta, else 3Y, else 1Y), ETFs from its ETF screener (3Y, Morningstar), the rest (mutual funds, young ETFs) computed from Fidelity's own price history the way Fidelity defines beta: total monthly returns against SPY over the last 36 months (daily over the last year when the history is shorter); cash is 0. The Accounts card shows each account's Beta on the right: the average of its positions' betas weighted by their value (the hint says where the parts came from and how much of the value has a beta when not all)
- 🔔 Notifications (off by default; ⚙️ Notifications in the viewer or 🔔 on the Fidelity panel, one switch): when on, the script gives one notification each time it finishes a job (a sync, the daily values, the transactions, the betas) or hits an error: a popup in the viewer when it is on screen, a Tampermonkey notification from the browser otherwise. The popup is in the palette's color for a success (closes by itself), red for an error (stays until ✕)
- Only the Fidelity tab writes the sheet, with the Google token the viewer hands over, and only the data sets that changed: summary (accounts and daily balances), positions, transactions, betas. Then it marks them in `fidelity_updates` and signals the viewer, which reads just those sets back. No signal (another computer, no script): the viewer checks `fidelity_updates` every 10 minutes and whenever its tab comes back into view. Without a token the writes wait until the viewer is open and connected
- ⚙️ Settings -> 🎨 Color palette recolours the whole app (logo, titles, chips, buttons; gains and losses stay green and red): Fidelity green (the default, the family of twitter, youtube and fundamentals), Indigo Desk (gex) or Ocean blue (investments, ETFs, Stocks)
- In the header of ⚙️ Settings, right after its title: Reset view (theme, palette, language, account, tab, sort, filters, columns, panels; the setup stays) and Full reset, off until its switch is ticked (also the Google setup and the cached data; the script forgets its data and Google token, the Fidelity login stays under 🔑)
- What the browser keeps: the public Client ID and the spreadsheet id (localStorage), the last data (IndexedDB), your choices: account, tab, sort, filters, columns, theme, language. The Google token and its expiry stay in localStorage until it expires. The Fidelity login, if saved, lives only in the script's Tampermonkey storage

Sheet tabs:

| Tab | What | Written |
|-----|------|---------|
| `fidelity_accounts` | one row per account: group, type, balance, gains, cost basis, income, cash | rewritten when changed |
| `fidelity_positions` | positions now, the main columns plus every field as JSON | rewritten |
| `fidelity_balances_daily` | balance history, one row per day and account, since each account opened | added and updated |
| `fidelity_positions_all` | every field of every position as its own column; new fields add columns | rewritten |
| `fidelity_transactions` | the transactions history of every account | rewritten after its daily read |
| `fidelity_transactions_synced` | how far each account's transactions were read | rewritten with it |
| `fidelity_betas` | the beta of each held symbol, its source and months behind it | rewritten after its daily run |
| `fidelity_updates` | when each data set (summary, positions, transactions, betas) was last written | updated after every write |

## When Fidelity changes something

Everything this app relies on at Fidelity is listed in `src/shared/contract.ts`: each entry says what we expect (a page address, a selector, the fields of a row, the shape of an answer) and which of our files use it. The script checks the real data against it on every read; a broken entry shows on the corner panel and under ⚙️ in the viewer as `✗ grid.fields: POSITION.curVal is gone (fix in src/shared/parse.ts)`. The tests run the same checks on recorded shapes and on broken copies

## Safety

- Read only: the script never trades, transfers or submits anything on Fidelity; besides the pages it runs on it asks only Fidelity's daily values, transactions, screeners and price history, each through a fixed list of addresses; the only form it fills is the login, with your saved login, only on a page with exactly one password field and a username, at most once per 30 minutes, and it stops for good when the password is refused. A sync asked from the viewer is taken at most once a minute
- Your data goes from your browser to your Google Sheet and nowhere else: other pages on daggerok.github.io share the viewer's storage, so the script keeps the allowed spreadsheet in its own Tampermonkey storage and asks on the Fidelity panel before writing to any other one (Full reset in the viewer does not change that). The repo holds no account data: tests use made-up numbers

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
