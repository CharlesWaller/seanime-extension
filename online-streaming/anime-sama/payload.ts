/// <reference path="../_external/.onlinestream-provider.d.ts" />
/// <reference path="../_external/core.d.ts" />

enum Format{
    TV,
    TV_SHORT,
    MOVIE,
    OVA,
    ONA
}

class Provider {
    private readonly SEARCH_URL = "https://anime-sama.fr/template-php/defaut/fetch.php";
    private readonly BODY_SEARCH = "x-www-form-urlencoded: query=";
    getSettings(): Settings {
        return {
            episodeServers: ["Lecteure 1", "Lecteure 2", "Lecteure 3", "Lecteure 4", "Lecteure 5"],
            supportsDub: true,
        };
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> 
    {
        // if format is TV, try to remove season x
        const cleanquery = opts.media.format === Format.TV.toString() ? opts.query.replace(/season \d+/i, "").trim() : opts.query;
        // if format is 
        const body = new URLSearchParams({ query: cleanquery });

        const res = await fetch(
            this.SEARCH_URL,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body
            }
        );
        const html = await res.text();
        const result = <SearchResult[]>[];
        console.log(html);
        /*
                    <a style="z-index:999;" href="https://anime-sama.fr/catalogue/yofukashi-no-uta" class="flex rounded border-t-2 border-sky-600 hover:bg-gray-700 text-white hover:text-sky-500 pt-1 pl-1 w-full transition-all duration-200">

                <img class="h-14 w-14 object-cover m-1 rounded" src="https://cdn.statically.io/gh/Anime-Sama/IMG/img/contenu/yofukashi-no-uta.jpg"/>

                <div class="w-full pr-20 ml-2">

                    <h3 class="text-xs line-clamp-2 uppercase font-extrabold">Yofukashi no Uta</h3>

                    <p class="text-xs truncate opacity-70 italic mt-1">Call of the Night</p>

                </div>

            </a>
         */
        //
        const $ = LoadDoc(html);
        $(".flex.rounded.border-t-2.border-sky-600.hover\\:bg-gray-700.hover\\:text-sky-500").each((_, el) => {
            const link = el.attr("href");
            const title = el.find("h3").text();
            const subtitle = el.find("p").text();

            result.push({
                id: link?.split("/").pop() ?? "",
                title: title,
                url: link ?? "",
                subOrDub: await,
            });
        });

        return result;
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> 
    {
        return <EpisodeDetails[]>[];
    }

    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> 
    {
        return <EpisodeServer>{};
    }
}