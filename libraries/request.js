(auth) => {

    const authenticated = auth.ready;

    const exports = makeRequest;

    let CURRENT_REQUEST = null;

    async function makeRequest(url, body) {
        await authenticated;
        await throttle();
        const headers = auth.getHeaders();
        const method = body ? 'POST' : 'GET';
        try {
            if(body) {
                body = JSON.stringify(body);
            }
            CURRENT_REQUEST = fetch(`${window.PANCAKE_ROOT}/${url}`, {method, headers, body});
            const fetchResponse = await CURRENT_REQUEST;
            if(fetchResponse.status !== 200) {
                console.error(await fetchResponse.text());
                return;
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
            console.error(e);
        }
    }

    async function throttle() {
        if(!CURRENT_REQUEST) {
            CURRENT_REQUEST = Promise.resolve();
        }
        while(CURRENT_REQUEST) {
            const waitingOn = CURRENT_REQUEST;
            try {
                await CURRENT_REQUEST;
            } catch(e) { }
            if(CURRENT_REQUEST === null) {
                CURRENT_REQUEST = Promise.resolve();
                continue;
            }
            if(CURRENT_REQUEST === waitingOn) {
                CURRENT_REQUEST = null;
            }
        }
    }

    // alphabetical

    makeRequest.getConfigurations = () => makeRequest('configuration');
    makeRequest.saveConfiguration = (key, value) => makeRequest('configuration', {[key]: value});

    makeRequest.getActionEstimation = (skill, action) => makeRequest(`estimation/action?skill=${skill}&action=${action}`);
    makeRequest.getAutomationEstimation = (action) => makeRequest(`estimation/automation?id=${action}`);

    makeRequest.getGuildMembers = () => makeRequest('guild/members');
    makeRequest.registerGuildQuest = (itemId, amount) => makeRequest('guild/quest/register', {itemId, amount});
    makeRequest.getGuildQuestStats = () => makeRequest('guild/quest/stats');
    makeRequest.unregisterGuildQuest = (itemId) => makeRequest('guild/quest/unregister', {itemId});

    makeRequest.getLeaderboardGuildRanks = () => makeRequest('leaderboard/ranks/guild');

    makeRequest.getMarketConversion = () => makeRequest('market/conversions');
    makeRequest.getMarketFilters = () => makeRequest('market/filters');
    makeRequest.saveMarketFilter = (filter) => makeRequest('market/filters', filter);
    makeRequest.removeMarketFilter = (id) => makeRequest(`market/filters/${id}/remove`);

    makeRequest.saveWebhook = (webhook) => makeRequest('notification/webhook', webhook);

    makeRequest.listActions = () => makeRequest('public/list/action');
    makeRequest.listItems = () => makeRequest('public/list/item');
    makeRequest.listItemAttributes = () => makeRequest('public/list/itemAttributes');
    makeRequest.listRecipes = () => makeRequest('public/list/recipe');
    makeRequest.listSkills = () => makeRequest('public/list/skills');

    makeRequest.getChangelogs = () => makeRequest('public/settings/changelog');
    makeRequest.getVersion = () => makeRequest('public/settings/version');

    makeRequest.handleInterceptedRequest = (interceptedRequest) => makeRequest('request', interceptedRequest);


    return exports;

}
