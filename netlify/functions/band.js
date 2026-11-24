import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

function pinOk(given) {
    const real = process.env.BAND_PIN;
    if (!real || typeof given !== "string") return false;
    const a = Buffer.from(given);
    const b = Buffer.from(real);
    return a.length === b.length && timingSafeEqual(a, b);
}

export default async (req) => {
    if (req.method !== "POST") {
        return Response.json({ error: "POST only" }, { status: 405 });
    }
    const { pin, action, song } = await req.json().catch(() => ({}));

    if (!pinOk(pin)) {
        await new Promise((r) => setTimeout(r, 800)); // slows down guessing
        return Response.json({ error: "Wrong PIN" }, { status: 401 });
    }

    if (action === "check") return Response.json({ ok: true });

    if (action === "finish") {
        const { error } = await db.from("now_playing").update({ song_id: null }).eq("id", 1);
        if (error) return Response.json({ error: "Couldn't do that" }, { status: 500 });
        return Response.json({ ok: true });
    }

    if ((action === "start" || action === "skip") && typeof song === "string") {
        const fn = action === "start" ? "start_song" : "skip_song";
        const { error } = await db.rpc(fn, { p_song: song });
        if (error) {
            console.error(error);
            return Response.json({ error: "Couldn't do that" }, { status: 500 });
        }
        return Response.json({ ok: true });
    }

    return Response.json({ error: "bad request" }, { status: 400 });
};

export const config = { path: "/api/band" };