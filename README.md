# LiftLog

StrongLifts-style set logger. Static site for GitHub Pages; data lives in the browser's localStorage, with optional GitHub Gist sync (see `SYNC-SETUP.md`).

## Program

5-day machine-first split for lean mass, defined in `program.js`:

| Day | Session |
| --- | --- |
| Mon | Upper |
| Tue | Lower A (quads) |
| Wed | Home (serratus, back extension, rotator cuff, mobility) |
| Thu | Pull |
| Fri | Push |
| Sat | Lower B (hamstrings/glutes) |
| Sun | Off |

- Target reps are the top of each exercise's range; the range and cues show under the name while running.
- Double progression: when every set hits the top of the range with 1–2 reps in reserve, add weight. Isolation work takes the last set to failure.
- Each exercise has its own rest timer (90 s isolation to 180 s for the main lifts), editable in-app.
- Weights start blank because machines vary by gym. Note the machine and seat settings in the exercise note.

## Using it

- Tap a set to log the target reps, tap again to count down, long-press to zero it. Logging a set starts that exercise's rest timer.
- Edit changes sets, reps, rep mode (straight, ramp, pyramid), weight, rest and note.
- Export CSV writes one row per set.

## Changing the seed

`program.js` only seeds a device that has no data. To push a new program to devices that already have data, bump `LS_KEY` in `app.js` (and add the old key to `LEGACY_KEYS` so it gets wiped), change `SEED_PREFIX`, and add the old seed ids to `OLD_SEED_IDS` so Gist sync never brings them back. Bump `CACHE` in `sw.js` too.

## Deploy (GitHub Pages)

Repo → Settings → Pages → Source: `main` / root. Open `https://<you>.github.io/liftlog/` on the phone → Share → Add to Home Screen.
