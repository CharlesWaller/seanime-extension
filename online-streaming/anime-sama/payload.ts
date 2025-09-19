/// <reference path="../_external/.onlinestream-provider.d.ts" />
/// <reference path="../_external/core.d.ts" />

//#region console

const DevMode = false;
const originalConsoleLog = console.log;
console.log = function (...args: any[]) {
    if (DevMode) {
        originalConsoleLog.apply(console, args);
    }
};

//#endregion

//#region types

enum ScoreWeight {
    // query
    Title = 3.6,
    // dub
    Language = 2.5,
    // media.format
    SeasonOrFilm = 2.1,
    // year
    ReleaseDate = 1,
    // media.episodeCount
    EpisodeCount = 1,

    MaxScore = 10,
}

//#endregion

class Provider {

    //#region variables

    readonly SEARCH_URL_2 = "https://anime-sama.fr/template-php/defaut/fetch.php";
    // idk yet how to get the api url of seanime, so i just hardcoded it
    readonly SEANIME_API = "http://127.0.0.1:43211/api/v1/proxy?url=";

    _Server = "";

    //#endregion

    //#region methods

    getSettings(): Settings {
        return {
            // i don't think they have more server...
            episodeServers: [
                "vidmoly", "movearnpre","sibnet","oneupload","sendvid",
            ],
            supportsDub: true,
        }
    }

    //#endregion

    //#region utility

    private getWordVector(word: string): number[] {
        // Dummy implementation: convert word to a vector of character codes
        // I'll probably change it one in an other update
        return Array.from(word).map(char => char.charCodeAt(0));
    }

    private cosineSimilarity(vec1: number[], vec2: number[]): number {
        const dotProduct = vec1.reduce((sum, val, i) => sum + val * (vec2[i] || 0), 0);
        const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
        const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
        return magnitude1 && magnitude2 ? dotProduct / (magnitude1 * magnitude2) : 0;
    }

    private getWordSimilarity(word1: string, words: string[]): number {
        const word1Vector = this.getWordVector(word1);
        let maxSimilarity = 0;

        for (const word2 of words) {
            const word2Vector = this.getWordVector(word2);
            const similarity = this.cosineSimilarity(word1Vector, word2Vector);
            maxSimilarity = Math.max(maxSimilarity, similarity);
        }

        return maxSimilarity;
    }

    private scoreStringMatch(weight: number, text: string | undefined, query: string | undefined): number {
        // Simple scoring mechanism: 
        // +2 point if it the same
        // split into words: 
        //      TOTAL: +2/nb words
        //          -0% point to total per exact word match (case insensitive)
        //          -5% point to total if word query and word text have 80% similarity
        //          -10% point to total if word query and word text have 50% similarity
        //          -15% point to total if word query and word text have 30% similarity
        //          -20% point to total if word query and word text have 10% similarity
        //          -100% point to total if word query and word text have 0% similarity
        // Higher score means better match
        // below 0 means no match, Warn all my test were correct, but i didn't test them all

        if (!text || !query) return 0;

        text = text.toLowerCase();
        query = query.toLowerCase();

        let score = 0;
        if (text === query)
            return ScoreWeight.MaxScore * weight;

        const textWords = text.split(" ");
        const queryWords = query.split(" ");

        for (const word of queryWords) {
            if (textWords.includes(word)) {
                score += ScoreWeight.MaxScore / textWords.length;
            }
            else {
                const similarity = this.getWordSimilarity(word, textWords);
                score -= similarity * ScoreWeight.MaxScore / textWords.length;
            }
        }

        return score * weight;
    }

    private findBestTitle(movies: { Title: string; Url: string }[], opts: string): { Title: string; Url: string } | undefined {
        let bestScore = 0;
        let bestMovie: { Title: string; Url: string } | undefined;

        for (const movie of movies) {
            let score: number = 0;
            let strOutput = ""
            // TITLE
            score += this.scoreStringMatch(2, movie.Title, opts);
            strOutput += `Title: ${movie.Title} VS ${opts}, Current Score: ${score}\n`;

            console.log(`Movie: ${movie.Title}\n${strOutput}Total Score: ${score}\n--------------------`);

            if (score > bestScore) {
                bestScore = score;
                bestMovie = movie;
            }
        }

        if (bestMovie) {
            console.log("Best movie found:", bestMovie);
            return bestMovie;
        }
        return undefined;
    }

