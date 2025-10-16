/// <reference path=".onlinestream-provider.d.ts" />
/// <reference path="./core.d.ts" />

type EpisodeData = {
    id: number;
    episode: number;
    title: string;
    snapshot: string;
    filler: number;
    session: string;
    created_at?: string;
};

type AnimeData = {
    id: number;
    title: string;
    type: string;
    year: number;
    poster: string;
    session: string;
};

class Provider {
    api = "https://hentaibros.net/";

    getSettings(): Settings {
        return {
            episodeServers: ["kwik"],
            supportsDub: false,
        };
    }

    /** 🔍 Search for anime/videos (returns only the first result) */
    async search(opts: SearchOptions): Promise<SearchResult[]> {
        try {
            const query = typeof opts.query === "string" ? opts.query.trim() : "";
            if (!query) return [];

            const res = await fetch(`${this.api}?s=${encodeURIComponent(query)}`, {
                headers: {
                    "User-Agent": "Mozilla/5.0",
                    Cookie: "__ddg1_=;__ddg2_=",
                },
            });

            if (!res.ok) return [];

            const html = await res.text();
            const $ = LoadDoc(html);

            const el = $("article").first();
            if (!el || el.length === 0) return [];

            const anchor = el.find("a").first();
            const rawTitle = anchor.find("header.entry-header span").text();
            const title = rawTitle ? rawTitle.trim() : "";
            const url = anchor.attr("href") || "";
            if (!url || !title) return [];

            const id = url.split("/").filter(Boolean).pop() || "";
            if (!id) return [];

            return [
                {
                    subOrDub: "sub",
                    id,
                    title,
                    url,
                },
            ];
        } catch (err) {
            console.error("Search failed:", err);
            return [];
        }
    }

    /** 📜 Find episodes for a given anime/video */
    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const episodes: EpisodeDetails[] = [];

        try {
            if (!id || typeof id !== "string") throw new Error("Invalid anime id");

            const url = id.startsWith("http") ? id : `${this.api}${id}/`;
            const res = await fetch(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0",
                    Cookie: "__ddg1_=;__ddg2_=",
                },
            });

            if (!res.ok) throw new Error(`Failed to load anime page: ${res.status}`);

            const html = await res.text();
            const $ = LoadDoc(html);

            const ogUrl = $("head > meta[property='og:url']").attr("content");
            if (!ogUrl || typeof ogUrl !== "string") throw new Error("Anime tempId not found");

            const tempId = ogUrl.split("/").filter(Boolean).pop();
            if (!tempId) throw new Error("Failed to extract tempId");

            const apiRes = await fetch(
                `${this.api}/api?m=release&id=${tempId}&sort=episode_asc&page=1`,
                { headers: { Cookie: "__ddg1_=;__ddg2_=" } }
            );
            if (!apiRes.ok) throw new Error(`Episode API request failed: ${apiRes.status}`);

            const { last_page, data } = (await apiRes.json()) as {
                last_page: number;
                data: EpisodeData[];
            };

            const pushData = (items: EpisodeData[]) => {
                for (const item of items) {
                    if (!item.session) continue;
                    episodes.push({
                        id: `${item.session}$${id}`,
                        number: parseInt(item.episode as any, 10) || 1,
                        title: item.title && item.title.length ? item.title : `Episode ${item.episode}`,
                        url,
                    });
                }
            };

            pushData(data);

            // fetch remaining pages
            const pageNumbers = Array.from({ length: Math.max(0, last_page - 1) }, (_, i) => i + 2);
            const pagePromises = pageNumbers.map((page) =>
                fetch(`${this.api}/api?m=release&id=${tempId}&sort=episode_asc&page=${page}`, {
                    headers: { Cookie: "__ddg1_=;__ddg2_=" },
                }).then((r) => r.json())
            );

            const pageResults = (await Promise.all(pagePromises)) as { data: EpisodeData[] }[];
            pageResults.forEach((page) => pushData(page.data));

            episodes.sort((a, b) => a.number - b.number);
            return episodes.filter((ep) => Number.isInteger(ep.number));
        } catch (err) {
            console.error("findEpisodes failed:", err);
            throw err;
        }
    }

    /** 🎬 Get playable episode server */
    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        try {
            if (!episode?.id) throw new Error("Invalid episode ID");

            const parts = episode.id.split("$");
            const episodeSession = parts[0];
            const animeId = parts[1];

            const url = `${this.api}/play/${animeId}/${episodeSession}`;

            const result: EpisodeServer = {
                server: "kwik",
                headers: { Referer: this.api, "User-Agent": "Mozilla/5.0" },
                videoSources: [
                    { url, type: "m3u8", quality: "default", subtitles: [] }
                ],
            };

            return result;
        } catch (err) {
            console.error("findEpisodeServer failed:", err);
            throw err;
        }
    }
}
