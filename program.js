// Starter workouts, seeded on first load. After that the app owns the data
// (stored locally) and you edit everything in-app. Delete localStorage to reseed.
//
// Per exercise:
//   name  - what you call it
//   sets  - number of sets
//   reps  - reps for set 1 (also the flat value in 'straight' mode)
//   weight- optional starting weight in lb (editable while running)
//   mode  - 'straight' (default) | 'ramp' | 'pyramid'
//   step  - reps added/removed per set in ramp/pyramid (default 2)

export const SEED = [
  {
    name: 'Upper A',
    exercises: [
      { name: 'Bench press', sets: 4, reps: 8, weight: 145 },
      { name: 'Chest-supported DB row', sets: 3, reps: 12 },
      { name: 'Lat pulldown, wide', sets: 3, reps: 12 },
      { name: 'Face pull, long rope', sets: 3, reps: 20 },
      { name: 'EZ-bar curl', sets: 3, reps: 12 },
      { name: 'Triceps pushdown', sets: 3, reps: 15 },
    ],
  },
  {
    name: 'Lower A',
    exercises: [
      { name: 'Back squat', sets: 4, reps: 8, weight: 145 },
      { name: 'Romanian deadlift', sets: 3, reps: 10 },
      { name: 'DB Bulgarian split squat (per side)', sets: 3, reps: 12 },
      { name: 'Nordic curl (eccentric)', sets: 3, reps: 8 },
      { name: 'Standing calf raise', sets: 4, reps: 15 },
      { name: 'Cable crunch', sets: 3, reps: 15 },
    ],
  },
  {
    name: 'Push',
    exercises: [
      { name: 'Standing overhead press', sets: 4, reps: 8, weight: 95 },
      { name: 'Incline press', sets: 3, reps: 10 },
      { name: 'DB lateral raise', sets: 4, reps: 20 },
      { name: 'Overhead rope extension', sets: 3, reps: 15 },
      { name: 'Face pull, long rope', sets: 3, reps: 20 },
      { name: 'Cable external rotation (per side)', sets: 2, reps: 15 },
    ],
  },
  {
    name: 'Pull',
    exercises: [
      { name: 'Barbell row', sets: 4, reps: 8, weight: 95 },
      { name: 'Lat pulldown, narrow', sets: 3, reps: 12 },
      { name: 'Seated cable row (floor)', sets: 3, reps: 12 },
      { name: 'DB rear delt fly', sets: 3, reps: 20 },
      { name: 'DB lateral raise (high rep)', sets: 3, reps: 20 },
      { name: 'Prone Y-raise', sets: 2, reps: 15 },
      { name: 'DB hammer curl', sets: 3, reps: 12 },
      { name: 'Incline DB curl', sets: 2, reps: 15 },
    ],
  },
  {
    name: 'Lower B',
    exercises: [
      { name: 'Deadlift', sets: 3, reps: 6, weight: 265 },
      { name: 'Paused back squat (2 s)', sets: 3, reps: 6, weight: 135 },
      { name: 'DB reverse lunge (per side)', sets: 3, reps: 10 },
      { name: 'Single-leg calf raise (per side)', sets: 4, reps: 15 },
      { name: 'Cable Pallof press (per side)', sets: 3, reps: 10 },
    ],
  },
];
