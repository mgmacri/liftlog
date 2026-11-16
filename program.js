// Starter workouts, seeded on first load. After that the app owns the data
// (stored locally) and you edit everything in-app.
//
// Program: 5-day Upper / Lower / Pull / Push / Lower, machine-first, for lean mass.
// Mon Upper · Tue Lower A · Wed Home · Thu Pull · Fri Push · Sat Lower B · Sun off.
//
// Per exercise:
//   name  - what you call it
//   sets  - number of sets
//   reps  - target reps per set (top of the range; see note)
//   note  - rep range and cues, shown under the name while running
//   rest  - rest-timer seconds after a logged set (default 120)
//   weight- optional starting weight in lb (left blank: machines vary by gym)
//   mode  - 'straight' (default) | 'ramp' | 'pyramid'
//   step  - reps added/removed per set in ramp/pyramid (default 2)
//
// Progression: double progression. When every set hits the top of the range
// with 1-2 reps in reserve, add weight. Isolation: last set to failure.

export const SEED = [
  {
    name: 'Upper (Mon)',
    exercises: [
      { name: 'Converging machine chest press', sets: 3, reps: 10, note: '6–10 · 1–2 RIR', rest: 150 },
      { name: 'Chest-supported row (elbows ~45°)', sets: 3, reps: 12, note: '8–12', rest: 150 },
      { name: 'Lat pulldown, neutral/medium grip', sets: 3, reps: 12, note: '8–12', rest: 150 },
      { name: 'Machine shoulder press', sets: 3, reps: 10, note: '8–10', rest: 150 },
      { name: 'Behind-the-back cable lateral raise (per side)', sets: 4, reps: 15, note: '12–15 · last set to failure', rest: 90 },
      { name: 'Cable serratus punch (per side)', sets: 3, reps: 15, note: '12–15 · reach around the ribs, 1 s hold', rest: 90 },
      { name: 'Incline DB curl', sets: 3, reps: 12, note: '10–12 · superset with next', rest: 30 },
      { name: 'Overhead cable triceps extension', sets: 3, reps: 15, note: '10–15 · superset with previous', rest: 90 },
    ],
  },
  {
    name: 'Lower A — quads (Tue)',
    exercises: [
      { name: 'Hack or pendulum squat', sets: 3, reps: 10, note: '6–10 · deep', rest: 180 },
      { name: 'Seated leg curl', sets: 3, reps: 12, note: '8–12', rest: 120 },
      { name: 'Leg press, feet low', sets: 3, reps: 15, note: '10–15', rest: 150 },
      { name: 'Leg extension, seat reclined', sets: 3, reps: 15, note: '12–15 · last set to failure', rest: 90 },
      { name: 'Adductor machine', sets: 2, reps: 15, note: '12–15', rest: 90 },
      { name: 'Standing calf raise', sets: 4, reps: 15, note: '10–15 · 2 s pause in the stretch', rest: 90 },
      { name: 'Cable crunch', sets: 3, reps: 15, note: '10–15', rest: 60 },
    ],
  },
  {
    name: 'Home (Wed)',
    exercises: [
      { name: 'Band push-up plus', sets: 3, reps: 15, note: '12–15 · full protraction at the top', rest: 60 },
      { name: 'Back extension (hyper)', sets: 2, reps: 15, note: '12–15', rest: 60 },
      { name: 'Band external rotation (per side)', sets: 2, reps: 20, note: '15–20', rest: 45 },
      { name: 'Slant board + mobility (minutes)', sets: 1, reps: 15, note: '15–20 min', rest: 30 },
    ],
  },
  {
    name: 'Pull (Thu)',
    exercises: [
      { name: 'Machine high row', sets: 3, reps: 12, note: '8–12', rest: 150 },
      { name: 'Single-arm cable row (per side)', sets: 3, reps: 12, note: '10–12 · let the shoulder reach forward', rest: 120 },
      { name: 'Wide-elbow machine row', sets: 3, reps: 12, note: '10–12 · upper back', rest: 120 },
      { name: 'Reverse pec deck', sets: 4, reps: 20, note: '15–20 · last set to failure', rest: 60 },
      { name: 'Shrug machine', sets: 2, reps: 15, note: '10–15', rest: 90 },
      { name: 'Bayesian cable curl (per side)', sets: 3, reps: 12, note: '10–12', rest: 90 },
      { name: 'DB hammer curl', sets: 2, reps: 12, note: '10–12', rest: 60 },
    ],
  },
  {
    name: 'Push (Fri)',
    exercises: [
      { name: 'Incline machine press (30°) or Smith incline', sets: 3, reps: 10, note: '6–10 · 1–2 RIR', rest: 180 },
      { name: 'Pec deck or cable fly', sets: 3, reps: 15, note: '10–15 · stop short of end range', rest: 90 },
      { name: 'Landmine press (per side)', sets: 3, reps: 12, note: '10–12 · reach at the top', rest: 120 },
      { name: 'Machine lateral raise', sets: 4, reps: 20, note: '12–20 · last set to failure', rest: 60 },
      { name: 'Overhead cable extension', sets: 2, reps: 15, note: '12–15', rest: 90 },
      { name: 'Triceps pushdown', sets: 2, reps: 15, note: '12–15', rest: 60 },
    ],
  },
  {
    name: 'Lower B — hams/glutes (Sat)',
    exercises: [
      { name: 'Seated leg curl', sets: 3, reps: 12, note: '8–12', rest: 120 },
      { name: 'DB RDL or loaded 45° back extension', sets: 3, reps: 12, note: '8–12 · 2 RIR', rest: 150 },
      { name: 'Leg press, feet high and wide', sets: 3, reps: 15, note: '10–15', rest: 150 },
      { name: 'Leg extension', sets: 2, reps: 15, note: '12–15', rest: 90 },
      { name: 'Adductor machine', sets: 2, reps: 15, note: '12–15', rest: 90 },
      { name: 'Seated calf raise', sets: 4, reps: 20, note: '12–20', rest: 60 },
      { name: 'Ab wheel', sets: 3, reps: 12, note: '8–12', rest: 90 },
    ],
  },
];
