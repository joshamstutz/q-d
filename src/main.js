import { supabase } from "./supabase.js";

const app = document.querySelector("#app");

async function load() {
    const { data, error } = await supabase
        .from("songs")
        .select("*")
        .order("votes", { ascending: false });

    if (error) {
        app.textContent = "Error: " + error.message;
        return;
    }
    app.innerHTML = data.map((s) => `<p>${s.title}: ${s.votes}</p>`).join("");
}

load();

supabase
    .channel("songs-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "songs" }, load)
    .subscribe();