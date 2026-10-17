// Program definition. Edit this file to change the plan; the app reads everything from here.
// Loads are lb. Plates exclude 35 and 2.5, so the smallest barbell jump is 10 lb.

export const PROGRAM = {
  name: 'Recomp 12-week',
  startDate: '2026-10-16', // day 1 of week 1 (any weekday). Used unless a date is picked in Settings.
  bar: 45,
  plates: [45, 25, 10, 5],

  // 7-day cycle counted from the start date, whatever weekday that is. null = rest day.
  cycle: ['upperA', 'lowerA', null, 'push', 'pull', 'lowerB', null],

  // Main lifts. sb = squat and bench (same numbers), dl = deadlift. [sets, reps, weight]
  weeks: [
    { sb: [4, 8, 145], dl: [3, 6, 265], rir: 3 },
    { sb: [4, 8, 155], dl: [3, 6, 285], rir: 2 },
    { sb: [4, 8, 165], dl: [3, 6, 305], rir: 1 },
    { sb: [3, 5, 135], dl: [3, 3, 225], rir: 4, deload: true },
    { sb: [4, 6, 165], dl: [3, 5, 305], rir: 3 },
    { sb: [4, 6, 175], dl: [3, 5, 325], rir: 2 },
    { sb: [4, 6, 185], dl: [3, 5, 345], rir: 1 },
    { sb: [3, 5, 135], dl: [3, 3, 225], rir: 4, deload: true },
    { sb: [4, 4, 175], dl: [3, 3, 335], rir: 2 },
    { sb: [4, 4, 185], dl: [3, 3, 355], rir: 1.5 },
    { sb: [4, 4, 195], dl: [3, 3, 365], rir: 1 },
    { sb: [1, 'AMRAP', 185], dl: [1, 'AMRAP', 335], rir: 1, test: true },
  ],

  // Exercise fields:
  //   type 'main' -> weight from the weeks table (lift: squat | bench | deadlift)
  //   type 'acc'  -> double progression: hit `hi` on every set -> add `inc` next session
  //   barbell: show plate math; bw: bodyweight, no load; perSide: reps are per leg/arm; start: first-session weight
  sessions: {
    upperA: {
      name: 'Upper A',
      exercises: [
        { key: 'bench', name: 'Bench press', type: 'main', lift: 'bench', barbell: true },
        { key: 'csRow', name: 'Chest-supported DB row', type: 'acc', sets: 3, lo: 8, hi: 12, inc: 5 },
        { key: 'pulldownWide', name: 'Lat pulldown, wide', type: 'acc', sets: 3, lo: 10, hi: 12, inc: 5 },
        { key: 'facePull', name: 'Face pull, long rope', type: 'acc', sets: 3, lo: 15, hi: 20, inc: 5 },
        { key: 'ezCurl', name: 'EZ-bar curl', type: 'acc', sets: 3, lo: 8, hi: 12, inc: 5 },
        { key: 'pushdown', name: 'Triceps pushdown', type: 'acc', sets: 3, lo: 10, hi: 15, inc: 5 },
      ],
    },
    lowerA: {
      name: 'Lower A',
      exercises: [
        { key: 'squat', name: 'Back squat', type: 'main', lift: 'squat', barbell: true },
        { key: 'rdl', name: 'Romanian deadlift', type: 'acc', sets: 3, lo: 8, hi: 10, inc: 10, barbell: true },
        { key: 'bss', name: 'DB Bulgarian split squat', type: 'acc', sets: 3, lo: 8, hi: 12, inc: 5, perSide: true },
        { key: 'nordic', name: 'Nordic curl (eccentric)', type: 'acc', sets: 3, lo: 5, hi: 8, inc: 0, bw: true },
        { key: 'calfStand', name: 'Standing calf raise', type: 'acc', sets: 4, lo: 10, hi: 15, inc: 10 },
        { key: 'cableCrunch', name: 'Cable crunch', type: 'acc', sets: 3, lo: 10, hi: 15, inc: 5 },
      ],
    },
    push: {
      name: 'Push',
      exercises: [
        { key: 'ohp', name: 'Standing overhead press', type: 'acc', sets: 4, lo: 6, hi: 8, inc: 10, barbell: true, start: 95 },
        { key: 'incline', name: 'Incline press', type: 'acc', sets: 3, lo: 8, hi: 10, inc: 5 },
        { key: 'latRaise', name: 'DB lateral raise', type: 'acc', sets: 4, lo: 12, hi: 20, inc: 5 },
        { key: 'ohExt', name: 'Overhead rope extension', type: 'acc', sets: 3, lo: 10, hi: 15, inc: 5 },
        { key: 'facePull', name: 'Face pull, long rope', type: 'acc', sets: 3, lo: 15, hi: 20, inc: 5 },
        { key: 'cableER', name: 'Cable external rotation', type: 'acc', sets: 2, lo: 12, hi: 15, inc: 5, perSide: true },
      ],
    },
    pull: {
      name: 'Pull',
      exercises: [
        { key: 'bbRow', name: 'Barbell row', type: 'acc', sets: 4, lo: 6, hi: 8, inc: 10, barbell: true, start: 95 },
        { key: 'pulldownNarrow', name: 'Lat pulldown, narrow', type: 'acc', sets: 3, lo: 8, hi: 12, inc: 5 },
        { key: 'seatedRow', name: 'Seated cable row (floor)', type: 'acc', sets: 3, lo: 10, hi: 12, inc: 5 },
        { key: 'rearFly', name: 'DB rear delt fly', type: 'acc', sets: 3, lo: 12, hi: 20, inc: 5 },
        { key: 'latRaiseHi', name: 'DB lateral raise (high rep)', type: 'acc', sets: 3, lo: 15, hi: 20, inc: 5 },
        { key: 'yRaise', name: 'Prone Y-raise', type: 'acc', sets: 2, lo: 12, hi: 15, inc: 5 },
        { key: 'hammer', name: 'DB hammer curl', type: 'acc', sets: 3, lo: 10, hi: 12, inc: 5 },
        { key: 'inclineCurl', name: 'Incline DB curl', type: 'acc', sets: 2, lo: 10, hi: 15, inc: 5 },
      ],
    },
    lowerB: {
      name: 'Lower B',
      exercises: [
        { key: 'deadlift', name: 'Deadlift', type: 'main', lift: 'deadlift', barbell: true },
        { key: 'pausedSquat', name: 'Paused back squat (2 s)', type: 'acc', sets: 3, lo: 6, hi: 6, inc: 10, barbell: true, start: 135 },
        { key: 'revLunge', name: 'DB reverse lunge', type: 'acc', sets: 3, lo: 10, hi: 10, inc: 5, perSide: true },
        { key: 'calfSingle', name: 'Single-leg calf raise', type: 'acc', sets: 4, lo: 12, hi: 15, inc: 5, perSide: true },
        { key: 'pallof', name: 'Cable Pallof press', type: 'acc', sets: 3, lo: 10, hi: 10, inc: 5, perSide: true },
      ],
    },
  },
};

// Failure reasons. `side` decides who adjusts: the program (load) or you (recovery/technique).
export const REASONS = [
  { key: 'heavy', label: 'Too heavy', side: 'program' },
  { key: 'fatigue', label: 'Fatigue', side: 'recovery' },
  { key: 'sleep', label: 'Poor sleep', side: 'recovery' },
  { key: 'symptoms', label: 'Symptom flare', side: 'recovery' },
  { key: 'pain', label: 'Joint pain', side: 'recovery' },
  { key: 'technique', label: 'Technique', side: 'technique' },
  { key: 'time', label: 'Cut short', side: 'recovery' },
];
