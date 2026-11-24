import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const okId = (s) => typeof s === "string" && /^[A-Za-z0-9._-]{8,64}$/.test(s);

export default async (req) => {
    const voter = new URL(req.url).searchParams.get("voter");
    if (!okId(voter)) return Response.json({ error: "bad voter id" }, { status: 400 });

    const { data, error } = await db.rpc("get_balance", { p_voter: voter });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ balance: data });
};

export const config = { path: "/api/balance" };