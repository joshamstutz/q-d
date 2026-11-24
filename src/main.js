import "./style.css";
import { supabase } from "./supabase.js";
import { APP_NAME, BAND_NAME } from "./setlist.js";

const app = document.querySelector("#app");
let songs = [];

// --- voter identity: a random ID saved on this phone ---
function getVoterId() {
    let id = localStorage.getItem("qd_voter");
    if (!id) {
        id = crypto.randomUUID
            ? crypto.randomUUID()
            : Date.now() + "-" + Math.random().toString(16).slice(2);
        localStorage.setItem("qd_voter", id);
    }
    return id;
}
const voterId = getVoterId();
let balance = 0;
let busy = false;

async function loadBalance() {
    const res = await fetch(`/api/balance?voter=${voterId}`);
    if (res.ok) {
        balance = (await res.json()).balance;
        render();
    }
}

async function act(kind, song) {
    if (busy) return;
    busy = true;
    try {
        const res = await fetch("/api/vote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ voter: voterId, song, kind }),
        });
        const data = await res.json();
        if (!res.ok) alert(data.error || "Something went wrong");
        else {
            balance = data.balance;
            render();
        }
    } finally {
        busy = false;
    }
}

// Makes sure song text can't be treated as HTML.
const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));

// Who plays next: the most recently boosted song wins.
// If nobody has paid to boost, the most-voted song wins.
function pickNext() {
    const boosted = songs
        .filter((s) => s.boosted_at)
        .sort((a, b) => new Date(b.boosted_at) - new Date(a.boosted_at));
    return boosted[0] ?? songs[0];
}

function render() {
    if (!songs.length) {
        app.innerHTML = `<p class="muted">Loading…</p>`;
        return;
    }

    const next = pickNext();
    const rest = songs.filter((s) => s.id !== next.id);
    const max = Math.max(1, ...songs.map((s) => s.votes));

    app.innerHTML = `
    <div class="topbar">
      <h1>${esc(APP_NAME)}</h1>
      <div class="chip">${balance} votes</div>
    </div>
    <div class="muted">${esc(BAND_NAME)}</div>

    <div class="hero">
      <div class="label">NEXT UP · ${next.votes} VOTES</div>
      <div class="title">${esc(next.title)}</div>
      <div class="sub">${esc(next.artist)}</div>
    </div>

    <div class="muted">THE CROWD IS BIDDING ON</div>

    ${rest.map((s) => `
      <div class="card">
        <div class="row">
          <div>
            <div class="name">${esc(s.title)}</div>
            <div class="muted">${esc(s.artist)}</div>
          </div>
          <div class="total">${s.votes}</div>
        </div>
        <div class="bar"><div style="width:${(s.votes / max) * 100}%"></div></div>
        <div class="buttons">
          <button data-action="vote" data-id="${esc(s.id)}">Vote</button>
          <button class="secondary" data-action="boost" data-id="${esc(s.id)}">Play next · 10</button>        
        </div>
      </div>
    `).join("")}

    <button class="buy" data-action="buy">Buy more votes</button>
  `;
}

// One click listener for every button on the page.
app.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === "buy") alert("Payments coming in the next step!");
    else act(action, id); // "vote" or "boost"
});

async function load() {
    const { data, error } = await supabase
        .from("songs")
        .select("*")
        .order("votes", { ascending: false })
        .order("title", { ascending: true });

    if (error) {
        app.textContent = "Error: " + error.message;
        return;
    }
    songs = data;
    render();
}

load();
loadBalance();

supabase
    .channel("songs-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "songs" }, load)
    .subscribe();