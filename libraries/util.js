() => {

    const exports = {
        levelToExp,
        expToLevel,
        expToCurrentExp,
        expToNextLevel,
        expToNextTier,
        tierToLevel,
        formatNumber,
        parseNumber,
        secondsToDuration,
        parseDuration,
        divmod,
        sleep,
        goToPage,
        compareObjects,
        debounce
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

    function tierToLevel(tier) {
        if(tier <= 1) {
            return tier;
        }
        return tier * 15 - 20;
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
        const regexMatch = /\d+.*/.exec(text);
        if(!regexMatch) {
            return 0;
        }
        text = regexMatch[0];
        text = text.replaceAll(/,/g, '');
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
            if(part.endsWith('m')) {
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

    function goToPage(page) {
        window.history.pushState({}, '', page);
        window.history.pushState({}, '', page);
        window.history.back();
    }

    async function sleep(millis) {
        await new Promise(r => window.setTimeout(r, millis));
    }

    function compareObjects(object1, object2) {
        const keys1 = Object.keys(object1);
        const keys2 = Object.keys(object2);
        if(keys1.length !== keys2.length) {
            return false;
        }
        keys1.sort();
        keys2.sort();
        for(let i=0;i<keys1.length;i++) {
            if(keys1[i] !== keys2[i]) {
                return false;
            }
            if(object1[keys1[i]] !== object2[keys2[i]]) {
                return false;
            }
        }
        return true;
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

    return exports;

}
