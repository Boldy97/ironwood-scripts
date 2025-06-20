(events, elementWatcher, util, skillCache) => {

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
        // marks - right menu
        $(document).on('click', 'marks-page .header:contains("Menu") ~ button', () => debouncedUpdate());
        // traits - right menu
        $(document).on('click', 'traits-page .header:contains("Menu") ~ button', () => debouncedUpdate());
        // action - menu
        $(document).on('click', 'skill-page actions-component .filters', () => debouncedUpdate());
        // action - submenu
        $(document).on('click', 'skill-page actions-component .sort > .container', () => debouncedUpdate());
        // mastery - menu
        $(document).on('click', 'mastery-page .group:last-child .tabs > button', () => debouncedUpdate());
        // mastery - submenu
        $(document).on('click', 'mastery-page .group:last-child button.row', () => debouncedUpdate());
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
        } else if(url.includes('/marks')) {
            const menu = $('marks-page .header:contains("Menu") ~ button.row-active .name').text().toLowerCase();
            result = {
                type: 'marks',
                menu
            };
        } else if(url.includes('/traits')) {
            const menu = $('traits-page .header:contains("Menu") ~ button.row-active .name').text().toLowerCase();
            result = {
                type: 'traits',
                menu
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
        } else if(url.includes('/mastery')) {
            const menu = $('mastery-page .group:last-child .tabs > button[disabled]').text().toLowerCase() || null;
            let skill = $('mastery-page .group:last-child button.row.row-active > .name').text() || null;
            if(menu !== 'skills') {
                skill = null;
            }
            result = {
                type: 'mastery',
                menu,
                skill: skill ? skillCache.byName[skill].id : null
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
