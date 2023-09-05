() => {

    const exports = {
        levelToExp,
        expToLevel,
        expToNextLevel,
        expToNextTier
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

    return exports;

}
