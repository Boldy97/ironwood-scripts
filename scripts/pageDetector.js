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
        if(url.includes('/skill/') && url.includes('/action/')) {
            const parts = url.split('/');
            result = {
                type: 'action',
                skill: +parts[parts.length-3],
                action: +parts[parts.length-1]
            };
        } else if(url.includes('house/produce')) {
            const parts = url.split('/');
            result = {
                type: 'automation',
                building: +parts[parts.length-2],
                action: +parts[parts.length-1]
            };
        } else if(url.endsWith('/equipment')) {
            result = {
                type: 'equipment'
            };
        }
        emitEvent(result);
    }

    initialise();

}
