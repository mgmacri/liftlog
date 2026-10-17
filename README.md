# LiftLog

StrongLifts-style logger for the 12-week recomp program. Static site for GitHub Pages; the training log is one JSON file in a GitHub repo.

## Deploy (GitHub Pages)

1. Create a public repo, e.g. `liftlog`, and push these files to `main` at the repo root.
2. Repo → Settings → Pages → Source: Deploy from a branch → `main` / root.
3. Open `https://<you>.github.io/liftlog/` on the phone → Share → Add to Home Screen.

## Data file (GitHub sync)

The site is public, so keep the log in a separate private repo.

1. Create a private repo, e.g. `liftlog-data` (can be empty; the app creates `liftlog.json`).
2. GitHub → Settings → Developer settings → Fine-grained tokens → Generate:
   - Repository access: only `liftlog-data`
   - Permissions: Contents → Read and write
   - Expiry: your call (90 days is a reasonable default)
3. In the app: Settings → GitHub sync → owner, repo `liftlog-data`, branch `main`, path `liftlog.json`, token → Save and connect.

The token lives only in that device's localStorage and is never written into the JSON. Every finished workout, deletion, offset change or applied adjustment commits the whole log. Sets mid-workout save locally only. Two devices merge by workout id.

Export/Import JSON in Settings works without GitHub.

## How it maps to StrongLifts

| StrongLifts | LiftLog |
| --- | --- |
| Follows A/B days | Fixed 7-day cycle from the start date (any weekday): Upper A, Lower A, rest, Push, Pull, Lower B, rest. Today shows that day's session; no picking or skipping |
| Tap set circle: target, then count down reps | Same. AMRAP (week 12) prompts for reps |
| Auto-increase on success | Main lifts: periodization table + block offsets. Accessories: double progression, top of range on every set → +inc |
| 3 failures → deload 10% | Accessories: 3 sessions below range → deload 10% suggestion. Main lifts: block rules below |
| Rest timer, longer after fail | 3 min / 5 min after fail / 90 s accessory, beep + vibrate (vibrate not on iOS) |
| Warm-up and plate calculator | Main lifts; plates exclude 35 and 2.5, editable in Settings |
| History, progress charts | History tab; e1RM chart per main lift |

## Failing vs program adjusting

Each exercise logs last-set RIR, and failed sets ask why (too heavy, fatigue, poor sleep, symptom flare, joint pain, technique, cut short). Insights splits failures into program-side (load) and you-side (recovery, technique), and proposes one-tap adjustments:

- Week 3/7 last set RIR 3+ on a clean session → +10 lb to the next block.
- Two most recent loading sessions in a block failed as "too heavy" → −10 lb for the rest of that block.
- 2+ failed loading sessions in a block → −10 lb next block, unless most were recovery reasons, in which case it says to hold the load.
- "−10 lb today" on a main lift is the in-session drop for a first set that is too hard.

The start date is set in `program.js` (currently Fri Oct 16, 2026); picking a date in Settings overrides it on that device. Edit `program.js` to change exercises, ranges, increments or the weeks table.
