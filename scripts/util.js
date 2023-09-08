() => {

    const exports = {
        levelToExp,
        expToLevel,
        expToNextLevel,
        expToNextTier,
        formatNumber,
        parseNumber,
        secondsToDuration,
        divmod
    };

    function levelToExp(level) {
        if(level === 1) {
            return 0;
        }
        return Math.floor(Math.pow(level, 3.5) * 6 / 5);
    }

    function expToLevel(exp) {
        let level = Math.pow((exp + 1) * 5 / 6, 1 / 3.5);
        level = Math.floor(level);
        level = Math.max(1, level);
        return level;
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

    function formatNumber(number) {
        return number.toLocaleString(undefined, {maximumFractionDigits:2});
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
        if(result || +seconds) {
            result += `${seconds}s`;
        }

        return result;
    }

    function divmod(x, y) {
        return [Math.floor(x / y), x % y];
    }

    function parseNumber(text) {
        if(!text) {
            return 0;
        }
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

    return exports;

}
