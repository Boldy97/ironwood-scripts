(petCache, petTraitCache, petPassiveCache, expeditionCache, util) => {

    const STATS_BASE = ['health', 'speed', 'attack', 'specialAttack', 'defense', 'specialDefense'];
    const STATS_SPECIAL = ['hunger', 'stealth', 'loot'];
    const STATS_ABILITIES = ['bones', 'fish', 'flowers', 'ore', 'veges', 'wood'];
    const IMAGES = {
        health: 'https://cdn-icons-png.flaticon.com/512/2589/2589054.png',
        speed: 'https://img.icons8.com/?size=48&id=TE1T4XfT3xeN',
        attack: 'https://cdn-icons-png.flaticon.com/512/9743/9743017.png',
        defense: 'https://cdn-icons-png.flaticon.com/512/2592/2592488.png',
        specialAttack: 'https://img.icons8.com/?size=48&id=18515',
        specialDefense: 'https://img.icons8.com/?size=48&id=CWksSHWEtOtX',
        hunger: 'https://img.icons8.com/?size=48&id=AXExnoyylJdK',
        stealth: 'https://img.icons8.com/?size=48&id=4GYmMTXrMp8g',
        loot: 'https://img.icons8.com/?size=48&id=M2yQkpBAlIS8'
    };
    const exports = {
        STATS_BASE,
        STATS_SPECIAL,
        IMAGES,
        petToText,
        textToPet,
        isEncodedPetName,
        petToStats,
        getExpeditionStats
    };

    const SPECIAL_CHAR = '_';
    const VALID_CHARS = '!"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_abcdefghijklmnopqrstuvwxyz{|}'.split('');
    const VALID_CHARS_LENGTH = BigInt(VALID_CHARS.length);
    const OPTIONS = [
        petCache.list.length, // species
        petTraitCache.list.length, // traits
        ...Array(6).fill(50), // stats
        ...Array(4).fill(petPassiveCache.list.length+1) // passives, 0 = empty
    ];

    const MILLIS_PER_MINUTE = 1000*60;
    const MILLIS_PER_WEEK = 1000*60*60*24*7;

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
            petTraitCache.idToIndex[pet.traits], // traits
            pet.health/2-1,
            pet.attack/2-1,
            pet.defense/2-1,
            pet.specialAttack/2-1,
            pet.specialDefense/2-1,
            pet.speed/2-1, // stats
            ...passives // passives, 0 = empty
        ];
    }

    function choicesToPet(choices, text) {
        return {
            parsed: true,
            species: petCache.list[choices[0]].id,
            name: text,
            traits: petTraitCache.list[choices[1]].id,
            health: (choices[2]+1)*2,
            attack: (choices[3]+1)*2,
            defense: (choices[4]+1)*2,
            specialAttack: (choices[5]+1)*2,
            specialDefense: (choices[6]+1)*2,
            speed: (choices[7]+1)*2,
            passives: choices.slice(8).filter(a => a).map(a => petPassiveCache.list[a-1].id)
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
        const traits = petTraitCache.byId[pet.traits];
        for(const stat of STATS_BASE) {
            result[stat] = 0;
            let value = (petCache.byId[pet.species].power + pet[stat] / 2 - 10) / 100 * pet.level + 10;
            value *= traits[stat] ? 1.25 : 1;
            const passive = passives.find(a => a.stats.name === stat + 'Percent');
            if(passive) {
                value *= 1 + passive.stats.value / 100;
            }
            result[stat] += value;
        }
        for(const stat of STATS_SPECIAL) {
            result[stat] = 0;
            const passive = passives.find(a => a.stats.name === stat + 'Percent');
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
            if(rotation[stat]) {
                stats[stat] *= 1.25;
            }
        }
        return Object.assign({rotation,stats}, expedition);
    }

    function getCurrentRotation(offset) {
        const now = new Date();
        const date = new Date(now.getTime() + MILLIS_PER_MINUTE * now.getTimezoneOffset());
        const millisPassed = util.startOfWeek(date) - util.startOfWeek(util.startOfYear(date));
        const startOfWeek = util.startOfWeek(date);
        let index = 2 + offset + Math.round(millisPassed / MILLIS_PER_WEEK);
        index %= petTraitCache.list.length;
        return petTraitCache.byId[index];
    }

    return exports;

}