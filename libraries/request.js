(logService, Promise) => {

    async function requestWithFallback(fallback, url, body, headers) {
        try {
            const expiring = new Promise.Expiring(2000, 'requestWithFallback - ' + url);
            request(url, body, headers)
                .then(a => expiring.resolve(a))
                .catch(a => expiring.reject(a));
            const result = await expiring;
            return result;
        } catch(e) {
            console.warn('Fetching fallback cache for ' + url, e);
            return JSON.parse(fallback);
        }
    }

    async function request(url, body, headers) {
        if(!headers) {
            headers = {};
        }
        headers['Content-Type'] = 'application/json';
        const method = body !== undefined ? 'POST' : 'GET';
        try {
            if(body !== undefined) {
                body = JSON.stringify(body);
            }
            const fetchResponse = await fetch(`${window.PANCAKE_ROOT}/${url}`, {method, headers, body});
            if(fetchResponse.status !== 200) {
                throw await fetchResponse.text();
            }
            try {
                const contentType = fetchResponse.headers.get('Content-Type');
                if(contentType.startsWith('text/plain')) {
                    return await fetchResponse.text();
                } else if(contentType.startsWith('application/json')) {
                    return await fetchResponse.json();
                } else {
                    console.error(`Unknown content type : ${contentType}`);
                }
            } catch(e) {
                if(body) {
                    return 'OK';
                }
            }
        } catch(e) {
            logService.error(e);
            throw `Failed fetching ${url} : ${e}`;
        }
    }

    // alphabetical

    request.forwardDataGuildLevel = (guild, level) => request(`public/data/guild/${guild}/level`, level);
    request.forwardDataGuildStructures = (guild, data) => request(`public/data/guild/${guild}/structures`, data);
    request.forwardDataGuildEventTime = (guild, type, time) => request(`public/data/guild/${guild}/event/${type}`, time);
    request.createDiscordRegistration = (registration) => request('public/discord', registration);
    request.getDiscordRegistrationTypes = () => request('public/discord/types');
    request.getDiscordRegistration = (id) => request(`public/discord/${id}`);
    request.setTimeDiscordRegistration = (id, time) => request(`public/discord/${id}/time`, time);
    request.setEnabledDiscordRegistration = (id, enabled) => request(`public/discord/${id}/enabled`, enabled);
    request.unlinkDiscordRegistration = (id) => request(`public/discord/${id}/unlink`);
    request.deleteDiscordRegistration = (id) => request(`public/discord/${id}/delete`);
    request.listActions = () => requestWithFallback('{ACTION_CACHE_DATA}', 'public/list/action');
    request.listDrops = () => requestWithFallback('{DROP_CACHE_DATA}', 'public/list/drop');
    request.listExpeditions = () => requestWithFallback('{EXPEDITION_CACHE_DATA}', 'public/list/expedition');
    request.listExpeditionDrops = () => requestWithFallback('{EXPEDITION_DROP_CACHE_DATA}', 'public/list/expeditionDrop');
    request.listIngredients = () => requestWithFallback('{INGREDIENT_CACHE_DATA}', 'public/list/ingredient');
    request.listItems = () => requestWithFallback('{ITEM_CACHE_DATA}', 'public/list/item');
    request.listItemAttributes = () => requestWithFallback('{ITEM_ATTRIBUTE_CACHE_DATA}', 'public/list/itemAttribute');
    request.listItemStats = () => requestWithFallback('{ITEM_STAT_CACHE_DATA}', 'public/list/itemStat');
    request.listMonsters = () => requestWithFallback('{MONSTER_CACHE_DATA}', 'public/list/monster');
    request.listPets = () => requestWithFallback('{PET_CACHE_DATA}', 'public/list/pet');
    request.listPetPassives = () => requestWithFallback('{PET_PASSIVE_CACHE_DATA}', 'public/list/petPassive');
    request.listRecipes = () => requestWithFallback('{RECIPE_CACHE_DATA}', 'public/list/recipe');
    request.listSkills = () => requestWithFallback('{SKILL_CACHE_DATA}', 'public/list/skill');
    request.listSkillSets = () => requestWithFallback('{SKILLSET_CACHE_DATA}', 'public/list/skillSet');
    request.listStructures = () => requestWithFallback('{STRUCTURE_CACHE_DATA}', 'public/list/structure');

    request.report = (data) => request('public/report', data);

    request.getChangelogs = () => request('public/settings/changelog');
    request.getPetVersion = () => requestWithFallback('{PET_VERSION_CACHE_DATA}', 'public/settings/petVersion');
    request.getVersion = () => request('public/settings/version');

    return request;

}
