(events, elementWatcher, util) => {

    const emitEvent = events.emit.bind(null, 'page');
    const debouncedUpdate = util.debounce(update, 100);

    async function initialise() {
        events.register('url', debouncedUpdate);
        // taming - right menu
        $(document).on('click', 'taming-page .header:contains("Menu") ~ button', () => debouncedUpdate());
        // taming - expedition page
        $(document).on('click', 'taming-page .header:contains("Expeditions") ~ button', () => debouncedUpdate());
        // taming - expedition selection
        $(document).on('click', 'taming-page .header:contains("Expeditions") > button', () => debouncedUpdate());
        // action - menu
        $(document).on('click', 'skill-page actions-component .filters', () => debouncedUpdate());
        // action - submenu
        $(document).on('click', 'skill-page actions-component .sort > .container', () => debouncedUpdate());
    }

    async function update(url) {
        if(!url) {
            url = events.getLast('url');
        }
        let result = null;
        const parts = url.split('/');
        await elementWatcher.idle();
        if(url.includes('/skill/15')) {
            const menu = $('taming-page .header:contains("Menu") ~ button.row-active .name').text().toLowerCase();
            let tier = 0;
            if(menu === 'expeditions') {
                const level = util.parseNumber($('taming-page .header:contains("Expeditions") ~ button.row-active .level').text());
                tier = util.levelToTier(level);
            }
            result = {
                type: 'taming',
                menu,
                tier
            };
        } else if(url.includes('/skill/') && url.includes('/action/')) {
            const menu = $('skill-page actions-component .filters > button[disabled]').text().toLowerCase() || null;
            const submenu = $('skill-page actions-component .sort button[disabled]').text().toLowerCase() || null;
            result = {
                type: 'action',
                skill: +parts[parts.length-3],
                action: +parts[parts.length-1],
                menu,
                submenu
            };
        } else if(url.includes('house/build')) {
            result = {
                type: 'structure',
                structure: +parts[parts.length-1]
            };
        } else if(url.includes('house/enchant')) {
            result = {
                type: 'enchantment',
                structure: +parts[parts.length-1]
            };
        } else if(url.includes('house/automate')) {
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
        emitEvent(result);
    }

    initialise();

}
