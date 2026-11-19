# Pounce

A to-do list for your goals and habits, with a pet that nags you until you do them. Prototype.

**Try it:** https://r354306-cloud.github.io/pounce/

## What it does

- **Today.** One page that looks like a legal pad. Everything you said you would do today, in order, with a check circle in the margin.
- **Goals.** The long game. Each big goal breaks down into daily steps (habits) and one time steps (to-dos with a due date).
- **Your pet.** A cat or dog that lives at the top of the list and comments on how the day is going. Pick how annoying it gets: Chill, Pushy, or Unhinged.
- **Lock screen nags.** Real push notifications, even when the app is closed, until the list is clear.
- **Streaks.** A daily streak, a streak per habit, and a calendar of how each day went.
- **Finds.** Every morning the pet goes hunting for whatever you told it to look for (right now: summer internships) and leaves the results in a feed. One tap turns a find into a step on your list.

## Put it on an iPhone

1. Open the link above in Safari.
2. Tap Share, then Add to Home Screen.
3. Open Pounce from the Home Screen. In the pet tab, turn on lock screen nags.

It runs full screen like a normal app and works without signal.

## How it is built

No framework and no build step. Edit a file, refresh.

| File | What it is |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The whole app |
| `sw.js`, `manifest.webmanifest` | Makes it installable, work offline, and receive pushes |
| `config.js` | The backend URL. Empty means the app only saves on the phone |
| `Code.gs` | The backend. A Google Apps Script web app that lives inside a Google Sheet |
| `finds.json` | Starter finds, used until the backend has its own |

### The backend (Google Drive)

`Code.gs` is bound to a Google Sheet called **Pounce Backend**. The sheet is the database:

- **Users**: one row per person. Their list, streak, nag level, and what the pet is hunting for.
- **Activity**: a readable log of every check-off.
- **Nags**: every nag that went out and how many phones it reached.
- **Finds**: the hunt results. Add a row here and it shows up in the app.

A timer runs `nagTick` every 15 minutes. It looks at who still has things open today and sends a Web Push to their phone. The push keys are made inside the script the first time it runs and never leave it.

Heads up: whoever owns the sheet can read the Activity tab, so they can see what got checked off and when.

### Setting up the backend from scratch

1. Make a Google Sheet. Extensions, then Apps Script. Paste in `Code.gs`.
2. Run `setup` once and approve the permissions.
3. Deploy, New deployment, Web app. Execute as: Me. Who has access: Anyone.
4. Copy the `/exec` URL into `config.js`.

### The daily hunt

A scheduled task reads the "hunting for" column in the Users tab every morning, searches for new matches, and appends them to the Finds tab. The backend notices new rows and sends a push.