    private async findMediaUrls(type: VideoSourceType, html, serverUrl: string, resolutionMatch?: RegExpMatchArray, unpacked?: string): Promise<VideoSource[] | VideoSource | undefined> {

        const regex = new RegExp('https?:\\/\\/[^\'"]+\\.' + type + '(?:\\?[^\\s\'"]*)?(?:#[^\\s\'"]*)?', 'g');

        let VideoMatch = html.match(regex)
            || unpacked?.match(regex)
            || html.match(new RegExp(`"([^"]+\\.${type})"`, "g"))
            || unpacked?.match(new RegExp(`"([^"]+\\.${type})"`, "g"));

        if (VideoMatch) {
            if (!VideoMatch.some(url => url.startsWith("http"))) {
                const serverurldomain = serverUrl.split("/").slice(0, 3).join("/");
                VideoMatch = VideoMatch.map(url => `${serverurldomain}${url}`.replaceAll(`"`, ""));
            }

            if (VideoMatch.length > 1) {
                // If found multiple, euhm we are cooked... idk yet let me think of it lmao
                console.warn("Found multiple m3u8 URLs:", VideoMatch);
                // for now take the first one idk
                VideoMatch.forEach(element => {
                    if (VideoMatch[0] !== element) {
                        VideoMatch.pop();
                    }
                });
            }
            else {
                console.log("Found m3u8 URL:", VideoMatch[0]);
            }

            if (VideoMatch[0].includes(`master.${type}`)) {
                // fetch the match to see if the m3u8 is main or extension
                // get the referer of the ServerUrl
                const ref = serverUrl.split("/").slice(0, 3).join("/");
                const req = await fetch(`${this.SEANIME_API}${encodeURIComponent(VideoMatch[0])}`);
                let reqHtml = await req.text();
                reqHtml = decodeURIComponent(reqHtml);
                let qual = "";
                let url = "";
                const videos: VideoSource[] = [];
                if (reqHtml.includes("#EXTM3U")) {
                    reqHtml.split("\n").forEach(line => {
                        if (line.startsWith("#EXT-X-STREAM-INF")) {
                            qual = line.split("RESOLUTION=")[1]?.split(",")[0] || "unknown";
                            const height = parseInt(qual.split("x")[1]) || 0;

                            if (height >= 1080) {
                                qual = "1080p";
                            } else if (height >= 720) {
                                qual = "720p";
                            } else if (height >= 480) {
                                qual = "480p";
                            } else if (height >= 360) {
                                qual = "360p";
                            } else {
                                qual = "unknown";
                            }
                        }
                        else if (line.startsWith("/api/v1/proxy?url=http")) {
                            url = line.replace("/api/v1/proxy?url=", "");
                        }

                        if (url && qual) {
                            videos.push({
                                url: url,
                                type: type,
                                quality: `${this._Server} - ${qual}`,
                                subtitles: []
                            })
                            url = "";
                            qual = "";
                        }
                    });
                }

                if (videos.length > 0) {
                    return videos.sort((a, b) => {
                        const resolutionOrder = ["1080p", "720p", "480p", "360p", "unknown"];
                        const aIndex = resolutionOrder.indexOf(a.quality.split(" ")[2]);
                        const bIndex = resolutionOrder.indexOf(b.quality.split(" ")[2]);
                        return aIndex - bIndex;
                    });
                }
                else {
                    console.warn("m3u8 master is not in a correct format")
                }
            }
            else {
                console.warn("No master m3u8 URL found");
            }

            return {
                url: VideoMatch[0],
                quality: resolutionMatch ? resolutionMatch[1] : `${this._Server} - unknown`,
                type: type,
                subtitles: []
            };
        }

        return undefined;
    }

