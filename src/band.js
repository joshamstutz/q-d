import "./style.css";
import { supabase } from "./supabase.js";
import { APP_NAME, BAND_NAME } from "./setlist.js";

const app = document.querySelector("#app");
const toasts = document.querySelector("#toasts");

let songs = [];
let queue = [];
let nowPlayingId = null;
let pin = localStorage.getItem("qd_band_pin") || "";
let busy = false;
let live = false;

const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));

function toast(message, type = "ok") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = message;
    toasts.appendChild(el);
    setTimeout(() => el.remove(), 2700);
}

const songById = (id) => songs.find((s) => s.id === id);

// Same order the audience sees: ASAP first (earliest paid), then the regular queue.
function orderedQueue() {
    const asap = queue.filter((q) => q.kind === "asap")
        .sort((a, b) => new Date(a.asap_at) - new Date(b.asap_at));
    const regular = queue.filter((q) => q.kind === "queue")
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return [...asap, ...regular];
}

async function call(action, song) {
    const res = await fetch("/api/band", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, action, song }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
}

function renderLogin() {
    app.innerHTML = `
    <div class="login">
      <h1>${esc(APP_NAME)} · Band</h1>
      <div class="muted">Enter the band PIN to run the show.</div>
      <input id="pin" type="password" placeholder="PIN" autocomplete="current-password" />
      <button class="big" data-action="unlock">Unlock</button>
    </div>`;
}

function render() {
    if (!songs.length) {
        app.innerHTML = `<p class="muted">Loading…</p>`;
        return;
    }

    const line = orderedQueue();
    const queuedIds = new Set(line.map((q) => q.song_id));
    const playing = songById(nowPlayingId);
    const pool = songs.filter((s) => !queuedIds.has(s.id) && s.id !== nowPlayingId);

    // Who's next: first in line, otherwise the crowd's top-voted song.
    const nextSong = line[0] ? songById(line[0].song_id) : pool[0];
    const nextLabel = line[0]
        ? (line[0].kind === "asap" ? "NEXT · ASAP" : "NEXT")
        : `CROWD PICK · ${pool[0]?.votes ?? 0} VOTES`;

    const nowHtml = playing
        ? `<div class="now">
         <div class="eq"><i></i><i></i><i></i></div>
         <div style="flex:1">
           <div class="label">NOW PLAYING</div>
           <div class="name big">${esc(playing.title)}</div>
           <div class="muted">${esc(playing.artist)}</div>
         </div>
         <button class="small secondary" data-action="finish">Finished</button>
       </div>`
        : `<div class="now idle"><div class="muted">Nothing playing</div></div>`;

    const nextHtml = nextSong
        ? `<div class="hero">
         <div class="label">${esc(nextLabel)}</div>
         <div class="title">${esc(nextSong.title)}</div>
         <div class="sub">${esc(nextSong.artist)}</div>
       </div>
       <button class="big" data-action="start" data-id="${esc(nextSong.id)}">Start ${esc(nextSong.title)}</button>`
        : `<div class="muted">No songs left to play.</div>`;

    const queueRows = line.map((q, i) => {
        const s = songById(q.song_id);
        if (!s) return "";
        return `
      <div class="card qrow">
        <div class="pos">${i + 1}</div>
        <div class="grow">
          <div class="name">${esc(s.title)} ${q.kind === "asap" ? `<span class="tag">ASAP</span>` : ""}</div>
          <div class="muted">${esc(s.artist)}</div>
        </div>
        <button class="small" data-action="start" data-id="${esc(s.id)}">Play now</button>
        <button class="small danger" data-action="skip" data-id="${esc(s.id)}">Skip</button>
      </div>`;
    }).join("");

    const poolRows = pool.map((s) => `
    <div class="card qrow">
      <div class="grow">
        <div class="name">${esc(s.title)}</div>
        <div class="muted">${esc(s.artist)} · ${s.votes} ${s.votes === 1 ? "vote" : "votes"}</div>
      </div>
      <button class="small secondary" data-action="start" data-id="${esc(s.id)}">Play</button>
    </div>`).join("");

    app.innerHTML = `
    <div class="topbar">
      <h1>${esc(BAND_NAME)}</h1>
      <button class="chip" data-action="lock">Lock</button>
    </div>
    ${nowHtml}
    ${nextHtml}
    ${line.length ? `<div class="muted">QUEUE (${line.length})</div>${queueRows}` : ""}
    <div class="muted">THE SETLIST</div>
    ${poolRows || `<p class="muted">Everything's queued.</p>`}
  `;
}

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
    render();
}

function goLive() {
    load();
    if (live) return;
    live = true;
    supabase
        .channel("qd-band-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "songs" }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "queue" }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "now_playing" }, load)
        .subscribe();
}

async function unlock(candidate) {
    pin = candidate;
    const { ok } = await call("check");
    if (!ok) {
        pin = "";
        localStorage.removeItem("qd_band_pin");
        toast("Wrong PIN", "error");
        return;
    }
    localStorage.setItem("qd_band_pin", pin);
    goLive();
}

document.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || busy) return;
    const { action, id } = el.dataset;

    if (action === "unlock") {
        const value = document.querySelector("#pin").value;
        if (value) await unlock(value);
        return;
    }
    if (action === "lock") {
        localStorage.removeItem("qd_band_pin");
        location.reload();
        return;
    }

    const song = id ? songById(id) : null;
    if (action === "skip" && !confirm(`Skip ${song?.title}? Everyone who paid gets their q's back.`)) return;

    busy = true;
    try {
        const { ok, data } = await call(action, id);
        if (!ok) {
            toast(data.error || "Something went wrong", "error");
            return;
        }
        if (action === "start") toast(`Now playing ${song.title}`);
        else if (action === "skip") toast(`Skipped ${song.title}. q's refunded.`);
        else if (action === "finish") toast("Marked finished");
        await load();
    } finally {
        busy = false;
    }
});

// Start: either show the PIN screen or, if a saved PIN still works, go straight in.
if (pin) unlock(pin).then(() => { if (!live) renderLogin(); });
else renderLogin();