import { Hono } from "https://deno.land/x/hono@v4.0.2/mod.ts";
import { cors } from "https://deno.land/x/hono@v4.0.2/middleware.ts";
import { stream } from "https://deno.land/x/hono@v4.0.2/helper.ts";

const app = new Hono();

// CORS設定
app.use("/*", cors());

// ============================================
// ルート - API情報
// ============================================
app.get("/", (c) => {
    return c.json({
        status: "ok",
        message: "YouTube Audio Streaming API",
        endpoints: {
            "/": "API情報",
            "/stream/proxy?url=<youtube_url>": "プロキシストリーミング",
            "/stream/direct?url=<youtube_url>": "音声ストリームURLへリダイレクト",
            "/stream-url?url=<youtube_url>": "音声ストリームURLをJSON形式で返す",
            "/version": "yt-dlpのバージョン情報",
        },
    });
});
app.get("/stream/direct", async (c) => {
    const youtubeUrl = c.req.query("url");

    if (!youtubeUrl) {
        return c.json({ error: "URL parameter is required" }, 400);
    }

    try {
        const audioUrl = await getAudioStreamUrl(youtubeUrl);
        return c.redirect(audioUrl, 302);
    } catch (error) {
        console.error("Error:", error);
        return c.json({ error: "Internal server error" }, 500);
    }
});

// ============================================
// /stream/proxy - プロキシストリーミング
// ============================================
app.get("/stream/proxy", async (c) => {
    const youtubeUrl = c.req.query("url");

    if (!youtubeUrl) {
        return c.json({ error: "URL parameter is required" }, 400);
    }

    try {
        // yt-dlpでストリーミング
        const command = new Deno.Command("yt-dlp", {
            args: [
                "--no-check-certificates",
                "--remote-components", "ejs:github",
                "-f", "bestaudio/best",
                "-o", "-",
                youtubeUrl,
            ],
            stdout: "piped",
            stderr: "piped",
        });

        const process = command.spawn();

        // エラー出力を監視
        const stderrReader = process.stderr.getReader();
        (async () => {
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await stderrReader.read();
                if (done) break;
                console.error(decoder.decode(value));
            }
        })();

        // ストリーミングレスポンスを返す
        return stream(c, async (stream) => {
            const reader = process.stdout.getReader();

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    await stream.write(value);
                }
            } catch (error) {
                console.error("Streaming error:", error);
            } finally {
                reader.releaseLock();
            }
        }, {
            headers: {
                "Content-Type": "audio/webm",
                "Cache-Control": "no-cache",
            },
        });

    } catch (error) {
        console.error("Error:", error);
        return c.json({ error: "Internal server error" }, 500);
    }
});

// ============================================
// /stream-url - 音声ストリームURL取得
// ============================================
app.get("/stream-url", async (c) => {
    const youtubeUrl = c.req.query("url");

    if (!youtubeUrl) {
        return c.json({ error: "URL parameter is required" }, 400);
    }

    try {
        const audioUrl = await getAudioStreamUrl(youtubeUrl);
        return c.json({
            streamUrl: audioUrl,
            originalUrl: youtubeUrl,
        });
    } catch (error) {
        console.error("Error:", error);
        return c.json({ error: "Internal server error" }, 500);
    }
});

// ============================================
// /version - yt-dlpバージョン情報
// ============================================
app.get("/version", async (c) => {
    try {
        const command = new Deno.Command("yt-dlp", {
            args: ["--version"],
            stdout: "piped",
        });

        const { stdout } = await command.output();
        const version = new TextDecoder().decode(stdout).trim();

        return c.json({ version });
    } catch (error) {
        return c.json({ error: "Failed to get version" }, 500);
    }
});

// ============================================
// ヘルパー関数: yt-dlpで音声URLを取得
// ============================================
async function getAudioStreamUrl(youtubeUrl: string): Promise<string> {
    const command = new Deno.Command("yt-dlp", {
        args: [
            "--no-check-certificates",
            "--remote-components", "ejs:github",
            "-f", "bestaudio/best",
            "--get-url",
            "--no-playlist",
            youtubeUrl,
        ],
        stdout: "piped",
        stderr: "piped",
    });

    const { code, stdout, stderr } = await command.output();

    if (code !== 0) {
        const errorMessage = new TextDecoder().decode(stderr);
        console.error("yt-dlp error:", errorMessage);
        throw new Error("Failed to fetch audio stream");
    }

    return new TextDecoder().decode(stdout).trim();
}

// ============================================
// サーバー起動
// ============================================
const port = 3004;
console.log(`🚀 Server is running on http://localhost:${port}`);
console.log(`📝 Endpoints:`);
console.log(`   GET /                      - API情報`);
console.log(`   GET /stream/proxy?url=...  - プロキシストリーミング`);
console.log(`   GET /stream-url?url=...    - ストリームURL取得`);
console.log(`   GET /version               - yt-dlpバージョン`);

Deno.serve({ port }, app.fetch);