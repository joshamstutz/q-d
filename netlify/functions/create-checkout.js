import Stripe from "stripe";
import { PACKS } from "../../src/packs.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const okId = (s) => typeof s === "string" && /^[A-Za-z0-9._-]{8,64}$/.test(s);

export default async (req) => {
    if (req.method !== "POST") {
        return Response.json({ error: "POST only" }, { status: 405 });
    }
    const { voter, pack } = await req.json().catch(() => ({}));
    const chosen = PACKS.find((p) => p.id === pack);
    if (!okId(voter) || !chosen) {
        return Response.json({ error: "bad request" }, { status: 400 });
    }

    const origin = new URL(req.url).origin;
    try {
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            line_items: [{
                quantity: 1,
                price_data: {
                    currency: "usd",
                    unit_amount: chosen.cents,
                    product_data: { name: `${chosen.qs} q's` },
                },
            }],
            metadata: { voter, pack: chosen.id },
            success_url: `${origin}/?paid=1`,
            cancel_url: `${origin}/`,
        });
        return Response.json({ url: session.url });
    } catch (err) {
        console.error(err);
        return Response.json({ error: "Couldn't start checkout" }, { status: 500 });
    }
};

export const config = { path: "/api/create-checkout" };