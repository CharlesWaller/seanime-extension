import { LoadDoc } from "crawlee";
import {
    OnlineStreamProvider,
    SearchResult,
    EpisodeDetails,
    StreamSource,
} from "@seanime/core";

export default class HentaibrosProvider extends OnlineStreamProvider {
    id = "hentaibros";
    name = "Hentaibros";
    baseUrl = "https://hentaibros.net/";
    api = this.baseUrl;

    /**
     * Search for anime titles on hentaibros
     */
    async search(query: string): Promise<SearchResult[]> {
        const searchUrl = `${this.api}?s=${encodeURIComponent(query)}`;
        const res = await fetch(searchUrl, {
            headers: { "User-Agent": "Mozilla/5.0" },
        });

        if (!res.ok) throw new Error(`Failed to fetch search page: ${res.status}`);

        const html = await res.text();
        const $ = LoadDoc(html);
        const results: SearchResult[] = [];

        $("article").each((_, el) => {
            const title = $(el).find("h2 a").text().trim();
            const url = $(el).find("h2 a").attr("href");
            const img = $(el).find("img").attr("src");

            if (url && title) {
                const idMatch = url.match(/\/([^/]+)\/?$/);
                const id = idMatch ? idMatch[1] : title;

                results.push({
                    id,
                    title,
                    url,
                    image: img,
                });
            }
        });

        if (results.length === 0) throw new Error("No search results found");
        return results;
    }

    /**
     * Get episodes for a selected anime
     */
    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        if (!id) throw new Error("Invalid anime id");

        const episodes: EpisodeDetails[] = [];
        const animeUrl = `${this.api}${id}/`;

        const res = await fetch(animeUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!res.ok) throw new Error(`Failed to load anime page: ${res.status}`);

        const html = await res.text();
        const $ = LoadDoc(html);

        // Find all episode links like <li><a href="/play/{slug}/{session}">Ep 1</a></li>
        $("li a[href*='/play/']").each((_, el) => {
            const href = $(el).attr("href") || "";
            const text = $(el).text().trim();
            const match = href.match(/\/play\/([^/]+)\/([^/]+)/);

            if (match) {
                const animeSlug = match[1];
                const session = match[2];
                const numMatch = text.match(/\d+/);
                const number = numMatch ? parseInt(numMatch[0], 10) : episodes.length + 1;

                episodes.push({
                    id: `${session}$${animeSlug}`,
                    number,
                    title: text || `Episode ${number}`,
                    url: `${this.api}play/${animeSlug}/${session}`,
                });
            }
        });

        if (episodes.length === 0) throw new Error("No episodes found on page");
        episodes.sort((a, b) => a.number - b.number);

        return episodes;
    }

    /**
     * Get stream source for an episode
     */
    async getStream(episodeId: string): Promise<StreamSource[]> {
        if (!episodeId.includes("$")) throw new Error("Invalid episode ID format");

        const [session, animeSlug] = episodeId.split("$");
        const url = `${this.api}play/${animeSlug}/${session}`;

        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!res.ok) throw new Error(`Failed to load episode page: ${res.status}`);

        const html = await res.text();
        const $ = LoadDoc(html);
        const sources: StreamSource[] = [];

        $("iframe").each((_, el) => {
            const src = $(el).attr("src");
            if (src && src.startsWith("http")) {
                sources.push({
                    url: src,
                    quality: "default",
                    type: "sub",
                    headers: { "Referer": this.baseUrl },
                });
            }
        });

        if (sources.length === 0) throw new Error("No stream sources found");
        return sources;
    }
}
