(request, Promise) => {

    const initialised = new Promise.Expiring(2000, 'itemCache');

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
            lantern: null,
            food: null,
            ammo: null,
            gatheringPotion: null,
            craftingPotion: null,
            combatPotion: null,
            dungeonMap: null,
            woodcuttingRune: null,
            miningRune: null,
            farmingRune: null,
            fishingRune: null,
            gatheringRune: null,
            oneHandedRune: null,
            twoHandedRune: null,
            rangedRune: null,
            defenseRune: null,
            utilityRune: null,
            savageLootingTome: null,
            bountifulHarvestTome: null,
            opulentCraftingTome: null,
            eternalLifeTome: null,
            insatiablePowerTome: null,
            potentConcoctionTome: null,
        }
    };

    async function tryInitialise() {
        try {
            await initialise();
            initialised.resolve(exports);
        } catch(e) {
            initialised.reject(e);
        }
    }

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
            if(item.arcanePowder) {
                item.attributes.ARCANE_POWDER = item.arcanePowder;
            }
            if(item.petSnacks) {
                item.attributes.PET_SNACKS = item.petSnacks;
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
        },{
            technicalName: 'ARCANE_POWDER',
            name: 'Arcane Powder',
            image: '/assets/misc/arcane-powder.png'
        },{
            technicalName: 'PET_SNACKS',
            name: 'Pet Snacks',
            image: '/assets/misc/pet-snacks.png'
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
        exports.specialIds.lantern = getAllIdsEnding('Lantern');
        exports.specialIds.food = exports.list.filter(a => a.stats.global.HEAL).map(a => a.id);
        exports.specialIds.ammo = getAllIdsEnding('Arrow');
        exports.specialIds.gatheringPotion = potions.filter(a => a.name.includes('Gather')).map(a => a.id);
        exports.specialIds.craftingPotion = potions.filter(a => a.name.includes('Craft') || a.name.includes('Preservation')).map(a => a.id);
        exports.specialIds.combatPotion = potions.filter(a => !a.name.includes('Gather') && !a.name.includes('Craft') && !a.name.includes('Preservation')).map(a => a.id);
        exports.specialIds.dungeonMap = getAllIdsStarting('Dungeon Map');
        exports.specialIds.woodcuttingRune = getAllIdsEnding('Woodcutting Rune');
        exports.specialIds.miningRune = getAllIdsEnding('Mining Rune');
        exports.specialIds.farmingRune = getAllIdsEnding('Farming Rune');
        exports.specialIds.fishingRune = getAllIdsEnding('Fishing Rune');
        exports.specialIds.gatheringRune = [
            ...exports.specialIds.woodcuttingRune,
            ...exports.specialIds.miningRune,
            ...exports.specialIds.farmingRune,
            ...exports.specialIds.fishingRune
        ];
        exports.specialIds.oneHandedRune = getAllIdsEnding('One-handed Rune');
        exports.specialIds.twoHandedRune = getAllIdsEnding('Two-handed Rune');
        exports.specialIds.rangedRune = getAllIdsEnding('Ranged Rune');
        exports.specialIds.defenseRune = getAllIdsEnding('Defense Rune');
        exports.specialIds.utilityRune = getAllIdsEnding('Crit Rune', 'Damage Rune', 'Block Rune', 'Stun Rune', 'Bleed Rune', 'Parry Rune');
        exports.specialIds.savageLootingTome = getAllIdsStarting('Savage Looting Tome');
        exports.specialIds.bountifulHarvestTome = getAllIdsStarting('Bountiful Harvest Tome');
        exports.specialIds.opulentCraftingTome = getAllIdsStarting('Opulent Crafting Tome');
        exports.specialIds.eternalLifeTome = getAllIdsStarting('Eternal Life Tome');
        exports.specialIds.insatiablePowerTome = getAllIdsStarting('Insatiable Power Tome');
        exports.specialIds.potentConcoctionTome = getAllIdsStarting('Potent Concoction Tome');
    }

    function getAllIdsEnding() {
        const suffixes = Array.prototype.slice.call(arguments);
        return exports.list.filter(a => new RegExp(`(${suffixes.join('|')})$`).exec(a.name)).map(a => a.id);
    }

    function getAllIdsStarting() {
        const prefixes = Array.prototype.slice.call(arguments);
        return exports.list.filter(a => new RegExp(`^(${prefixes.join('|')})`).exec(a.name)).map(a => a.id);
    }

    tryInitialise();

    return initialised;

}
