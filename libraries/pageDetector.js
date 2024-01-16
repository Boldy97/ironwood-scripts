(events, elementWatcher, util) => {

    const registerUrlHandler = events.register.bind(null, 'url');
    const emitEvent = events.emit.bind(null, 'page');

    async function initialise() {
        registerUrlHandler(util.debounce(handleUrl, 200));
    }

    async function handleUrl(url) {
        let result = null;
        const parts = url.split('/');
        if(url.includes('/skill/') && url.includes('/action/')) {
            result = {
                type: 'action',
                skill: +parts[parts.length-3],
                action: +parts[parts.length-1]
            };
        } else if(url.includes('house/build')) {
            result = {
                type: 'structure',
                structure: +parts[parts.length-1]
            };
        } else if(url.includes('house/enhance')) {
            result = {
                type: 'enhancement',
                structure: +parts[parts.length-1]
            };
        } else if(url.includes('house/produce')) {
            result = {
                type: 'automation',
                structure: +parts[parts.length-2],
                action: +parts[parts.length-1]
            };
        } else {
            result = {
                type: parts.pop()
            };
        }
        await elementWatcher.idle();
        emitEvent(result);
    }

    initialise();

}
