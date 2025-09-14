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

const languageMap: Record<string, string> = {
    "en": "English",
    "eng": "English",
    "es": "Spanish",
    "spa": "Spanish",
    "fr": "French",
    "it": "Italian",
    "ja": "Japanese",
    "jp": "Japanese",
};

//#endregion

class Provider {

    //#region variables

    readonly SEARCH_URL = "https://animesultra.org/";
    readonly EPISODE_URL = "https://animesultra.org/engine/ajax/full-story.php?"
    // idk yet how to get the api url of seanime, so i just hardcoded it
    readonly SEANIME_API = "http://127.0.0.1:43211/api/v1/proxy?url=";

    _Server = "";

    //#endregion

    //#region methods

    getSettings(): Settings {
        return {
            // https://animesultra.org/templates/animeultra/js/movie.js LINE 97 - 347
            episodeServers: [
                "vidmoly", "sendvid", "sibnet", "vidcdn", "mystream", "streamtape", "uqload", "cdnt2", "vip", "vid", "vidfast", "verystream", "rapids",
                "cloudvideo", "mytv", "myvi", "uptostream", "gtv", "fembed", "hydrax", "gou", "cdnt", "rapidvideo", "namba", "kaztube", "tune", "netu",
                "rutube", "dailymotion", "openload", "yandex", "ok", "vidspot", "cloudy", "google", "youtube", "moevideo", "mail", "mail2"
            ],
            supportsDub: true,
        }
    }

    //#endregion

