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
                return await fetchResponse.json();
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

    makeRequest.listActions = () => makeRequest('list/action');
    makeRequest.listItems = () => makeRequest('list/item');
    makeRequest.listRecipes = () => makeRequest('list/recipe');
    makeRequest.listSkills = () => makeRequest('list/skills');

    makeRequest.getMarketConversion = () => makeRequest('market/conversions');
    makeRequest.getMarketFilters = () => makeRequest('market/filters');
    makeRequest.saveMarketFilter = (filter) => makeRequest('market/filters', filter);
    makeRequest.removeMarketFilter = (id) => makeRequest(`market/filters/${id}/remove`);

    makeRequest.saveWebhook = (webhook) => makeRequest('notification/webhook', webhook);

    makeRequest.handleInterceptedRequest = (interceptedRequest) => makeRequest('request', interceptedRequest);

    makeRequest.getChangelogs = () => makeRequest('settings/changelog');

    return exports;

}
