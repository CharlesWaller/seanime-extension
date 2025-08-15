/// <reference path="../_external/.onlinestream-provider.d.ts" />
/// <reference path="../_external/core.d.ts" />

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
        // POST: https://anime-sama.fr/template-php/defaut/fetch.php
        // BODY: x-www-form-urlencoded: query={opts.query}

        const body = new URLSearchParams({ query: 'k' });
        
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
        console.log(html);

        return <SearchResult[]>{};
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