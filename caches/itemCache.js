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
            mainHand: null,
            offHand: null,
            helmet: null,
            body: null,
            gloves: null,
            boots: null,
            amulet: null,
            ring: null,
            bracelet: null,
            hatchet: null,
            pickaxe: null,
            spade: null,
            rod: null,
            dagger: null,
            telescope: null,
            food: null,
            arrow: null,
            potionGathering: null,
            potionCrafting: null,
            potionCombat: null,
            map: null,
            runeWoodcutting: null,
            runeMining: null,
            runeFarming: null,
            runeFishing: null,
            runeGathering: null,
            runeOneHanded: null,
            runeTwoHanded: null,
            runeRanged: null,
            runeDefense: null,
            runeUtility: null,
            tomeSavageLooting: null,
            tomeBountifulHarvest: null,
            tomeOpulentCrafting: null,
            tomeEternalLife: null,
            tomeInsatiablePower: null,
            tomePotentConcoction: null,
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
        const potions = exports.list.filter(a => /(Potion|Mix)$/.exec(a.name));
        // we do not cover any event items
        exports.specialIds.coins = exports.byName['Coins'].id;
        exports.specialIds.mainHand = getAllIdsEnding('Sword', 'Hammer', 'Spear', 'Scythe', 'Bow', 'Boomerang');
        exports.specialIds.offHand = getAllIdsEnding('Shield');
        exports.specialIds.helmet = getAllIdsEnding('Helmet');
        exports.specialIds.body = getAllIdsEnding('Body');
        exports.specialIds.gloves = getAllIdsEnding('Gloves');
        exports.specialIds.boots = getAllIdsEnding('Boots');
        exports.specialIds.amulet = getAllIdsEnding('Amulet');
        exports.specialIds.ring = getAllIdsEnding('Ring');
        exports.specialIds.bracelet = getAllIdsEnding('Bracelet');
        exports.specialIds.hatchet = getAllIdsEnding('Hatchet');
        exports.specialIds.pickaxe = getAllIdsEnding('Pickaxe');
        exports.specialIds.spade = getAllIdsEnding('Spade');
        exports.specialIds.rod = getAllIdsEnding('Rod');
        exports.specialIds.dagger = getAllIdsEnding('Dagger');
        exports.specialIds.telescope = getAllIdsEnding('Telescope');
        // this does not cover vegetables
        exports.specialIds.food = exports.list.filter(a => /^Cooked|Pie$/.exec(a.name)).map(a => a.id);
        exports.specialIds.arrow = getAllIdsEnding('Arrow');
        exports.specialIds.potionGathering = potions.filter(a => a.name.includes('Gather')).map(a => a.id);
        exports.specialIds.potionCrafting = potions.filter(a => a.name.includes('Craft') || a.name.includes('Preservation')).map(a => a.id);
        exports.specialIds.potionCombat = potions.filter(a => !a.name.includes('Gather') && !a.name.includes('Craft') && !a.name.includes('Preservation')).map(a => a.id);
        exports.specialIds.map = getAllIdsStarting('Dungeon Map');
        exports.specialIds.runeWoodcutting = getAllIdsEnding('Woodcutting Rune');
        exports.specialIds.runeMining = getAllIdsEnding('Mining Rune');
        exports.specialIds.runeFarming = getAllIdsEnding('Farming Rune');
        exports.specialIds.runeFishing = getAllIdsEnding('Fishing Rune');
        exports.specialIds.runeGathering = [
            ...exports.specialIds.runeWoodcutting,
            ...exports.specialIds.runeMining,
            ...exports.specialIds.runeFarming,
            ...exports.specialIds.runeFishing
        ];
        exports.specialIds.runeOneHanded = getAllIdsEnding('One-handed Rune');
        exports.specialIds.runeTwoHanded = getAllIdsEnding('Two-handed Rune');
        exports.specialIds.runeRanged = getAllIdsEnding('Ranged Rune');
        exports.specialIds.runeDefense = getAllIdsEnding('Defense Rune');
        exports.specialIds.runeUtility = getAllIdsEnding('Crit Rune', 'Damage Rune', 'Block Rune', 'Stun Rune', 'Bleed Rune', 'Parry Rune');
        exports.specialIds.tomeSavageLooting = getAllIdsStarting('Savage Looting Tome');
        exports.specialIds.tomeBountifulHarvest = getAllIdsStarting('Bountiful Harvest Tome');
        exports.specialIds.tomeOpulentCrafting = getAllIdsStarting('Opulent Crafting Tome');
        exports.specialIds.tomeEternalLife = getAllIdsStarting('Eternal Life Tome');
        exports.specialIds.tomeInsatiablePower = getAllIdsStarting('Insatiable Power Tome');
        exports.specialIds.tomePotentConcoction = getAllIdsStarting('Potent Concoction Tome');
        initialised.resolve(exports);
    }

    function getAllIdsEnding() {
        const suffixes = Array.prototype.slice.call(arguments);
        return exports.list.filter(a => new RegExp(`(${suffixes.join('|')})$`).exec(a.name)).map(a => a.id);
    }

    function getAllIdsStarting() {
        const prefixes = Array.prototype.slice.call(arguments);
        return exports.list.filter(a => new RegExp(`^(${prefixes.join('|')})`).exec(a.name)).map(a => a.id);
    }

    initialise();

    return initialised;

}
