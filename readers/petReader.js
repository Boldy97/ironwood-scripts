(events, petCache, petPassiveCache, elementWatcher, util, petUtil) => {

    const emitEvent = events.emit.bind(null, 'reader-pet');

    function initialise() {
        events.register('page', handlePage);
        elementWatcher.addRecursiveObserver(readPetModal, 'app-component > div.scroll div.wrapper', 'taming-page', 'modal-component');
    }

    function handlePage(page) {
        if(page.type === 'taming' && page.menu === 'pets') {
            readTamingScreen();
        }
    }

    function readTamingScreen() {
        const elements = $('button.row.ng-star-inserted').get();
        const values = [];
        for(let element of elements) {
            element = $(element);
            const image = element.find('.image img').attr('src').split('/').at(-1);
            const name = element.find('.image').next().find('.flex > :nth-child(1)')[0].textContent;
            const level = util.parseNumber(element.find('.image').next().find('.flex > :nth-child(2)')[0].textContent);
            const partOfTeam = !!element.closest('.card').find('.header:contains("Expedition Team")').length;
            const partOfRanch = !!element.closest('.card').find('.header:contains("Ranch")').length;
            values.push({
                parsed: false,
                version: petUtil.VERSION,
                species: petCache.byImage[image].id,
                family: petCache.byImage[image].family,
                name,
                level,
                partOfTeam,
                partOfRanch,
                element: element[0]
            });
        }
        emitEvent({
            type: 'list',
            value: values
        });
    }

    function readPetModal(modal) {
        if(!$(modal).find('.name:contains("Abilities")').length) {
            return; // avoid triggering on other modals
        }
        const image = $(modal).find('.header img').attr('src').split('/').at(-1);
        const name = $(modal).find('.header .description > button').text().trim();
        const level = util.parseNumber($(modal).find('.header .description > div').text().trim());
        const health = +($(modal).find('.name:contains("Health") + .mono').text().match('\\((\\d+)%\\)')[1]);
        const attack = +($(modal).find('.name:contains("Attack") + .mono').text().match('\\((\\d+)%\\)')[1]);
        const defense = +($(modal).find('.name:contains("Defense") + .mono').text().match('\\((\\d+)%\\)')[1]);
        const passives = $(modal).find('.name:contains("Total")').parent().nextAll('.row').find('.name').get().map(a => a.innerText);
        const pet = {
            parsed: true,
            version: petUtil.VERSION,
            species: petCache.byImage[image].id,
            family: petCache.byImage[image].family,
            name,
            level,
            health,
            attack,
            defense,
            passives: passives.map(a => petPassiveCache.byName[a].id)
        };
        const healthRow = $(modal).find('.name:contains("Health") + .mono').parent();
        if(!healthRow.hasClass('stat-health')) {
            $(modal).find('.name:contains("Health") + .mono').parent().addClass('stat-health');
            $(modal).find('.name:contains("Attack") + .mono').parent().addClass('stat-attack');
            $(modal).find('.name:contains("Defense") + .mono').parent().addClass('stat-defense');
            for(const id of pet.passives) {
                const passive = petPassiveCache.byId[id];
                $(modal).find(`.name:contains("${passive.name}")`).parent().addClass(`passive-${passive.stats.name}`);
            }
        }
        emitEvent({
            type: 'single',
            value: pet,
            modal: modal
        });
    }

    initialise();

}
