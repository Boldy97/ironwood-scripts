(elementWatcher, Promise) => {

    const exports = {
        levelToExp,
        expToLevel,
        expToCurrentExp,
        expToNextLevel,
        expToNextTier,
        expToSpecificLevel,
        tierToLevel,
        levelToTier,
        formatNumber,
        parseNumber,
        secondsToDuration,
        parseDuration,
        divmod,
        sleep,
        goToPage,
        compareObjects,
        deltaObjects,
        debounce,
        distinct,
        getDuplicates,
        sumObjects,
        startOfWeek,
        startOfYear,
        generateCombinations,
        roundToMultiple,
        compress,
        decompress,
        log
    };

    function levelToExp(level) {
        if(level === 1) {
            return 0;
        }
        if(level <= 100) {
            return Math.floor(Math.pow(level, 3.5) * 6 / 5);
        }
        return Math.round(12_000_000 * Math.pow(Math.pow(3500, .01), level - 100));
    }

    function expToLevel(exp) {
        if(exp <= 0) {
            return 1;
        }
        if(exp <= 12_000_000) {
            return Math.floor(Math.pow((exp + 1) / 1.2, 1 / 3.5));
        }
        return 100 + Math.floor(Math.log((exp + 1) / 12_000_000) / Math.log(Math.pow(3500, .01)));
    }

    function expToCurrentExp(exp) {
        const level = expToLevel(exp);
        return exp - levelToExp(level);
    }

    function expToNextLevel(exp) {
        const level = expToLevel(exp);
        return levelToExp(level + 1) - exp;
    }

    function expToNextTier(exp) {
        const level = expToLevel(exp);
        let target = 10;
        while(target <= level) {
            target += 15;
        }
        return levelToExp(target) - exp;
    }

    function expToSpecificLevel(exp, goalLevel) {
        return levelToExp(goalLevel) - exp;
    }

    function tierToLevel(tier) {
        if(tier <= 1) {
            return tier;
        }
        return tier * 15 - 20;
    }

    function levelToTier(level) {
        if(level <= 1) {
            return level;
        }
        return (level + 20) / 15;
    }

    function formatNumber(number) {
        let digits = 2;
        if(number < .1 && number > -.1) {
            digits = 3;
        }
        if(number < .01 && number > -.01) {
            digits = 4;
        }
        return number.toLocaleString(undefined, {maximumFractionDigits:digits});
    }

    function parseNumber(text) {
        if(!text) {
            return 0;
        }
        if(text.includes('Empty')) {
            return 0;
        }
        const regexMatch = /\d+[^\s]*/.exec(text);
        if(!regexMatch) {
            return 0;
        }
        text = regexMatch[0];
        text = text.replaceAll(/,/g, '');
        text = text.replaceAll(/&.*$/g, '');
        let multiplier = 1;
        if(text.endsWith('%')) {
            multiplier = 1 / 100;
        }
        if(text.endsWith('K')) {
            multiplier = 1_000;
        }
        if(text.endsWith('M')) {
            multiplier = 1_000_000;
        }
        return (parseFloat(text) || 0) * multiplier;
    }

    function secondsToDuration(seconds) {
        seconds = Math.floor(seconds);
        if(seconds > 60 * 60 * 24 * 100) {
            // > 100 days
            return 'A very long time';
        }

        var [minutes, seconds] = divmod(seconds, 60);
        var [hours, minutes] = divmod(minutes, 60);
        var [days, hours] = divmod(hours, 24);

        seconds = `${seconds}`.padStart(2, '0');
        minutes = `${minutes}`.padStart(2, '0');
        hours = `${hours}`.padStart(2, '0');
        days = `${days}`.padStart(2, '0');

        let result = '';
        if(result || +days) {
            result += `${days}d `;
        }
        if(result || +hours) {
            result += `${hours}h `;
        }
        if(result || +minutes) {
            result += `${minutes}m `;
        }
        result += `${seconds}s`;

        return result;
    }

    function parseDuration(duration) {
        const parts = duration.split(' ');
        let seconds = 0;
        for(const part of parts) {
            const value = parseFloat(part);
            if(part.endsWith('s')) {
                seconds += value;
            } else if(part.endsWith('m')) {
                seconds += value * 60;
            } else if(part.endsWith('h')) {
                seconds += value * 60 * 60;
            } else if(part.endsWith('d')) {
                seconds += value * 60 * 60 * 24;
            } else {
                console.warn(`Unexpected duration being parsed : ${part}`);
            }
        }
        return seconds;
    }

    function divmod(x, y) {
        return [Math.floor(x / y), x % y];
    }

    async function goToPage(page) {
        if(page === 'settings') {
            goToPage('merchant');
            await elementWatcher.exists('merchant-page');
        }
        window.history.pushState({}, '', page);
        window.history.pushState({}, '', page);
        window.history.back();
    }

    async function sleep(millis) {
        await new window.Promise(r => window.setTimeout(r, millis));
    }

    function compareObjects(object1, object2, doLog) {
        const keys1 = Object.keys(object1);
        const keys2 = Object.keys(object2);
        if(keys1.length !== keys2.length) {
            if(doLog) {
                console.warn(`key length not matching`, object1, object2);
            }
            return false;
        }
        keys1.sort();
        keys2.sort();
        for(let i=0;i<keys1.length;i++) {
            if(keys1[i] !== keys2[i]) {
                if(doLog) {
                    console.warn(`keys not matching`, keys1[i], keys2[i], object1, object2);
                }
                return false;
            }
            if(typeof object1[keys1[i]] === 'object' && typeof object2[keys2[i]] === 'object') {
                if(!compareObjects(object1[keys1[i]], object2[keys2[i]], doLog)) {
                    return false;
                }
            } else if(object1[keys1[i]] !== object2[keys2[i]]) {
                if(doLog) {
                    console.warn(`values not matching`, object1[keys1[i]], object2[keys2[i]], object1, object2);
                }
                return false;
            }
        }
        return true;
    }

    function deltaObjects(object1, object2) {
        const delta = {};

        for (const key in object1) {
            if (object1.hasOwnProperty(key)) {
                delta[key] = object2[key] - object1[key];
            }
        }

        for (const key in object2) {
            if (object2.hasOwnProperty(key) && !object1.hasOwnProperty(key)) {
                delta[key] = object2[key];
            }
        }

        return delta;
    }

    function debounce(callback, delay) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => {
                callback(...args);
            }, delay);
        }
    }

    function distinct(array) {
        return array.filter((value, index) => {
          return array.indexOf(value) === index;
        });
    }

    function getDuplicates(array) {
        const sorted = array.slice().sort();
        const result = [];
        for(let i=0;i<sorted.length-1;i++) {
            if(sorted[i+1] == sorted[i]) {
                result.push(sorted[i]);
            }
        }
        return result;
    }

    function sumObjects(array) {
        const result = {};
        for(const element of array) {
            for(const key of Object.keys(element)) {
                if(typeof element[key] === 'number') {
                    result[key] = (result[key] || 0) + element[key];
                }
            }
        }
        return result;
    }

    function startOfWeek(date) {
        const result = new Date();
        result.setDate(date.getDate() - date.getDay());
        result.setHours(0,0,0,0);
        return result;
    }

    function startOfYear(date) {
        const result = new Date(date.getFullYear(), 0, 1);
        return result;
    }

    function generateCombinations(objects, count, grouper) {
        const objectsByGroup = {};
        for(const object of objects) {
            const group = grouper(object);
            if(!objectsByGroup[group]) {
                objectsByGroup[group] = [];
            }
            objectsByGroup[group].push(object);
        }
        const result = [];
        const groups = Object.keys(objectsByGroup);
        addOneCombination(result, objectsByGroup, groups, count);
        return result;
    }

    function addOneCombination(result, objectsByGroup, groups, count, combination = [], groupStart = 0) {
        if(!count) {
            result.push(combination);
            return;
        }
        for(let i=groupStart;i<groups.length-count+1;i++) {
            const contents = objectsByGroup[groups[i]];
            for(let j=0;j<contents.length;j++) {
                addOneCombination(result, objectsByGroup, groups, count-1, combination.concat([contents[j]]), i+1);
            }
        }
    }

    function roundToMultiple(number, multiple) {
        return Math.round(number / multiple) * multiple;
    }

    function arrayBufferToText(arrayBuffer) {
        return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    }

    async function textToArrayBuffer(text) {
        const result = new Promise.Deferred();
        var req = new XMLHttpRequest;
        req.open('GET', "data:application/octet;base64," + text);
        req.responseType = 'arraybuffer';
        req.onload = a => result.resolve(new Uint8Array(a.target.response));
        req.onerror = () => result.reject('Failed to convert text to array buffer');
        req.send();
        return result;
    }

    async function compress(string) {
        const byteArray = new TextEncoder().encode(string);
        const cs = new CompressionStream('gzip');
        const writer = cs.writable.getWriter();
        writer.write(byteArray);
        writer.close();
        const arrayBuffer = await new Response(cs.readable).arrayBuffer();
        return arrayBufferToText(arrayBuffer);
    }

    async function decompress(text) {
        const arrayBuffer = await textToArrayBuffer(text);
        const cs = new DecompressionStream('gzip');
        const writer = cs.writable.getWriter();
        writer.write(arrayBuffer);
        writer.close();
        const byteArray = await new Response(cs.readable).arrayBuffer();
        return new TextDecoder().decode(byteArray);
    }

    function log(x, base) {
        return Math.log(x) / Math.log(base);
    }

    return exports;

}
