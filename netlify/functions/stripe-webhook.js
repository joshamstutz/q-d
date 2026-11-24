import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { PACKS } from "../../src/packs.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

export default async (req) => {
    const signature = req.headers.get("stripe-signature");
    const body = await req.text(); // must be the raw text for the signature check

    let event;
    try {
        event = await stripe.webhooks.constructEventAsync(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error(
            "Webhook verify failed:", err.message,
            "| secret set:", Boolean(process.env.STRIPE_WEBHOOK_SECRET),
            "| secret length:", (process.env.STRIPE_WEBHOOK_SECRET || "").length,
            "| signature header present:", Boolean(signature)
        );
        return new Response("Bad signature", { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const pack = PACKS.find((p) => p.id === session.metadata?.pack);
        const voter = session.metadata?.voter;

        if (session.payment_status === "paid" && pack && voter) {
            const { error } = await db.rpc("credit_votes", {
                p_voter: voter,
                p_votes: pack.qs,
                p_session: session.id,
            });
            if (error) {
                console.error(error);
                return new Response("db error", { status: 500 }); // Stripe will retry
            }
        }
    }
    return new Response("ok");
};

export const config = { path: "/api/stripe-webhook" };