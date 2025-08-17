/// <reference path="../_external/.onlinestream-provider.d.ts" />
/// <reference path="../_external/core.d.ts" />

//#region console

const DevMode = true;
const originalConsoleLog = console.log;
console.log = function (...args: any[]) {
    if (DevMode) {
        originalConsoleLog.apply(console, args);
    }
};

//#endregion

class Provider {

    readonly SEARCH_URL = "https://french-anime.com/engine/ajax/search.php";

    getSettings(): Settings {
        return {
            episodeServers: ["vidmoly", "vvide0", "jilliandescribecompany", "luluvid", "ups2up"],
            supportsDub: false,
        }
    }

    //#region utility

    private async fetchSearchResults(searchText: string) {
        const body = new URLSearchParams();
        body.append("query", searchText);
        const req = await fetch(this.SEARCH_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json, text/javascript, */*; q=0.01",
            },
            body: body.toString(),
        });

        const html = await (await req).text();
        const $ = LoadDoc(html);
        if ($("span.notfound").length() > 0) {
            return undefined;
        }
        return $;
    }

    private async HandleServerUrl(serverUrl: string): Promise<VideoSource[] | VideoSource> {
        // handle unknow server url: goal is to try to a mp4 or m3u8 url and try to get the quality
        const req = await fetch(serverUrl, {
            headers: {
                referer: "https://french-anime.com/"
            }
        });
        if (!req.ok) {
            console.error("Failed to fetch server URL:", serverUrl, "Status:", req.status);
            return {
                url: "",
                quality: "unknown",
                type: "mp4",
                subtitles: []
            };
        }

        const html = await req.text();

        // special case Dean Edwards’ Packer
        // .match(/eval\(function\(p,a,c,k,e,d\)(.*?)\)\)/s);
        function extractScripts(str: string): string[] {
            const results: string[] = [];
            const openTag = "<script type='text/javascript'>";
            const closeTag = "</script>";

            let pos = 0;

            while (pos < str.length) {
                const start = str.indexOf(openTag, pos);
                if (start === -1) break;
                const end = str.indexOf(closeTag, start);
                if (end === -1) break;
                const content = str.substring(start + openTag.length, end);
                results.push(content);
                pos = end + closeTag.length;
            }

            return results;
        }

        const scriptContents = extractScripts(html);
        let unpacked;
        for (const c of scriptContents) {
            let c2 = c;
            // change c for each 200 char put \n (it too long)
            for (let j = 0; j < c.length; j += 900) {
                c2 = c2.substring(0, j) + "\n" + c2.substring(j);
            }
            if (c.includes("eval(function(p,a,c,k,e,d)")) {
                function unpack(p: string, a: number, c: number, k: string[]): string {
                    while (c--) {
                        if (k[c]) {
                            const regex = new RegExp('\\b' + c.toString(a) + '\\b', 'g');
                            p = p.replace(regex, k[c]);
                        }
                    }
                    return p;
                }

                const fullRegex = /eval\(function\([^)]*\)\{[\s\S]*?\}\(\s*'([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/;
                const match = c2.match(fullRegex);

                if (match) {
                    const packed = match[1];
                    const base = parseInt(match[2], 10);
                    const count = parseInt(match[3], 10);
                    const dict = match[4].split('|');

                    unpacked = unpack(packed, base, count, dict);
                    // decode unicode example \uXXXX
                    unpacked = unpacked.replace(/\\u([\d\w]{4})/gi, (match, grp) => {
                        return String.fromCharCode(parseInt(grp, 16));
                    });
                    console.log(unpacked);
                    console.log("Unpacked has been found.");
                }
            }
        }

        // look for resolution: [4 to 3 numbers]p, have " or [space] after p if its the [space] it must be between to [space]
        const resolutionMatch = html.match(/(\d{3,4})p(?=[" ])/) || unpacked?.match(/(\d{3,4})p(?=[" ])/);
        if (resolutionMatch) {
            const resolution = resolutionMatch[1];
            console.log("Found resolution:", resolution);
        }



        // look for .m3u8
        const m3u8Match = html.match(/https?:\/\/[^'"]+\.m3u8(?:\?[^\s'"]*)?(?:#[^\s'"]*)?/g) || unpacked?.match(/https?:\/\/[^'"]+\.m3u8(?:\?[^\s'"]*)?(?:#[^\s'"]*)?/g);
        if (m3u8Match) {
            if (m3u8Match.length > 1) {
                // If found multiple, euhm we are cooked... idk yet let me think of it lmao
                console.log("Found multiple m3u8 URLs:", m3u8Match);
                // for take the first one idk
                m3u8Match.forEach(element => {
                    if (m3u8Match[0] !== element) {
                        m3u8Match.pop();
                    }
                });
            }
            else {
                console.log("Found m3u8 URL:", m3u8Match[0]);
            }

            // fetch the match to see if the m3u8 is main or extension
            // get the referer of the ServerUrl
            const ref = serverUrl.split("/").slice(0, 3).join("/");
            const req = await fetch(m3u8Match[0], {
                headers: {
                    Referer: ref
                }
            });
            const reqHtml = await req.text();
            let qual = "";
            let url = "";
            const videos: VideoSource[] = [];
            if (reqHtml.includes("#EXTM3U")) {
                reqHtml.split("\n").forEach(line => {
                    if (line.startsWith("#EXT-X-STREAM-INF")) {
                        qual = line.split("RESOLUTION=")[1]?.split(",")[0] || "unknown";
                        const width = parseInt(qual.split("x")[0]) || 0;

                        if (width >= 1920) {
                            qual = "1080p";
                        } else if (width >= 1280) {
                            qual = "720p";
                        } else if (width >= 640) {
                            qual = "480p";
                        } else if (width >= 320) {
                            qual = "360p";
                        } else {
                            qual = "unknown";
                        }
                    }
                    else if (line.startsWith("http")) {
                        url = line;
                    }

                    if (url && qual) {
                        videos.push({
                            url: url,
                            type: "m3u8",
                            quality: qual,
                            subtitles: []
                        })
                        url = "";
                        qual = "";
                    }
                });
            }

            if (videos.length > 0) {
                console.log("Found m3u8 videos:", videos);
                return videos;
            }

            return {
                url: m3u8Match[0],
                quality: resolutionMatch ? resolutionMatch[1] : "unknown",
                type: "m3u8",
                subtitles: []
            };
        }

        // look for .mp4
        const mp4Match = html.match(/https?:\/\/[^'"]+\.mp4(?:\?[^\s'"]*)?(?:#[^\s'"]*)?/g) || unpacked?.match(/https?:\/\/[^'"]+\.mp4(?:\?[^\s'"]*)?(?:#[^\s'"]*)?/g);
        if (mp4Match) {
            if (mp4Match.length > 1) {
                // If found multiple, euhm we are cooked... idk yet let me think of it lmao
                console.log("Found multiple mp4 URLs:", mp4Match);
                // for take the first one idk
                mp4Match.forEach(element => {
                    if (mp4Match[0] !== element) {
                        mp4Match.pop();
                    }
                });
            }
            else {
                console.log("Found mp4 URL:", mp4Match[0]);
            }

            return {
                url: mp4Match[0],
                quality: resolutionMatch ? resolutionMatch[1] : "unknown",
                type: "mp4",
                subtitles: []
            };
        }



        // what do we do about the subtitles you may ask,
        // welp, idk ahahahah... i'm probably laughing on my own, because pbly no one read this
        return {
            quality: resolutionMatch ? resolutionMatch[1] : "unknown",
            url: m3u8Match ? m3u8Match[0] : (mp4Match ? mp4Match[0] : ""),
            type: m3u8Match === undefined ? "mp4" : "m3u8",
            subtitles: []
        };
    }

    //#endregion

    //#region main

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const queryEnglish = opts.media.englishTitle || opts.query;
        let $;
        let query = queryEnglish;

        while (query.split(" ").length > 1) {
            query = query.split(" ").slice(0, -1).join(" ")
            $ = await this.fetchSearchResults(query);
            if ($) {
                break;
            }
        }
        const seasonMatch = queryEnglish.toLowerCase().match(/season\s*(\d+)/i);
        let seasonNumber;
        if (seasonMatch) {
            seasonNumber = parseInt(seasonMatch[1], 10);
            console.log("Found season number:", seasonNumber);
        }

        let results: SearchResult[] = [];

        if (opts.dub === true) {
            $("a").each((_, el) => {
                const href = el.attr("href");
                if (href) {
                    if (href.includes("/animes-vf/")) {
                        const match = href.match(/\/(\d+)-/);
                        if (match) {
                            results.push({
                                id: match[1],
                                title: queryEnglish,
                                url: href,
                                subOrDub: "dub",
                            });
                        }
                    }
                }
            });
            results.sort((a, b) => parseInt(a.id) - parseInt(b.id));

            results = [results[seasonNumber - 1] || results[0]];
            results[0].id = results[0].url;
        }
        else {
            $("a").each((_, el) => {
                const href = el.attr("href");
                if (href) {
                    if (href.includes("/animes-vostfr/")) {
                        const match = href.match(/\/(\d+)-/);
                        if (match) {
                            results.push({
                                id: match[1],
                                title: queryEnglish,
                                url: href,
                                subOrDub: "sub",
                            });
                        }
                    }
                }
            });

            results.sort((a, b) => parseInt(a.id) - parseInt(b.id));
            results = [results[seasonNumber - 1] || results[0]];
            results[0].id = results[0].url;
        }
        return results
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {

        const $ = await fetch(id).then(res => res.text()).then(LoadDoc);
        const results: EpisodeDetails[] = [];
        const eps = $("div[class='eps']").text().trim().split("\n").filter(line => line.trim() !== "");
        eps.forEach(line => {
            const [episodeNumber, ...urls] = line.split("!");
            urls.forEach(url => {
                results.push({
                    id: url.trim(),
                    url: id,
                    number: parseInt(episodeNumber.trim())
                });
            });
        });

        return results;
    }

    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        const servers = episode.id.split(",");

        // DEV CHECK TO FIND MISSING SERVERS
        for (const element of servers) {
            // get the server name of the element
            const serverName = element.split("/")[2].split(".")[0];
            // check if servername is in the list of the episode servers
            if (!this.getSettings().episodeServers.includes(serverName)) {
                console.log("Need to add server:", serverName);
                return {
                    headers: {},
                    server: "",
                    videoSources: []
                };
            }
        }

        // get the right url server
        const serverUrl = servers.find(server => server.includes(_server));
        const videoSources = <VideoSource[]>[];
        if (serverUrl && _server !== "") {
            console.log(`Handling server URL: ${serverUrl}`);
            const result = await this.HandleServerUrl(serverUrl);
            if (Array.isArray(result)) {
                videoSources.push(...result);
            } else {
                videoSources.push(result);
            }
        }
        else {
            // If we reach this point, the server is unknown
            console.log(`Server not found: ${_server}\n Try with these servers:\n- ${servers.map(url => url.split("/")[2].split(".")[0]).join("\n- ")}`);
            return {
                headers: {},
                server: "",
                videoSources: []
            };
        }

         const ref = serverUrl.split("/").slice(0, 3).join("/");
        return {
            headers: {
                referer: ref
            },
            server: _server,
            videoSources: videoSources
        };
    }

    //#endregion
}