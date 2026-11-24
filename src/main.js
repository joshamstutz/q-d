import "./style.css";
import { supabase } from "./supabase.js";
import { APP_NAME, BAND_NAME } from "./setlist.js";
import { PACKS, COSTS } from "./packs.js";

const app = document.querySelector("#app");
const sheetRoot = document.querySelector("#sheet");
const toasts = document.querySelector("#toasts");

let songs = [];
let queue = [];
let nowPlayingId = null;
let balance = 0;
let busy = false;
let flashId = null;
let lastNow = null;
let lastUpNext = null;
const barWidths = {};

// Makes sure song text can't be treated as HTML.
const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));

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

// Songs this phone already voted for (just for the "Voted" label; the server enforces it).
const voted = new Set(JSON.parse(localStorage.getItem("qd_voted") || "[]"));
const saveVoted = () => localStorage.setItem("qd_voted", JSON.stringify([...voted]));

// --- little pop-up messages ---
function toast(message, type = "ok") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = message;
    toasts.appendChild(el);
    setTimeout(() => el.remove(), 2700);
}

// --- queue order: ASAP first (earliest paid first), then regular queue (earliest first) ---
const songById = (id) => songs.find((s) => s.id === id);

function orderedQueue() {
    const asap = queue.filter((q) => q.kind === "asap")
        .sort((a, b) => new Date(a.asap_at) - new Date(b.asap_at));
    const regular = queue.filter((q) => q.kind === "queue")
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return [...asap, ...regular];
}

// --- drawing the page ---
function heroHtml(label, song, entering) {
    return `
    <div class="hero ${entering ? "enter" : ""}">
      <div class="label">${esc(label)}</div>
      <div class="title">${esc(song.title)}</div>
      <div class="sub">${esc(song.artist)}</div>
    </div>`;
}

function render() {
    if (!songs.length) {
        app.innerHTML = `<p class="muted">Loading…</p>`;
        return;
    }

    const flash = flashId;
    flashId = null;

    const line = orderedQueue();
    const queuedIds = new Set(line.map((q) => q.song_id));
    const playing = songById(nowPlayingId);
    const first = line[0];
    const rest = line.slice(1);
    const pool = songs.filter((s) => !queuedIds.has(s.id) && s.id !== nowPlayingId);
    const max = Math.max(1, ...pool.map((s) => s.votes));

    // Now playing
    const nowEnter = playing && playing.id !== lastNow;
    lastNow = playing ? playing.id : null;
    const nowHtml = playing
        ? `<div class="now ${nowEnter ? "enter" : ""}">
         <div class="eq"><i></i><i></i><i></i></div>
         <div>
           <div class="label">NOW PLAYING</div>
           <div class="name big">${esc(playing.title)}</div>
           <div class="muted">${esc(playing.artist)}</div>
         </div>
       </div>`
        : `<div class="now idle"><div class="muted">Waiting for the band to start…</div></div>`;

    // Up next
    let upNextSong = null;
    let upNextLabel = "";
    if (first) {
        upNextSong = songById(first.song_id);
        upNextLabel = first.kind === "asap" ? "UP NEXT · ASAP" : "UP NEXT";
    } else if (pool[0]) {
        upNextSong = pool[0];
        upNextLabel = `CROWD PICK · ${pool[0].votes} VOTES`;
    }
    const upNextEnter = upNextSong && upNextSong.id !== lastUpNext;
    lastUpNext = upNextSong ? upNextSong.id : null;

    const queueRows = rest.map((q, i) => {
        const s = songById(q.song_id);
        if (!s) return "";
        return `
      <div class="card qrow ${flash === s.id ? "flash" : ""}">
        <div class="pos">${i + 2}</div>
        <div class="grow">
          <div class="name">${esc(s.title)}</div>
          <div class="muted">${esc(s.artist)}</div>
        </div>
        ${q.kind === "asap"
            ? `<span class="tag">ASAP</span>`
            : `<button class="small secondary" data-action="asap" data-id="${esc(s.id)}">ASAP · ${COSTS.upgrade}</button>`}
      </div>`;
    }).join("");

    const songCards = pool.map((s) => `
    <div class="card ${flash === s.id ? "flash" : ""}">
      <div class="row">
        <div>
          <div class="name">${esc(s.title)}</div>
          <div class="muted">${esc(s.artist)}</div>
        </div>
        <div class="total">${s.votes} ${s.votes === 1 ? "vote" : "votes"}</div>
      </div>
      <div class="bar"><div class="fill" data-id="${esc(s.id)}" data-w="${(s.votes / max) * 100}" style="width:${barWidths[s.id] ?? (s.votes / max) * 100}%"></div></div>
      <div class="buttons">
        <button class="${voted.has(s.id) ? "secondary" : ""}" data-action="vote" data-id="${esc(s.id)}">${voted.has(s.id) ? "Voted ✓" : "Vote"}</button>
        <button class="secondary" data-action="queue" data-id="${esc(s.id)}">Queue · ${COSTS.queue}</button>
        <button class="secondary" data-action="asap" data-id="${esc(s.id)}">ASAP · ${COSTS.asap}</button>
      </div>
    </div>`).join("");

    app.innerHTML = `
    <div class="topbar">
      <h1>${esc(APP_NAME)}</h1>
      <button class="chip" data-action="buy">${balance} q's +</button>
    </div>
    <div class="muted">${esc(BAND_NAME)}</div>

    ${nowHtml}
    ${upNextSong ? heroHtml(upNextLabel, upNextSong, upNextEnter) : ""}

    ${rest.length ? `<div class="muted">IN THE QUEUE</div>${queueRows}` : ""}

    <div class="muted">VOTE FREE · QUEUE OR ASAP WITH Q'S</div>
    ${songCards || `<p class="muted">Every song is queued!</p>`}

    <button class="buy" data-action="buy">Get more q's</button>
  `;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        app.querySelectorAll(".fill").forEach((el) => {
            el.style.width = el.dataset.w + "%";
            barWidths[el.dataset.id] = Number(el.dataset.w);
        });
    }));
}

