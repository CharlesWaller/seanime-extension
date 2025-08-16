/// <reference path="../_external/.onlinestream-provider.d.ts" />
/// <reference path="../_external/core.d.ts" />

class Provider {

    api = ""
    headers = { Referer: "" }

    getSettings(): Settings {
        return {
            episodeServers: ["kwik"],
            supportsDub: true,
        }
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const url = `https://french-anime.com/&do=search&subaction=search&story=${opts.query}`;
        console.log(opts.query)
        console.log(url)
        const req = await fetch(url, {
            headers: {
                Cookie: "__ddg1_=;__ddg2_=;",
            },
        })

        if (!req.ok) {
            return []
        }
        const data = await req.text();
        const $ = LoadDoc(data);
        const results: SearchResult[] = [];
        const fullWrap = $("xxx");
        fullWrap.find("xxx").each((_, el) => {
            const link = el.find("xxx").attr("xxx");
        });
        return results
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        let episodes: EpisodeDetails[] = []

        const req =
            await fetch(
                `${this.api}${id.includes("-") ? `/anime/${id}` : `/a/${id}`}`,
                {
                    headers: {
                        Cookie: "__ddg1_=;__ddg2_=;",
                    },
                },
            )

        const html = await req.text()
        
        const $ = LoadDoc(html)

        const tempId = $("head > meta[property='og:url']").attr("content")!.split("/").pop()!

        const { last_page, data } = (await (
            await fetch(`${this.api}/api?m=release&id=${tempId}&sort=episode_asc&page=1`, {
                headers: {
                    Cookie: "__ddg1_=;__ddg2_=;",
                },
            })
        ).json());

        const pageNumbers = Array.from({ length: last_page - 1 }, (_, i) => i + 2)

        const promises = pageNumbers.map((pageNumber) =>
            fetch(`${this.api}/api?m=release&id=${tempId}&sort=episode_asc&page=${pageNumber}`, {
                headers: {
                    Cookie: "__ddg1_=;__ddg2_=;",
                },
            }).then((res) => res.json()),
        )
        const results = (await Promise.all(promises));

        results.forEach((showData) => {
            for (const data of showData.data) {
                if (data) {
                }
            }
        });
        (data as any[]).sort((a, b) => a.number - b.number)

        if (episodes.length === 0) {
            throw new Error("No episodes found.")
        }

        const lowest = episodes[0].number
        if (lowest > 1) {
            for (let i = 0; i < episodes.length; i++) {
                episodes[i].number = episodes[i].number - lowest + 1
            }
        }

        // Remove decimal episode numbers
        episodes = episodes.filter((episode) => Number.isInteger(episode.number))
        return episodes
    }

    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        const episodeId = episode.id.split("$")[0]
        const animeId = episode.id.split("$")[1]

        console.log(`${this.api}/play/${animeId}/${episodeId}`)

        const req = await fetch(
            `${this.api}/play/${animeId}/${episodeId}`,
            {
                headers: {
                    Cookie: "__ddg1_=;__ddg2_=;",
                },
            },
        )

        const html = await req.text()

        const regex = /https:\/\/kwik\.si\/e\/\w+/g
        const matches = html.match(regex)

        if (matches === null) {
            throw new Error("Failed to fetch episode server.")
        }

        const $ = LoadDoc(html)

        const result: EpisodeServer = {
            videoSources: [],
            headers: this.headers ?? {},
            server: "kwik",
        }

        $("button[data-src]").each(async (_, el) => {
            let videoSource: VideoSource = {
                url: "",
                type: "m3u8",
                quality: "",
                subtitles: [],
            }

            videoSource.url = el.data("src")!
            if (!videoSource.url) {
                return
            }

            const fansub = el.data("fansub")!
            const quality = el.data("resolution")!

            videoSource.quality = `${quality}p - ${fansub}`

            if (el.data("audio") === "eng") {
                videoSource.quality += " (Eng)"
            }

            if (videoSource.url === matches[0]) {
                videoSource.quality += " (default)"
            }

            result.videoSources.push(videoSource)
        })

        const queries = result.videoSources.map(async (videoSource) => {
            try {
                const src_req = await fetch(videoSource.url, {
                    headers: {
                        Referer: this.headers.Referer,
                        "user-agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36 Edg/107.0.1418.56",
                    },
                })

                const src_html = await src_req.text()

                const scripts = src_html.match(/eval\(f.+?\}\)\)/g)
                if (!scripts) {
                    return
                }

                for (const _script of scripts) {
                    const scriptMatch = _script.match(/eval(.+)/)
                    if (!scriptMatch || !scriptMatch[1]) {
                        continue
                    }

                    try {
                        const decoded = eval(scriptMatch[1])
                        const link = decoded.match(/source='(.+?)'/)
                        if (!link || !link[1]) {
                            continue
                        }

                        videoSource.url = link[1]

                    }
                    catch (e) {
                        console.error("Failed to extract kwik link", e)
                    }

                }

            }
            catch (e) {
                console.error("Failed to fetch kwik link", e)
            }
        })

        await Promise.all(queries)

        return result
    }
}