import { PROGRAM, REASONS } from './program.js';

// ---------- storage ----------
const LS_KEY = 'liftlog.v1';
const GH_KEY = 'liftlog.gh'; // kept separate so the token is never written to the JSON log
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>\