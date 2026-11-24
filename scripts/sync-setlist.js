import { createClient } from "@supabase/supabase-js";
import { SETLIST } from "../src/setlist.js";

const dry = process.argv.includes("--dry");
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

// "Don't Stop Believin'" becomes "dont-stop-believin"
const slug = (s) =>
    s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// 1. Turn your list into rows, each with a unique id.
const seen = new Set();
const wanted = SETLIST.map(({ title, artist = "" }) => {
    let id = slug(title);
    if (seen.has(id)) id = `${id}-${slug(artist)}`; // same title by two artists
    if (!id || seen.has(id)) throw new Error(`Can't make a unique id for "${title}"`);
    seen.add(id);
    return { id, title, artist };
});

// 2. See what's in the database now.
const { data: current, error: readError } = await db.from("songs").select("id");
if (readError) throw readError;

const wantedIds = new Set(wanted.map((s) => s.id));
const currentIds = new Set(current.map((s) => s.id));
const removed = [...currentIds].filter((id) => !wantedIds.has(id));
const added = wanted.filter((s) => !currentIds.has(s.id));

// 3. Never delete a song someone has paid to queue. Skip it first, so they get refunded.
let blocked = new Set();
if (removed.length) {
    const { data: active, error } = await db
        .from("queue").select("song_id").eq("status", "queued").in("song_id", removed);
    if (error) throw error;
    blocked = new Set(active.map((q) => q.song_id));
}
const toDelete = removed.filter((id) => !blocked.has(id));

console.log(`In your list:   ${wanted.length} songs`);
console.log(`New:            ${added.length}`);
console.log(`Already there:  ${wanted.length - added.length} (titles and artists get refreshed)`);
console.log(`To remove:      ${toDelete.length}${toDelete.length ? " → " + toDelete.join(", ") : ""}`);
if (blocked.size) {
    console.log(`\n⚠ NOT removing (paid and still queued): ${[...blocked].join(", ")}`);
    console.log("  Skip them on the band page first so everyone gets refunded, then run this again.");
}

if (dry) {
    console.log("\nDry run: nothing was changed.");
    process.exit(0);
}

// 4. Remove old songs and anything that points at them.
if (toDelete.length) {
    const steps = [
        db.from("now_playing").update({ song_id: null }).in("song_id", toDelete),
        db.from("queue").delete().in("song_id", toDelete),
        db.from("free_votes").delete().in("song_id", toDelete),
        db.from("songs").delete().in("id", toDelete),
    ];
    for (const step of steps) {
        const { error } = await step;
        if (error) throw error;
    }
}

// 5. Add new songs and refresh the rest. Vote counts of existing songs stay as they are.
const { error: upsertError } = await db.from("songs").upsert(wanted, { onConflict: "id" });
if (upsertError) throw upsertError;

console.log("\n✓ Done. Your setlist is live.");