(petCache, petPassiveCache, expeditionCache, itemCache, util, request, Promise) => {

    const STATS_BASE = ['health', 'attack', 'defense'];
    const STATS_SPECIAL = ['meleeAttack', 'meleeDefense', 'rangedAttack', 'rangedDefense', 'magicAttack', 'magicDefense', 'hunger', 'eggFind', 'itemFind'];
    const STATS_ABILITIES = ['bones', 'fish', 'flowers', 'ore', 'veges', 'wood'];
    const IMAGES = {
        health: 'https://cdn-icons-png.flaticon.com/512/2589/2589054.png',
        attack: 'https://img.icons8.com/?size=48&id=16672',
        defense: 'https://img.icons8.com/?size=48&id=I2lKi8lyTaJD',
        itemFind: 'https://img.icons8.com/?size=48&id=M2yQkpBAlIS8',
        eggFind: 'https://img.icons8.com/?size=48&id=Ybx2AvxzyUfH',
        hunger: 'https://img.icons8.com/?size=48&id=AXExnoyylJdK',
        melee: 'https://img.icons8.com/?size=48&id=I2lKi8lyTaJD',
        magic: 'https://img.icons8.com/?size=48&id=CWksSHWEtOtX',
        ranged: 'https://img.icons8.com/?size=48&id=5ndWrWDbTE2Y',
        wood: `/assets/${itemCache.byName['Pine Log'].image}`,
        ore: `/assets/${itemCache.byName['Copper Ore'].image}`,
        veges: `/assets/${itemCache.byName['Peony'].image}`,
        flowers: `/assets/${itemCache.byName['Potato'].image}`,
        fish: `/assets/${itemCache.byName['Raw Shrimp'].image}`,
        bones: `/assets/${itemCache.byName['Bone'].image}`
    };
    const ROTATION_NAMES = [
        'melee',
        'ranged',
        'magic',
    ];
    const exports = {
        VERSION: 0,
        STATS_BASE,
        STATS_SPECIAL,
        IMAGES,
        petToText,
        textToPet,
        isEncodedPetName,
        petToStats,
        getExpeditionStats
    };

    let SPECIAL_CHAR = '0';
    const VALID_CHARS = '!"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_abcdefghijklmnopqrstuvwxyz{|}'.split('');
    const VALID_CHARS_LENGTH = BigInt(VALID_CHARS.length);
    const OPTIONS = [
        petCache.list.length, // species
        ...Array(3).fill(50), // stats
        ...Array(4).fill(petPassiveCache.list.length+1) // passives, 0 = empty
    ];

    const MILLIS_PER_MINUTE = 1000*60;
    const MILLIS_PER_WEEK = 1000*60*60*24*7;

    const initialised = new Promise.Expiring(2000, 'localDatabase');

    async function initialise() {
        exports.VERSION = +(await request.getPetVersion());
        SPECIAL_CHAR = exports.VERSION + '';
        for(const petPassive of petPassiveCache.list) {
            if(petPassive.name.startsWith('Melee')) {
                petPassive.image = IMAGES.melee;
            } else if(petPassive.name.startsWith('Ranged')) {
                petPassive.image = IMAGES.ranged;
            } else if(petPassive.name.startsWith('Magic')) {
                petPassive.image = IMAGES.magic;
            } else if(petPassive.name.startsWith('Hunger')) {
                petPassive.image = IMAGES.hunger;
            } else if(petPassive.name.startsWith('Egg Find')) {
                petPassive.image = IMAGES.eggFind;
            } else if(petPassive.name.startsWith('Loot Find')) {
                petPassive.image = IMAGES.itemFind;
            } else {
                console.error(`Unmapped pet passive name, please fix : ${petPassive.name}`);
            }
        }
        initialised.resolve(exports);
    }

    function numberToText(number) {
        let text = SPECIAL_CHAR;
        while(number > 0) {
            text += VALID_CHARS[number%VALID_CHARS_LENGTH];
            number /= VALID_CHARS_LENGTH;
        }
        return text;
    }

    function textToNumber(text) {
        let number = 0n;
        text = text.slice(1);
        while(text.length) {
            number *= VALID_CHARS_LENGTH;
            number += BigInt(VALID_CHARS.indexOf(text[text.length-1]));
            text = text.slice(0,-1);
        }
        return number;
    }

    function choicesToNumber(choices, options) {
        if(choices.length !== options.length) {
            throw `Expected lengths to be equal : ${choices.length} and ${options.length}`;
        }
        let number = 0n;
        for(let i=0;i<choices.length;i++) {
            if(choices[i] >= options[i]) {
                throw `${choices[i]} is outside of options range ${options[i]}`;
            }
            number *= BigInt(options[i]);
            number += BigInt(choices[i]);
        }
        return number;
    }

    function numberToChoices(number, options) {
        const choices = [];
        for(let i=options.length-1;i>=0;i--) {
            if(i > 0) {
                choices.unshift(Number(number % BigInt(options[i])));
                number /= BigInt(options[i]);
            } else {
                choices.unshift(Number(number));
            }
        }
        return choices;
    }

    function petToChoices(pet) {
        const passives = pet.passives.map(a => petPassiveCache.idToIndex[a]+1);
        while(passives.length < 4) {
            passives.push(0);
        }
        return [
            petCache.idToIndex[pet.species], // species
            pet.health/2-1,
            pet.attack/2-1,
            pet.defense/2-1,
            ...passives // passives, 0 = empty
        ];
    }

    function choicesToPet(choices, text) {
        return {
            parsed: true,
            species: petCache.list[choices[0]].id,
            name: text,
            health: (choices[1]+1)*2,
            attack: (choices[2]+1)*2,
            defense: (choices[3]+1)*2,
            passives: choices.slice(4).filter(a => a).map(a => petPassiveCache.list[a-1].id)
        };
    }

    function petToText(pet) {
        const choices = petToChoices(pet);
        const number = choicesToNumber(choices, OPTIONS);
        return numberToText(number);
    }

    function textToPet(text) {
        const number = textToNumber(text);
        const choices = numberToChoices(number, OPTIONS);
        return choicesToPet(choices, text);
    }

    function isEncodedPetName(text) {
        return text.startsWith(SPECIAL_CHAR);
    }

    function petToStats(pet) {
        const result = {};
        const passives = pet.passives.map(id => petPassiveCache.byId[id]);
        for(const stat of STATS_BASE) {
            result[stat] = 0;
            let value = (petCache.byId[pet.species].power + pet[stat] / 2 - 10) / 100 * pet.level + 10;
            result[stat] += value;
        }
        for(const stat of STATS_SPECIAL) {
            result[stat] = 0;
            const passive = passives.find(a => a.stats.name === stat);
            if(passive) {
                result[stat] += passive.stats.value;
            }
        }
        for(const ability of STATS_ABILITIES) {
            result[ability] = 0;
        }
        const abilities = petCache.byId[pet.species].abilities;
        for(const ability of abilities) {
            const key = Object.keys(ability)[0];
            result[key] = ability[key];
        }
        for(const key of Object.keys(result)) {
            result[key] = Math.round(result[key]);
        }
        return result;
    }

    function getExpeditionStats(tier) {
        const expedition = expeditionCache.byTier[tier];
        const rotation = getCurrentRotation(expedition.tier);
        const stats = {};
        for(const stat of STATS_BASE) {
            stats[stat] = expedition.power;
        }
        return Object.assign({rotation,stats}, expedition);
    }

    function getCurrentRotation(offset) {
        const now = new Date();
        const date = new Date(now.getTime() + MILLIS_PER_MINUTE * now.getTimezoneOffset());
        const millisPassed = util.startOfWeek(date) - util.startOfWeek(util.startOfYear(date));
        const startOfWeek = util.startOfWeek(date);
        let index = offset + Math.round(millisPassed / MILLIS_PER_WEEK);
        index %= ROTATION_NAMES.length;
        return ROTATION_NAMES[index];
    }

    initialise();

    return initialised;

}