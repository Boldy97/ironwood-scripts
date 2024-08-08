(configuration, elementCreator, elementWatcher, itemCache, util, events, skillCache) => {

    let enabled = false;
    let element;

    const SKILLS = ['Smelting', 'Smithing', 'Enchanting'];
    const TIERS = [{
        item: itemCache.byName['Copper Bar'],
        amount: 50
    },{
        item: itemCache.byName['Iron Bar'],
        amount: 250
    },{
        item: itemCache.byName['Silver Bar'],
        amount: 750
    },{
        item: itemCache.byName['Gold Bar'],
        amount: 1500
    },{
        item: itemCache.byName['Cobalt Bar'],
        amount: 2500
    },{
        item: itemCache.byName['Obsidian Bar'],
        amount: 3500
    },{
        item: itemCache.byName['Astral Bar'],
        amount: 5000
    },{
        item: itemCache.byName['Infernal Bar'],
        amount: 7500
    }];

    function initialise() {
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'craft-cheat-sheet',
            name: 'Crafting Cheat Sheet',
            default: true,
            handler: handleConfigStateChange
        });
        element = setup();
        elementWatcher.addRecursiveObserver(onModal, 'app-component > div.scroll div.wrapper', 'skill-page', 'modal-component');
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function onModal(modal) {
        if(!enabled) {
            return;
        }
        if(!$(modal).find('button.craft:contains("Craft")').length) {
            return; // avoid triggering on other modals
        }
        const pageEvent = events.getLast('page');
        const skill = skillCache.byId[pageEvent.skill].displayName;
        if(!SKILLS.includes(skill)) {
            return; // only for whitelisted skills
        }
        $(modal).append(element);
    }

    function setup() {
        elementCreator.addStyles(styles);
        const html = TIERS.map(tier => `
            <img src='/assets/${tier.item.image}'/>
            <span>${tier.item.name.split(' ')[0]}</span>
            <span>${util.formatNumber(tier.amount)}</span>
            <span>${util.formatNumber(3*tier.amount)}</span>
        `).join('');
        const element = $(`
            <div id='custom-craft-cheat-sheet'>
                <b style="grid-column:span 2">Tier</b>
                <b>One</b>
                <b>All</b>
                ${html}
            </div>
        `);
        return element;
    }

    const styles = `
        #custom-craft-cheat-sheet {
            position: fixed;
            right: .5em;
            bottom: .5em;
            font-family: Jost,Helvetica Neue,Arial,sans-serif;
            z-index: 3;
            background-color: black;
            padding: .4rem;
            border: 1px solid #3e3e3e;
            border-radius: .4em;
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: .4em;
            justify-items: start;
        }
        #custom-craft-cheat-sheet > :nth-child(-n+3) {
            justify-self: center;
        }
        #custom-craft-cheat-sheet > :nth-child(4n+4), #custom-craft-cheat-sheet > :nth-child(4n+5) {
            justify-self: start;
        }
        #custom-craft-cheat-sheet > :nth-child(4n+6), #custom-craft-cheat-sheet > :nth-child(4n+7) {
            justify-self: end;
        }
        #custom-craft-cheat-sheet img {
            width: 32px;
            height: 32px;
            image-rendering: pixelated;
        }
    `;

    initialise();

}
