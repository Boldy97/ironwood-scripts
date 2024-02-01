(request, Promise) => {

    const initialised = new Promise.Expiring(2000);

    const exports = {
        list: [],
        byId: null,
        byName: null,
        byImage: null,
        attributes: null,
        specialIds: {
            coins: null,
            food: null,
            arrow: null,
            map: null,
            runeGathering: null,
            potionCombat: null,
            potionGathering: null,
            potionCrafting: null,
        }
    };

    async function initialise() {
        const enrichedItems = await request.listItems();
        exports.byId = {};
        exports.byName = {};
        exports.byImage = {};
        for(const enrichedItem of enrichedItems) {
            const item = Object.assign(enrichedItem.item, enrichedItem);
            delete item.item;
            exports.list.push(item);
            exports.byId[item.id] = item;
            exports.byName[item.name] = item;
            const lastPart = item.image.split('/').at(-1);
            if(exports.byImage[lastPart]) {
                exports.byImage[lastPart].duplicate = true;
            } else {
                exports.byImage[lastPart] = item;
            }
            if(!item.attributes) {
                item.attributes = {};
            }
            if(item.charcoal) {
                item.attributes.CHARCOAL = item.charcoal;
            }
            if(item.compost) {
                item.attributes.COMPOST = item.compost;
            }
            if(item.attributes.ATTACK_SPEED) {
                item.attributes.ATTACK_SPEED /= 2;
            }
            for(const stat in item.stats.bySkill) {
                if(item.stats.bySkill[stat].All) {
                    item.stats.global[stat] = item.stats.bySkill[stat].All;
                    delete item.stats.bySkill[stat].All;
                    if(!Object.keys(item.stats.bySkill[stat]).length) {
                        delete item.stats.bySkill[stat];
                    }
                }
            }
        }
        for(const image of Object.keys(exports.byImage)) {
            if(exports.byImage[image].duplicate) {
                delete exports.byImage[image];
            }
        }
        exports.attributes = await request.listItemAttributes();
        exports.attributes.push({
            technicalName: 'CHARCOAL',
            name: 'Charcoal',
            image: '/assets/items/charcoal.png'
        },{
            technicalName: 'COMPOST',
            name: 'Compost',
            image: '/assets/misc/compost.png'
        });
        exports.specialIds.coins = exports.byName['Coins'].id;
        exports.specialIds.food = exports.list.filter(a => /^Cooked|Pie$/.exec(a.name)).map(a => a.id);
        exports.specialIds.arrow = exports.list.filter(a => /Arrow$/.exec(a.name)).map(a => a.id);
        exports.specialIds.map = exports.list.filter(a => /Map \d+$/.exec(a.name)).map(a => a.id);
        const potions = exports.list.filter(a => /(Potion|Mix)$/.exec(a.name));
        exports.specialIds.potionCombat = potions.filter(a => !a.name.includes('Gather') && !a.name.includes('Craft') && !a.name.includes('Preservation')).map(a => a.id);
        exports.specialIds.potionGathering = potions.filter(a => a.name.includes('Gather')).map(a => a.id);
        exports.specialIds.potionCrafting = potions.filter(a => a.name.includes('Craft') || a.name.includes('Preservation')).map(a => a.id);
        exports.specialIds.runeGathering = exports.list.filter(a => /(Woodcutting|Mining|Farming|Fishing) Rune$/.exec(a.name)).map(a => a.id);
        initialised.resolve(exports);
    }

    initialise();

    return initialised;

}
