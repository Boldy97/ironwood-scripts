(events, skillCache, util) => {

    const emitEvent = events.emit.bind(null, 'reader-exp');

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if(!page) {
            return;
        }
        if(page.type === 'action') {
            readActionScreen(page.skill);
        }
        if(page.type === 'taming') {
            readTamingScreen();
        }
        readSidebar();
    }

    function readActionScreen(id) {
        const text = $('skill-page .header > .name:contains("Stats")')
            .closest('.card')
            .find('.row > .name:contains("Total"):contains("XP")')
            .closest('.row')
            .find('.value')
            .text();
        const exp = util.parseNumber(text);
        emitEvent([{ id, exp }]);
    }

    function readTamingScreen() {
        const text = $('taming-page .header > .name:contains("Stats")')
            .closest('.card')
            .find('.row > .name:contains("Total"):contains("XP")')
            .closest('.row')
            .find('.amount')
            .text();
        const exp = util.parseNumber(text);
        emitEvent([{
            exp,
            id: skillCache.byName['Taming'].id
        }]);
    }

    function readSidebar() {
        const levels = [];
        $('nav-component button.skill').each((i,element) => {
            element = $(element);
            const name = element.find('.name').text();
            const id = skillCache.byName[name].id;
            const level = +(/\d+/.exec(element.find('.level').text())?.[0]);
            const exp = util.levelToExp(level);
            levels.push({ id, exp });
        });
        emitEvent(levels);
    }

    initialise();

}
