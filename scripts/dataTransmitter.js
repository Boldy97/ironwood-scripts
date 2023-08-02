(auth, request, events) => {

    function initialise() {
        events.register('xhr', handleXhr);
    }

    async function handleXhr(xhr) {
        if(xhr.status !== 200) {
            return;
        }
        let response = xhr.response;
        if(Array.isArray(response)) {
            response = {
                value: response
            };
        }
        if(xhr.url.endsWith('getUser')) {
            auth.registerName(response.user.displayName);
        }
        await request('request', {
            url: xhr.url,
            status: xhr.status,
            payload: JSON.stringify(xhr.request),
            response: JSON.stringify(response)
        });
        if(xhr.url.endsWith('getUser')) {
            events.emit('user', response);
        }
    }

    initialise();

}
