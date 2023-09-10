(auth, events) => {

    const authenticated = auth.ready;
    const registerUrlHandler = events.register.bind(null, 'url');
    const emitEvent = events.emit.bind(null, 'page');

    async function initialise() {
        await authenticated;
        registerUrlHandler(handleUrl);
    }

    function handleUrl(url) {
        let result = null;
        const parts = url.split('/');
        if(url.includes('/skill/') && url.includes('/action/')) {
            result = {
                type: 'action',
                skill: +parts[parts.length-3],
                action: +parts[parts.length-1]
            };
        } else if(url.includes('house/produce')) {
            result = {
                type: 'automation',
                building: +parts[parts.length-2],
                action: +parts[parts.length-1]
            };
        } else if(url.includes('house/build')) {
            result = {
                type: 'structure',
                building: +parts[parts.length-1]
            };
        } else {
            result = {
                type: parts.pop()
            };
        }
        emitEvent(result);
    }

    initialise();

}
