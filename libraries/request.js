() => {

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
                console.error(await fetchResponse.text());
                console.log('response', fetchResponse);
                throw fetchResponse;
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
            console.log('error', e);
            throw `Failed fetching ${url} : ${e}`;
        }
    }

    // alphabetical

    request.forwardDataGuildLevel = (guild, level) => request(`public/data/guild/${guild}/level`, level);
    request.forwardDataGuildStructures = (guild, data) => request(`public/data/guild/${guild}/structures`, data);
    request.createDiscordRegistration = (registration) => request('public/discord', registration);
    request.getDiscordRegistrationTypes = () => request('public/discord/types');
    request.getDiscordRegistration = (id) => request(`public/discord/${id}`);
    request.setTimeDiscordRegistration = (id, time) => request(`public/discord/${id}/time`, time);
    request.setEnabledDiscordRegistration = (id, enabled) => request(`public/discord/${id}/enabled`, enabled);
    request.unlinkDiscordRegistration = (id) => request(`public/discord/${id}/unlink`);
    request.deleteDiscordRegistration = (id) => request(`public/discord/${id}/delete`);
    request.listActions = () => request('public/list/action');
    request.listDrops = () => request('public/list/drop');
    request.listExpeditions = () => request('public/list/expedition');
    request.listExpeditionDrops = () => request('public/list/expeditionDrop');
    request.listItems = () => request('public/list/item');
    request.listItemAttributes = () => request('public/list/itemAttribute');
    request.listIngredients = () => request('public/list/ingredient');
    request.listMonsters = () => request('public/list/monster');
    request.listPets = () => request('public/list/pet');
    request.listPetPassives = () => request('public/list/petPassive');
    request.listRecipes = () => request('public/list/recipe');
    request.listSkills = () => request('public/list/skill');
    request.listStructures = () => request('public/list/structure');

    request.report = (data) => request('public/report', data);

    request.getChangelogs = () => request('public/settings/changelog');
    request.getPetVersion = () => request('public/settings/petVersion');
    request.getVersion = () => request('public/settings/version');

    return request;

}