    private async HandleServerUrl(serverUrl: string): Promise<VideoSource[] | VideoSource> {

        const req = await fetch(`${this.SEANIME_API}${encodeURIComponent(serverUrl)}`);
        if (!req.ok) {
            console.log("Failed to fetch server URL:", serverUrl, "Status:", req.status);
            return [];
        }

        const html = await req.text();

        // special case Dean Edwards’ Packer
        // .match(/eval\(function\(p,a,c,k,e,d\)(.*?)\)\)/s);
        function unpack(p, a, c, k) { while (c--) if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]); return p }
        // regex is weird here so i did it manually
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

        let unpacked;
        const scriptContents = extractScripts(html);
        for (const c of scriptContents) {
            let c2 = c;
            // change c for each 200 char put \n (it too long)
            for (let j = 0; j < c.length; j += 900) {
                c2 = c2.substring(0, j) + "\n" + c2.substring(j);
            }
            if (c.includes("eval(function(p,a,c,k,e,d)")) {

                console.log("Unpacked has been found.");
                const fullRegex = /eval\(function\([^)]*\)\{[\s\S]*?\}\(\s*'([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/;
                const match = c2.match(fullRegex);

                if (match) {
                    const packed = match[1];
                    const base = parseInt(match[2], 10);
                    const count = parseInt(match[3], 10);
                    const dict = match[4].split('|');

                    unpacked = unpack(packed, base, count, dict);
                    // decode unicode example \uXXXX
                    unpacked = unpacked.replace(/\\u([\d\w]{4})/gi, (_, grp) => String.fromCharCode(parseInt(grp, 16)))
                        .replace(/%3C/g, '<').replace(/%3E/g, '>')
                        .replace(/%3F/g, '?')
                        .replace(/%3A/g, ':')
                        .replace(/%2C/g, ',')
                        .replace(/%2F/g, '/')
                        .replace(/%2B/g, '+')
                        .replace(/%20/g, ' ')
                        .replace(/%21/g, '!')
                        .replace(/%22/g, '"')
                        .replace(/%27/g, "'")
                        .replace(/%28/g, '(').replace(/%29/g, ')')
                        .replace(/%3B/g, ';');
                }
            }
        }

        // look for resolution: [4 to 3 numbers]p, have " or [space] after p if its the [space] it must be between to [space]
        // example: 1080p" or 1080p
        const resolutionMatch = html.match(/(\d{3,4})p(?=[" ])/) || unpacked?.match(/(\d{3,4})p(?=[" ])/);
        if (resolutionMatch) {
            const resolution = resolutionMatch[1];
            console.log("Found resolution:", resolution);
        }

        // look for .m3u8
        const m3u8Videos = await this.findMediaUrls("m3u8", html, serverUrl, resolutionMatch, unpacked);
        if (m3u8Videos !== undefined) {
            console.log("Found m3u8: ", m3u8Videos);
            return m3u8Videos;
        }

        // look for .mp4 do the same as .m3u8
        const mp4Videos = await this.findMediaUrls("mp4", html, serverUrl, resolutionMatch, unpacked);
        if (mp4Videos !== undefined) {
            console.log("Found mp4: ", mp4Videos);
            return mp4Videos;
        }

        console.warn("No m3u8 or mp4 URLs found in the server URL:", serverUrl, ". Make sure this is true.");
        return [];
    }

    //#endregion

    //#region main

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        let tempquery = opts.query;

        const queryEnglish = opts.media.englishTitle || opts.query;
        const seasonMatch = queryEnglish.toLowerCase().match(/season\s*(\d+)/i);
        const seasonMatch2 = queryEnglish.toLowerCase().match(/(\d+)/);

        let seasonNumberOpts;
        if (seasonMatch) {
            seasonNumberOpts = parseInt(seasonMatch[1], 10);
            console.log("Found season number:", seasonNumberOpts);
        }

        let partNumberOpts;
        const partMatch = queryEnglish.toLowerCase().match(/part\s*(\d+)/i);
        if (partMatch) {
            partNumberOpts = parseInt(partMatch[1], 10);
            console.log("Found part number:", partNumberOpts);
        }
        else {
            seasonNumberOpts = seasonMatch2 ? parseInt(seasonMatch2[1], 10) : opts.media.format === "TV" ? 1 : -1;
        }

        while (tempquery !== "") {
            console.log(`Searching for query: "${tempquery}".`);
            const body = new URLSearchParams({ query: tempquery });
            const html = await fetch(
                this.SEARCH_URL_2,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    body
                }
            ).then(async res => await res.text());
            const $ = await LoadDoc(html);
            const movies = $(".flex.rounded.border-t-2.border-sky-600.hover\\:bg-gray-700.hover\\:text-sky-500");
            if (movies.length() <= 0) {
                tempquery = tempquery.split(/[\s:']+/).slice(0, -1).join(" ");
                continue;
            }

            // if movies has more than 1 el.find("h3").text();
            let movieUrl: string;
            if (movies.map((i, el) => el.find("h3")).length > 1) {
                // TODO: search for the best
                console.warn("Found multiple movies, searching for the best match...");
                movieUrl = movies.attr("href") || "";
            }
            else {
                movieUrl = movies.attr("href") || "";
            }

            console.log(movieUrl)
            if(movieUrl.includes("anime-sama.org") === true) {
                // replace .org to .fr
                movieUrl = movieUrl.replace("anime-sama.org", "anime-sama.fr");
            }
            const html2 = await fetch(movieUrl).then(res => res.text());
            let animesJson: { Title: string; Url: string }[] = [];
            const Regex = /panneauAnime\("([^"]+)", "([^"]+)"\);/g;
            let match;
            while (match = Regex.exec(await LoadDoc(html2)(".flex.flex-wrap.overflow-y-hidden.justify-start.bg-slate-900.bg-opacity-70.rounded.mt-2.h-auto").text())) {
                const animeTitle = match[1];
                const animeUrl = match[2];

                if (animeTitle === "nom" || animeUrl === "url") {
                    continue;
                }
                if (opts.media.format !== "Special" && animeUrl.includes("oav/") === true) {
                    continue;
                }
                if (opts.media.format !== "MOVIE" && animeUrl.includes("film/") === true) {
                    continue;
                }
                if (animeTitle.includes("Kai -") === true) {
                    continue;
                }
                if (animeTitle.includes("Sans Fillers") === true) {
                    continue;
                }
                const regex = partNumberOpts ? new RegExp(`saison${seasonNumberOpts || 1}-${partNumberOpts}(?!\\d)`) : new RegExp(`saison${seasonNumberOpts}(?!\\d)`);
                if (seasonNumberOpts !== -1 && !animeUrl.match(regex)) {
                    continue;
                }
                if ((opts.media.format !== "Special" && opts.media.format !== "TV" && opts.media.format !== "ONA" && opts.media.format !== "OVA") && animeUrl.includes("saison") === true) {
                    continue;
                }
                animesJson.push({
                    Title: animeTitle,
                    Url: animeUrl
                });
            }

            let BestAnimeTitle = animesJson.length > 1 ? this.findBestTitle(animesJson, opts.media.englishTitle || opts.query) : animesJson[0];
            if (!BestAnimeTitle) {
                BestAnimeTitle = animesJson.find(anime => anime.Title.includes("Saison"));
            }

            if (BestAnimeTitle === undefined) {
                return [];
            }

            const finalUrl = opts.dub ? movieUrl + "/" + BestAnimeTitle.Url.replace("/vostfr", "/vf") : movieUrl + "/" + BestAnimeTitle.Url;
            if ((await fetch(finalUrl)).status !== 200 && (await fetch(finalUrl + "1")).status !== 200) {
                console.log(`Failed to fetch ${opts.dub ? "dub" : "sub"} version of ${BestAnimeTitle.Title}`);
                return [];
            }

            return <SearchResult[]>[{
                id: finalUrl,
                title: BestAnimeTitle.Title,
                url: finalUrl,
                subOrDub: opts.dub ? "dub" : "sub",
            }];
        }

        return [];
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {

        const $ = await fetch(id).then(res => res.text()).then(LoadDoc);
        // find <script type="text/javascript" src='episodes.js?filever={numbers}'defer></script>
        const fileverScript = $("script[src*='episodes.js?filever']");
        const filever = fileverScript.attr("src");
        const episodesText = await fetch(`${id}/${filever}`).then(res => res.text());
        const episodeDetails: EpisodeDetails[] = [];
        let ServerToAdd: string[] = [];
        // MAX LECTEUR = 8 
        // source: https://anime-sama.fr/js/contenu/script_videos.js?filever={ep #, ex: 14844}, line 39
        const servers = ["eps1", "eps2", "eps3", "eps4", "eps5", "eps6", "eps7", "eps8"];

        function replaceVidmoly(url) {
            return url.replace(/vidmoly\.to/g, 'vidmoly.net');
        }

        servers.forEach(server => {
            const regex = new RegExp(`var\\s+${server}\\s*=\\s*\\[([\\s\\S]*?)\\];`, 'm');
            const match = regex.exec(episodesText);
            if (match) {
                const urls = match[1].split(",").map(url => url.trim().replace(/['"]/g, ""));
                urls.forEach((url, index) => {
                    if(url === "")
                    {
                        return;
                    }
                    if (url.includes("vidmoly.to")) {
                        url = replaceVidmoly(url);
                    }
                    episodeDetails.push({
                        id: url,
                        url: id,
                        number: index + 1
                    });
                    // DEV CHECK TO FIND MISSING SERVERS
                    if (DevMode) {
                        for (const element of url.trim().replace(/,$/, "").split(",")) {
                            // get the server name of the element
                            const parts = element.split("/");

                            const PartsServerName = parts[2] ? parts[2].split(".") : [];
                            const serverName = PartsServerName.length >= 3 ? PartsServerName[1] : PartsServerName[0];
                            // check if servername is in the list of the episode servers
                            if (serverName !== undefined && !this.getSettings().episodeServers.includes(serverName) && !ServerToAdd.includes(serverName)) {
                                ServerToAdd.push(serverName);
                            }
                        }
                    }
                });
            }
        });

        if (ServerToAdd.length > 0) {
            console.warn(`Need to add server: "${ServerToAdd.join(`","`)}"`);
            this.getSettings().episodeServers.push(...ServerToAdd);
        }

        const mergedEpisodes = episodeDetails.reduce((acc, curr) => {
            const existing = acc.find(ep => ep.number === curr.number);
            if (existing) {
            existing.id += `,${curr.id}`;
            } else {
            acc.push(curr);
            }
            return acc;
        }, <EpisodeDetails[]>[]);

        return mergedEpisodes;
    }

    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        // TODO: FIX vvide0 (its dood stream servers): 171018
        this._Server = _server;
        const servers = episode.id.split(",");
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
            console.log(`Server not found: ${_server}\n Try with these servers:\n- ${servers.map(url => {
                const parts = url.split("/");
                const partsServerName = parts[2] ? parts[2].split(".") : [];
                const serverName = partsServerName.length >= 3 ? partsServerName[1] : partsServerName[0];
                return serverName;
            }).join("\n- ")}`);
            if (servers.includes(_server)) {
                return <EpisodeServer>{
                    headers: {},
                    server: _server + " (video not found)",
                    videoSources: <VideoSource[]>[
                        {
                            // dummy video source
                            url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
                            type: "m3u8",
                            quality: "video not found",
                            subtitles: []
                        }
                    ]

                };
            } else {
                return <EpisodeServer>{
                    headers: {},
                    server: "",
                    videoSources: []
                };
            }

        }

        if (videoSources.length > 0) {
            const ref = serverUrl.split("/").slice(0, 3).join("/");
            return {
                headers: {
                    referer: ref
                },
                server: _server,
                videoSources: videoSources
            };
        }
        else {
            console.log(`No video sources found for server: ${_server}`);
            return <EpisodeServer>{
                headers: {},
                server: _server + " (video not found)",
                videoSources: <VideoSource[]>[
                    {
                        url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
                        type: "m3u8",
                        quality: "video not found",
                        subtitles: []
                    }
                ]

            };
        }
    }

    //#endregion
}