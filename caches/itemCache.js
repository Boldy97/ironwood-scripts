(request) => {

    const exports = {
        list: [],
        byId: {},
        byName: {},
        byImage: {},
        attributes: null,
        specialIds: {
            coins: null,
            charcoal: null,
            stardust: null,
            masteryContract: null,
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
            sigil: null,
            dungeonKey: null,
            gatheringPotion: null,
            craftingPotion: null,
            combatPotion: null,
            potion: null,
            woodcuttingRune: null,
            miningRune: null,
            farmingRune: null,
            fishingRune: null,
            oneHandedRune: null,
            twoHandedRune: null,
            rangedRune: null,
            defenseRune: null,
            forestDamageRune: null,
            forestBlockRune: null,
            mountainDamageRune: null,
            mountainBlockRune: null,
            oceanDamageRune: null,
            oceanBlockRune: null,
            savageLootingTome: null,
            bountifulHarvestTome: null,
            opulentCraftingTome: null,
            insatiablePowerTome: null,
            potentConcoctionTome: null,
            runicWisdomTome: null,
            gem: null,
            smithing: null
        }
    };

    async function initialise() {
        await loadItems();
        await loadItemAttributes();
        enrichItems();
        return exports;
    }

    async function loadItems() {
        const enrichedItems = await request.listItems();
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
        }
        for(const image of Object.keys(exports.byImage)) {
            if(exports.byImage[image].duplicate) {
                delete exports.byImage[image];
            }
        }
        // does not cover any event items
        const potions = exports.list.filter(a => /(Potion|Mix)$/.exec(a.name));
        exports.specialIds.coins = exports.byName['Coins'].id;
        exports.specialIds.charcoal = exports.byName['Charcoal'].id;
        exports.specialIds.stardust = exports.byName['Stardust'].id;
        exports.specialIds.masteryContract = exports.byName['Mastery Contract'].id;
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
        exports.specialIds.sigil = getAllIdsEnding('Sigil');
        exports.specialIds.dungeonKey = getAllIdsStarting('Dungeon Key');
        exports.specialIds.gatheringPotion = potions.filter(a => a.name.includes('Gather')).map(a => a.id);
        exports.specialIds.craftingPotion = potions.filter(a => a.name.includes('Craft') || a.name.includes('Preservation')).map(a => a.id);
        exports.specialIds.combatPotion = potions.filter(a => !a.name.includes('Gather') && !a.name.includes('Craft') && !a.name.includes('Preservation')).map(a => a.id);
        exports.specialIds.potion = [
            ...exports.specialIds.gatheringPotion,
            ...exports.specialIds.craftingPotion,
            ...exports.specialIds.combatPotion
        ];
        exports.specialIds.woodcuttingRune = getAllIdsEnding('Woodcutting Rune');
        exports.specialIds.miningRune = getAllIdsEnding('Mining Rune');
        exports.specialIds.farmingRune = getAllIdsEnding('Farming Rune');
        exports.specialIds.fishingRune = getAllIdsEnding('Fishing Rune');
        exports.specialIds.oneHandedRune = getAllIdsEnding('One-handed Rune');
        exports.specialIds.twoHandedRune = getAllIdsEnding('Two-handed Rune');
        exports.specialIds.rangedRune = getAllIdsEnding('Ranged Rune');
        exports.specialIds.defenseRune = getAllIdsEnding('Defense Rune');
        exports.specialIds.forestDamageRune = getAllIdsEnding('Forest Damage Rune');
        exports.specialIds.forestBlockRune = getAllIdsEnding('Forest Block Rune');
        exports.specialIds.mountainDamageRune = getAllIdsEnding('Mountain Damage Rune');
        exports.specialIds.mountainBlockRune = getAllIdsEnding('Mountain Block Rune');
        exports.specialIds.oceanDamageRune = getAllIdsEnding('Ocean Damage Rune');
        exports.specialIds.oceanBlockRune = getAllIdsEnding('Ocean Block Rune');
        exports.specialIds.savageLootingTome = getAllIdsStarting('Savage Looting Tome');
        exports.specialIds.bountifulHarvestTome = getAllIdsStarting('Bountiful Harvest Tome');
        exports.specialIds.opulentCraftingTome = getAllIdsStarting('Opulent Crafting Tome');
        exports.specialIds.insatiablePowerTome = getAllIdsStarting('Insatiable Power Tome');
        exports.specialIds.potentConcoctionTome = getAllIdsStarting('Potent Concoction Tome');
        exports.specialIds.runicWisdomTome = getAllIdsStarting('Runic Wisdom Tome');
        exports.specialIds.gem = exports.list.filter(a => a.arcanePowder).map(a => a.id);
        exports.specialIds.smithing = [
            ...exports.specialIds.mainHand,
            ...exports.specialIds.offHand,
            ...exports.specialIds.helmet,
            ...exports.specialIds.body,
            ...exports.specialIds.gloves,
            ...exports.specialIds.boots,
            ...exports.specialIds.hatchet,
            ...exports.specialIds.pickaxe,
            ...exports.specialIds.spade,
            ...exports.specialIds.rod,
            ...exports.specialIds.lantern
        ];
        for(const key of Object.keys(exports.specialIds)) {
            if(!exports.specialIds[key]) {
                throw `Unconfigured special id for ${key}`;
            }
        }
    }

    async function loadItemAttributes() {
        exports.attributes = await request.listItemAttributes();
        exports.attributes.push({
            technicalName: 'CHARCOAL',
            name: 'Charcoal',
            image: '/assets/items/charcoal.png'
        },{
            technicalName: 'COMPOST',
            name: 'Compost',
            image: '/assets/items/compost.png'
        },{
            technicalName: 'ARCANE_POWDER',
            name: 'Arcane Powder',
            image: '/assets/items/arcane-powder.png'
        },{
            technicalName: 'PET_SNACKS',
            name: 'Pet Snacks',
            image: '/assets/items/pet-snacks.png'
        },{
            technicalName: 'METAL_PARTS',
            name: 'Metal Parts',
            image: '/assets/items/metal-parts.png'
        },{
            technicalName: 'OWNED',
            name: 'Owned',
            image: '/assets/misc/inventory.png'
        },{
            technicalName: 'DROP_CHANCE',
            name: 'Drop Chance',
            image: 'https://img.icons8.com/?size=48&id=CTW7OqTDhWF0'
        });
    }

    function enrichItems() {
        for(const item of exports.list) {
            if(!item.attributes) {
                item.attributes = {};
            }
        }
    }

    function getAllIdsEnding(...suffixes) {
        return exports.list.filter(a => new RegExp(`(${suffixes.join('|')})$`).exec(a.name)).map(a => a.id);
    }

    function getAllIdsStarting(...prefixes) {
        return exports.list.filter(a => new RegExp(`^(${prefixes.join('|')})`).exec(a.name)).map(a => a.id);
    }

    return initialise();

}
