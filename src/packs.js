// src/packs.js
// Edit prices here. cents: 500 = $5.00
export const PACKS = [
    { id: "p5",  qs: 5,  cents: 500,  label: "Try it" },
    { id: "p10", qs: 10, cents: 900,  label: "Most popular" },
    { id: "p25", qs: 25, cents: 2000, label: "Best value" },
];

// What things cost in q's. Display only: the real prices live in the SQL functions.
export const COSTS = { queue: 5, asap: 10, upgrade: 5 };