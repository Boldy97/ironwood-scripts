(auth) => {

    const authenticated = auth.ready;

    let CURRENT_REQUEST = null;

    async function makeAuthenticatedRequest(url, body) {
        return makeRequest(url, body, true);
    }

    async function makeRequest(url, body, useAuthentication) {
        if(useAuthentication) {
            await authenticated;
            await throttle();
        }
        const headers = useAuthentication ? auth.getHeaders() : {
            'Content-Type': 'application/json'
        };
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

    makeRequest.authenticated = makeAuthenticatedRequest;

    // alphabetical

    makeRequest.getConfigurations = () => makeRequest.authenticated('configuration');
    makeRequest.saveConfiguration = (key, value) => makeRequest.authenticated('configuration', {[key]: value});

    makeRequest.getActionEstimation = (skill, action) => makeRequest.authenticated(`estimation/action?skill=${skill}&action=${action}`);
    makeRequest.getAutomationEstimation = (action) => makeRequest.authenticated(`estimation/automation?id=${action}`);

    makeRequest.getGuildMembers = () => makeRequest.authenticated('guild/members');
    makeRequest.registerGuildQuest = (itemId, amount) => makeRequest.authenticated('guild/quest/register', {itemId, amount});
    makeRequest.getGuildQuestStats = () => makeRequest.authenticated('guild/quest/stats');
    makeRequest.unregisterGuildQuest = (itemId) => makeRequest.authenticated('guild/quest/unregister', {itemId});

    makeRequest.getLeaderboardGuildRanks = () => makeRequest.authenticated('leaderboard/ranks/guild');

    makeRequest.getMarketFilters = () => makeRequest.authenticated('market/filters');
    makeRequest.saveMarketFilter = (filter) => makeRequest.authenticated('market/filters', filter);
    makeRequest.removeMarketFilter = (id) => makeRequest.authenticated(`market/filters/${id}/remove`);

    makeRequest.saveWebhook = (webhook) => makeRequest.authenticated('notification/webhook', webhook);

    makeRequest.listActions = () => makeRequest('public/list/action');
    makeRequest.listItems = () => makeRequest('public/list/item');
    makeRequest.listItemAttributes = () => makeRequest('public/list/itemAttributes');
    makeRequest.listRecipes = () => makeRequest('public/list/recipe');
    makeRequest.listSkills = () => makeRequest('public/list/skills');

    makeRequest.getMarketConversion = () => makeRequest('public/market/conversions');

    makeRequest.getChangelogs = () => makeRequest('public/settings/changelog');
    makeRequest.getVersion = () => makeRequest('public/settings/version');

    makeRequest.handleInterceptedRequest = (interceptedRequest) => makeRequest.authenticated('request', interceptedRequest);

    return makeRequest;

}
