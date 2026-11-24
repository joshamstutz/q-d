import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const okId = (s) => typeof s === "string" && /^[A-Za-z0-9._-]{8,64}$/.test(s);

const FUNCTIONS = { vote: "cast_vote", queue: "queue_song", asap: "asap_song" };

const MESSAGES = [
    ["not enough", "Not enough q's"],
    ["already voted", "You already voted for that song"],
    ["already queued", "That song is already in the queue"],
    ["already asap", "That song is already playing next"],
    ["currently playing", "That song is playing right now"],
];

export default async (req) => {
    if (req.method !== "POST") {
        return Response.json({ error: "POST only" }, { status: 405 });
    }
    const { voter, song, kind } = await req.json().catch(() => ({}));
    if (!okId(voter) || typeof song !== "string" || !FUNCTIONS[kind]) {
        return Response.json({ error: "bad request" }, { status: 400 });
    }

    const { data, error } = await db.rpc(FUNCTIONS[kind], { p_voter: voter, p_song: song });
    if (error) {
        const hit = MESSAGES.find(([text]) => error.message.includes(text));
        return Response.json(
            { error: hit ? hit[1] : "Couldn't do that", needMore: error.message.includes("not enough") },
            { status: 400 }
        );
    }
    // Free votes return the song's vote total; paid actions return the new balance.
    return Response.json(kind === "vote" ? { ok: true } : { balance: data });
};

export const config = { path: "/api/vote" };