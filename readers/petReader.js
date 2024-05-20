(events, petCache, petPassiveCache, petTraitCache, elementWatcher, util) => {

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
            values.push({
                parsed: false,
                species: petCache.byImage[image].id,
                family: petCache.byImage[image].family,
                name,
                level,
                partOfTeam,
                element: element.get()
            });
        }
        emitEvent({
            type: 'list',
            value: values
        });
    }

    function readPetModal(modal) {
        if(!$(modal).find('.name:contains("Traits")').length) {
            return; // avoid triggering on other modals
        }
        const image = $(modal).find('.header img').attr('src').split('/').at(-1);
        const name = $(modal).find('.header .description button').text().trim();
        const traits = $(modal).find('.name:contains("Traits")').next().text();
        const health = +($(modal).find('.name:contains("Health") + .mono').text().match('\\((\\d+)%\\)')[1]);
        const attack = +($(modal).find('.name:contains("Attack") + .mono').text().match('\\((\\d+)%\\)')[1]);
        const defense = +($(modal).find('.name:contains("Defense") + .mono').text().match('\\((\\d+)%\\)')[1]);
        const specialAttack = +($(modal).find('.name:contains("Sp. Atk") + .mono').text().match('\\((\\d+)%\\)')[1]);
        const specialDefense = +($(modal).find('.name:contains("Sp. Def") + .mono').text().match('\\((\\d+)%\\)')[1]);
        const speed = +($(modal).find('.name:contains("Speed") + .mono').text().match('\\((\\d+)%\\)')[1]);
        const passives = $(modal).find('.name:contains("Total")').parent().nextAll('.row').find('.name').get().map(a => a.innerText);
        const pet = {
            parsed: true,
            species: petCache.byImage[image].id,
            family: petCache.byImage[image].family,
            name,
            traits: petTraitCache.byName[traits].id,
            health,
            attack,
            defense,
            specialAttack,
            specialDefense,
            speed,
            passives: passives.map(a => petPassiveCache.byName[a].id)
        };
        const healthRow = $(modal).find('.name:contains("Health") + .mono').parent();
        if(!healthRow.hasClass('stat-health')) {
            $(modal).find('.name:contains("Health") + .mono').parent().addClass('stat-health');
            $(modal).find('.name:contains("Attack") + .mono').parent().addClass('stat-attack');
            $(modal).find('.name:contains("Defense") + .mono').parent().addClass('stat-defense');
            $(modal).find('.name:contains("Sp. Atk") + .mono').parent().addClass('stat-specialAttack');
            $(modal).find('.name:contains("Sp. Def") + .mono').parent().addClass('stat-specialDefense');
            $(modal).find('.name:contains("Speed") + .mono').parent().addClass('stat-speed');
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