    //#region utility
    private generateQueryVariants(query: string, maxVariants = 3): string[] {
        const parts = query.trim().split(/[\s:']+/);
        const variants = [];

        for (let i = parts.length; i >= Math.max(parts.length - maxVariants + 1, 1); i--) {
            variants.push(parts.slice(0, i).join(" "));
        }

        return [...new Set(variants)];
    }

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

    private async findSubtitles(html: string, serverUrl: string, unpacked?: string): Promise<VideoSubtitle[]> {
        let subtitles: VideoSubtitle[] = [];
        const subtitleRegex = /<track\s+[^>]*src=["']([^"']+\.vtt(?:\?[^"']*)?)["'][^>]*>/gi;
        let trackMatches = html.matchAll(subtitleRegex);

        for (const match of trackMatches) {
            const src = match[1];
            const fullTag = match[0];

            let url = src.startsWith("http") ? src : `${serverUrl.split("/").slice(0, 3).join("/")}${src}`;

            // Attempt to extract language info
            const langMatch = fullTag.match(/(?:label|srclang)=["']?([a-zA-Z\-]{2,})["']?/i);
            const langCode = langMatch?.[1]?.toLowerCase() || "";

            const language = languageMap[langCode] || langCode || "Unknown";

            const isDefault = /default/i.test(fullTag);

            subtitles.push({
                id: `sub-${subtitles.length}`,
                url,
                language,
                isDefault,
            });
        }

        // Fallback: look for direct .vtt URLs (if <track> not used)
        if (subtitles.length === 0) {
            const rawSubtitleRegex = /https?:\/\/[^\s'"]+\.vtt(?:\?[^'"\s]*)?/g;
            let subtitleMatches = html.match(rawSubtitleRegex) || unpacked?.match(rawSubtitleRegex) || [];

            if (subtitleMatches.length > 0) {
                if (!subtitleMatches.some(url => url.startsWith("http"))) {
                    const baseUrl = serverUrl.split("/").slice(0, 3).join("/");
                    subtitleMatches = subtitleMatches.map(url => `${baseUrl}${url}`);
                }

                subtitles = subtitleMatches.map((url, idx) => {
                    const filename = url.split("/").pop() || "";
                    const codeMatch = filename.match(/([a-z]{2,3})(?=\.vtt)/i);
                    const langCode = codeMatch?.[1]?.toLowerCase() || "";
                    const language = languageMap[langCode] || langCode || "Unknown";

                    return {
                        id: `sub-${idx}`,
                        url,
                        language,
                        isDefault: idx === 0,
                    };
                });
            }
        }

        if (subtitles) {
            console.log("Subtitles found:", subtitles);
        }

        return subtitles;
    }

    private async findMediaUrls(type: VideoSourceType, html: string, serverUrl: string, resolutionMatch?: RegExpMatchArray | null, unpacked?: string): Promise<VideoSource[] | VideoSource | undefined> {

        // const teststring = `"});player.src([{src: "/v/67d93a886482187aabca6fded5ce8b1b/5964336.mp4", type`
        const regex = new RegExp('https?:\\/\\/[^\'"]+\\.' + type + '(?:\\?[^\\s\'"]*)?(?:#[^\\s\'"]*)?', 'g');
        let VideoMatch = html.match(regex)
            || unpacked?.match(regex)
            || html.match(new RegExp(`"([^"]+\\.${type})"`, "g"))
            || unpacked?.match(new RegExp(`"([^"]+\\.${type})"`, "g"))

        if (VideoMatch) {
            if (!VideoMatch.some(url => url.startsWith("http"))) {
                const serverurldomain = serverUrl.split("/").slice(0, 3).join("/");
                VideoMatch = VideoMatch.map(url => `${serverurldomain}${url}`.replaceAll(`"`, ""));
            }

            if (VideoMatch.length > 1) {
                // If found multiple, euhm we are cooked... idk yet let me think of it lmao
                console.warn(`Found multiple ${type}`);
            }
            else {
                console.log(`Found ${type} URL:`, VideoMatch[0]);
            }

            if (!VideoMatch)
                return undefined;

            for (const index in VideoMatch) {

                console.log(`PROCESSING: ${VideoMatch[index].substring(0, 50)}...`)
                if (VideoMatch[index].includes(`master.${type}`)) {
                    // fetch the match to see if the m3u8 is main or extension
                    // get the referer of the ServerUrl
                    const ref = serverUrl.split("/").slice(0, 3).join("/");
                    const req = await fetch(`${this.SEANIME_API}${encodeURIComponent(VideoMatch[index])}`);
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
                                console.log("Quality Found: " + qual)
                            }
                            else if (!line.startsWith("#")) {
                                url = line.replace("/api/v1/proxy?url=", "");
                                if (!VideoMatch)
                                    return undefined
                                if (!url.startsWith("http")) {
                                    const baseUrl = VideoMatch[index].substring(0, VideoMatch[index].lastIndexOf('/'))
                                    url = baseUrl + "/" + url
                                }
                                console.log(url)
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
                    else {
                        console.warn(`${type} doesn't have #EXTM3U`)
                    }

                    if (videos.length > 0) {
                        for (const video of videos) {
                            video.subtitles = await this.findSubtitles(html, serverUrl, unpacked);
                        }
                        return videos.sort((a, b) => {
                            const resolutionOrder = ["1080p", "720p", "480p", "360p", "unknown"];
                            const aIndex = resolutionOrder.indexOf(a.quality.split(" ")[2]);
                            const bIndex = resolutionOrder.indexOf(b.quality.split(" ")[2]);
                            return aIndex - bIndex;
                        });
                    }
                    else {
                        console.warn(`${type} master is not in a correct format`)
                        continue
                    }
                }
                else if (type !== "mp4") {
                    console.warn(`No ${type} master URL found`);
                    continue
                }

                console.log("return: " + VideoMatch[index])
                return {
                    url: VideoMatch[index],
                    quality: resolutionMatch ? resolutionMatch[1] : `${this._Server} - unknown`,
                    type: type,
                    subtitles: await this.findSubtitles(html, serverUrl, unpacked)
                };
            }
        }

        return undefined;
    }

    private async HandleServerUrl(serverUrl: string): Promise<VideoSource[] | VideoSource> {
        const reqNoProxy = await fetch(serverUrl)
        let req;

        if (!reqNoProxy.ok) {
            req = await fetch(`${this.SEANIME_API}${encodeURIComponent(serverUrl)}`);

            if (!req.ok) {
                console.log("Failed to fetch server URL:", serverUrl, "Status:", req.status);
                return [];
            }
        }
        else {
            req = reqNoProxy
        }

        const html = await req.text();

        // special case Dean Edwards’ Packer
        // .match(/eval\(function\(p,a,c,k,e,d\)(.*?)\)\)/s);
        function unpack(p: string, a: number, c: number, k: string[]) { while (c--) if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]); return p }
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

        const resolutionRegex = /(?:^|[^a-zA-Z0-9])(\d{3,4})p(?=[^a-zA-Z0-9]|$)/;
        const resolutionMatch =
            html.match(resolutionRegex) ||
            unpacked?.match(resolutionRegex);

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
        if (opts.query === opts.media.romajiTitle)
            return []

        const Lang = opts.dub ? "vf" : "vostfr";
        const queryEnglish = opts.media.englishTitle || opts.query;

        const RegexSeasonProvider = /saison\s*(\d+)/i;
        const RegexPartProvider = /partie\s*(\d+)/i;
        const RegexNumProvider = /(\d+)/;

        const RegexSeasonOpts = queryEnglish.toLowerCase().match(/season\s*(\d+)/i);
        const RegexNumOpts = queryEnglish.toLowerCase().match(/(\d+)/);
        const RegexPartOpts = queryEnglish.toLowerCase().match(/part\s*(\d+)/i);

        let seasonNumberOpts: number | undefined = RegexSeasonOpts ? parseInt(RegexSeasonOpts[1]) :
            opts.media.format === "TV" && RegexNumOpts ? parseInt(RegexNumOpts[1]) : undefined;

        let partNumberOpts: number | undefined = RegexPartOpts ? parseInt(RegexPartOpts[1]) : undefined;

        const queryVariants = this.generateQueryVariants(opts.query, opts.query.trim().split(/[\s:']+/).length);

        const searchPagePromises = queryVariants.map(async (variant) => {
            const bodyData = new URLSearchParams({
                do: "search",
                subaction: "search",
                full_search: "0",
                result_from: "1",
                story: variant
            });

            const html = await fetch(this.SEARCH_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Origin": "https://animesultra.org",
                    "Referer": "https://animesultra.org/",
                },
                body: bodyData.toString()
            }).then(res => res.text());

            return { html, variant };
        });

        const results = await Promise.all(searchPagePromises);

        for (const { html, variant } of results) {
            const $ = await LoadDoc(html);
            const movies = $("div#dle-content .flw-item");

            if (movies.length() === 0) continue;

            const movieList: { Title: string; Url: string }[] = [];

            for (let i = 0; i < movies.length(); i++) {
                const el = movies.eq(i);

                if (el.find("div.tick-dub").text().toLowerCase() !== Lang) continue;

                const Poster = el.find("a.film-poster-ahref");
                const title = Poster.attr("title")?.trim() || "";
                const url = Poster.attr("href")?.trim() || "";

                if (title && url) {
                    const LowerCase = title.toLowerCase();

                    const seasonMatch = LowerCase.match(RegexSeasonProvider);
                    const partMatch = LowerCase.match(RegexPartProvider);
                    const Num = LowerCase.match(RegexNumProvider);

                    const seasonNum = seasonMatch ? parseInt(seasonMatch[1]) : null;
                    const partNum = partMatch ? parseInt(partMatch[1]) : null;
                    const onylNum = Num ? parseInt(Num[1]) : null;

                    if ((seasonNumberOpts && seasonNumberOpts === seasonNum) ||
                        (partNumberOpts && partNumberOpts === partNum) ||
                        (seasonNumberOpts && seasonNumberOpts === onylNum) ||
                        (!seasonNumberOpts && !seasonNum && !partNumberOpts && !partNum && !onylNum)) {
                        movieList.push({ Title: title, Url: url });
                    }
                }
            }

            const bestMovie = this.findBestTitle(movieList, opts.query);
            if (bestMovie) {
                return [{
                    id: bestMovie.Url.split("/").pop()!.split("-")[0],
                    title: bestMovie.Title,
                    url: bestMovie.Url,
                    subOrDub: opts.dub ? "dub" : "sub",
                }];
            }
        }

        return [];
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        console.log(`${this.EPISODE_URL}newsId=${id}&d=${new Date().getTime()}`);

        const $ = await fetch(`${this.EPISODE_URL}newsId=${id}&d=${new Date().getTime()}`)
            .then(res => res.text())
            .then(text => JSON.parse(text))
            .then(json => json.html)
            .then(LoadDoc);

        const ServerToAdd: string[] = [];
        const epsUrl = $(".ep-item");

        const episodeDetails = await Promise.all(
            epsUrl.map(async (_, el) => {
                const href = el.attr("href");
                const title = el.attr("title");
                const episodeId = el.attr("data-id");
                const episodeNumber = parseInt(el.attr("data-number") || "0");

                if (!href || !episodeId) return undefined;

                const episodeDoc = await fetch(href)
                    .then(req => req.text())
                    .then(LoadDoc);

                const serverItems = episodeDoc(".server-item");
                let Servers = "";

                serverItems.each((_, serverEl) => {
                    const serverId = serverEl.attr("data-server-id");
                    if (!serverId) return;

                    const playerSelector = `#content_player_${serverId}`;
                    const playerElement = $(playerSelector);
                    let urlServer = playerElement.text().trim();
                    if (/^\d+$/.test(urlServer)) {
                        urlServer = `https://video.sibnet.ru/shell.php?videoid=${urlServer}`;
                    }
                    if (Servers === "")
                        Servers = urlServer
                    else
                        Servers += "," + urlServer

                    if (urlServer && DevMode) {
                        for (const element of urlServer.trim().replace(/,$/, "").split(",")) {
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

                const episode: EpisodeDetails = {
                    id: Servers,
                    number: episodeNumber,
                    url: href,
                    title,
                };

                return episode;
            })
        );

        if (DevMode && ServerToAdd.length > 0) {
            console.warn(`Need to add server(s): "${ServerToAdd.join(`","`)}"`);
            this.getSettings().episodeServers.push(...ServerToAdd);
        }


        return episodeDetails.filter((ep): ep is EpisodeDetails => !!ep);
    }

    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        this._Server = _server;
        const servers = episode.id.split(",");
        const serverUrls = servers.filter(server => server.includes(_server));
        const videoSources: VideoSource[] = [];

        if (serverUrls.length > 0 && _server !== "") {

            const PromiseResult = await Promise.all(
                serverUrls.map(async url => {
                    return await this.HandleServerUrl(url);
                })
            );

            videoSources.push(...PromiseResult.flat())

        } else {
            console.log(`Server not found: ${_server}\n Try with these servers:\n- ${servers.map(url => {
                const parts = url.split("/");
                const partsServerName = parts[2] ? parts[2].split(".") : [];
                const serverName = partsServerName.length >= 3 ? partsServerName[1] : partsServerName[0];
                return serverName;
            }).join("\n- ")}`);

            return {
                headers: {},
                server: "",
                videoSources: []
            } as EpisodeServer;
        }

        if (videoSources.length > 0) {
            // take the [0] no matter what they have the same ref
            const ref = serverUrls[0].split("/").slice(0, 3).join("/");
            return {
                headers: {
                    referer: ref
                },
                server: _server,
                videoSources: videoSources
            } as EpisodeServer;
        } else {
            console.warn(`No video sources found for server: ${_server}`);
            return {
                headers: {},
                server: `${_server} (video not found)`,
                videoSources: [{
                    url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
                    type: "m3u8",
                    quality: "video not found",
                    subtitles: []
                }]
            } as EpisodeServer;
        }
    }


    //#endregion
}