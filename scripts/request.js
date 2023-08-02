(auth) => {

    const exports = makeRequest;

    let CURRENT_REQUEST = null;

    async function makeRequest(url, body) {
        await auth.authenticated();
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
                    return "OK";
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

    return exports;

}
