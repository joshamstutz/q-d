import { defineConfig, loadEnv } from "vite";
import netlify from "@netlify/vite-plugin";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => {
    // Load .env and .env.local into process.env so server functions can see them.
    Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

    return {
        plugins: [netlify({ edgeFunctions: { enabled: false } })],
        build: {
            rollupOptions: {
                input: {
                    main: resolve(process.cwd(), "index.html"),
                    band: resolve(process.cwd(), "band.html"),
                },
            },
        },
    };
});