import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const okId = (s) => typeof s === "string" && /^[A-Za-z0-9._-]{8,64}$/.test(s);

export default async (req) => {
    if (req.method !== "POST") {
        return Response.json({ error: "POST only" }, { status: 405 });
    }
    const { voter, song, kind } = await req.json().catch(() => ({}));
    if (!okId(voter) || typeof song !== "string" || !["vote", "boost"].includes(kind)) {
        return Response.json({ error: "bad request" }, { status: 400 });
    }

    const fn = kind === "vote" ? "cast_vote" : "boost_song";
    const { data, error } = await db.rpc(fn, { p_voter: voter, p_song: song });
    if (error) {
        const msg = error.message.includes("not enough") ? "Not enough votes" : "Couldn't do that";
        return Response.json({ error: msg }, { status: 400 });
    }
    return Response.json({ balance: data });
};

export const config = { path: "/api/vote" };