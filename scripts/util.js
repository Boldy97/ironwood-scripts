() => {

    const exports = {
        levelToExp,
        expToLevel,
        expToNextLevel,
        expToNextTier,
        formatNumber,
        secondsToDuration
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

    function secondsToDuration(duration) {
        if(duration > 60 * 60 * 24 * 100) {
            // > 100 days,
            return 'A very long time';
        }
        var seconds = Math.floor(duration % 60),
            minutes = Math.floor((duration / 60) % 60),
            hours = Math.floor((duration / (60 * 60)) % 24),
            days = Math.floor(duration / (60 * 60 * 24));

        days = (days < 10) ? '0' + days : days;
        hours = (hours < 10) ? '0' + hours : hours;
        minutes = (minutes < 10) ? '0' + minutes : minutes;
        seconds = (seconds < 10) ? '0' + seconds : seconds;

        let result = '';
        if(days > 0) {
            result += days + 'd ';
        }
        if(days > 0 || hours > 0) {
            result += hours + 'h ';
        }
        if(days > 0 || hours > 0 || minutes > 0) {
            result += minutes + 'm ';
        }
        if(days > 0 || hours > 0 || minutes > 0 || seconds > 0) {
            result += seconds + 's ';
        }

        return result.trim();
    }

    return exports;

}