// --- buy sheet (lives outside #app so it isn't redrawn) ---
function openSheet() {
    sheetRoot.innerHTML = `
    <div class="overlay" data-action="close-overlay">
      <div class="sheet">
        <h2>Get q's</h2>
        <div class="muted">Queue a song for ${COSTS.queue} q's, or play it ASAP for ${COSTS.asap}. Your q's are saved on this phone, so don't clear your browser data.</div>
        ${PACKS.map((p) => `
          <button class="pack" data-action="pack" data-id="${esc(p.id)}">
            <span><b>${p.qs} q's</b><br><small>${esc(p.label)}</small></span>
            <b>$${(p.cents / 100).toFixed(2).replace(".00", "")}</b>
          </button>
        `).join("")}
        <button class="secondary" data-action="close">Not now</button>
      </div>
    </div>`;
}
const closeSheet = () => { sheetRoot.innerHTML = ""; };

// --- talking to the server ---
async function loadBalance() {
    const res = await fetch(`/api/balance?voter=${voterId}`);
    if (res.ok) {
        balance = (await res.json()).balance;
        render();
    }
}

async function act(kind, songId) {
    if (busy) return;
    busy = true;
    const song = songById(songId);
    try {
        const res = await fetch("/api/vote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ voter: voterId, song: songId, kind }),
        });
        const data = await res.json();

        if (!res.ok) {
            toast(data.error || "Something went wrong", "error");
            if (data.needMore) openSheet();
            return;
        }

        if (typeof data.balance === "number") balance = data.balance;
        if (kind === "vote") {
            voted.add(songId);
            saveVoted();
            toast(`Voted for ${song.title} ✓`);
        } else if (kind === "queue") {
            toast(`${song.title} is in the queue!`);
        } else {
            toast(`${song.title} plays ASAP!`);
        }

        flashId = songId;
        setTimeout(() => { flashId = null; }, 900);
        await load();
    } finally {
        busy = false;
    }
}

async function checkout(packId) {
    if (busy) return;
    busy = true;
    try {
        const res = await fetch("/api/create-checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ voter: voterId, pack: packId }),
        });
        const data = await res.json();
        if (data.url) window.location = data.url;
        else toast(data.error || "Couldn't start checkout", "error");
    } finally {
        busy = false;
    }
}

// One click listener for every button on the page.
document.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const { action, id } = el.dataset;

    if (action === "close-overlay" && e.target !== el) return; // clicks inside the sheet
    if (action === "buy") openSheet();
    else if (action === "close" || action === "close-overlay") closeSheet();
    else if (action === "pack") await checkout(id);
    else act(action, id); // "vote", "queue", or "asap"
});

async function load() {
    const [s, q, n] = await Promise.all([
        supabase.from("songs").select("*")
            .order("votes", { ascending: false }).order("title", { ascending: true }),
        supabase.from("queue").select("*").eq("status", "queued"),
        supabase.from("now_playing").select("song_id").eq("id", 1).maybeSingle(),
    ]);
    const err = s.error || q.error || n.error;
    if (err) {
        app.textContent = "Error: " + err.message;
        return;
    }
    songs = s.data;
    queue = q.data;
    nowPlayingId = n.data?.song_id ?? null;
    if (nowPlayingId && voted.delete(nowPlayingId)) saveVoted();
    render();
}

load();
loadBalance();

supabase
    .channel("qd-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "songs" }, load)
    .on("postgres_changes", { event: "*", schema: "public", table: "queue" }, load)
    .on("postgres_changes", { event: "*", schema: "public", table: "now_playing" }, load)
    .subscribe();

// Coming back from Stripe
if (new URLSearchParams(location.search).get("paid")) {
    history.replaceState({}, "", "/");
    toast("Payment received! Your q's will show up in a moment.");
    let tries = 0;
    const poll = setInterval(async () => {
        await loadBalance();
        if (++tries >= 6) clearInterval(poll);
    }, 1500);
}