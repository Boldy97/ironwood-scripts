(fallbackCache, itemCache, actionCache, ingredientCache) => {

    const exports = {
        list: [],
        byAction: {},
        byItem: {},
        boneCarveMappings: null,
        conversionMappings: null,
        getMostCommonDrop
    };

    Object.defineProperty(Array.prototype, '_groupBy', {
        enumerable: false,
        value: function(selector) {
            return Object.values(this.reduce(function(rv, x) {
                (rv[selector(x)] = rv[selector(x)] || []).push(x);
                return rv;
            }, {}));
        }
    });

    async function initialise() {
        const drops = await fallbackCache.load('drop');
        for(const drop of drops) {
            exports.list.push(drop);
            if(!exports.byAction[drop.action]) {
                exports.byAction[drop.action] = [];
            }
            exports.byAction[drop.action].push(drop);
            if(!exports.byItem[drop.item]) {
                exports.byItem[drop.item] = [];
            }
            exports.byItem[drop.item].push(drop);
        }
        extractBoneCarvings();
        extractConversions();
        return exports;
    }

    // I'm sorry for what follows
    function extractBoneCarvings() {
        let name;
        exports.boneCarveMappings = exports.list
            // filtering
            .filter(drop => drop.type === 'GUARANTEED')
            .filter(drop => (name = itemCache.byId[drop.item].name, name.endsWith('Bone') || name.endsWith('Fang')))
            .filter(drop => actionCache.byId[drop.action].skill === 'Combat')
            // sort
            .sort((a,b) => actionCache.byId[a.action].level - actionCache.byId[b.action].level)
            // per level
            ._groupBy(drop => actionCache.byId[drop.action].level)
            .map(a => a[0].item)
            .map((item,i,all) => ({
                from: item,
                to: [].concat([all[i-1]]).concat([all[i-2]]).filter(a => a)
            }))
            .reduce((a,b) => (a[b.from] = b.to, a), {});
    }

    function extractConversions() {
        exports.conversionMappings = exports.list
            .filter(a => actionCache.byId[a.action].type === 'CONVERSION')
            .map(drop => ({
                from: ingredientCache.byAction[drop.action][0].item,
                to: drop.item,
                amount: drop.amount
            }))
            ._groupBy(a => a.to)
            .reduce((a,b) => (a[b[0].to] = b, a), {});
    }

    function getMostCommonDrop(actionId) {
        return exports.byAction[actionId].sort((a,b) => a.chance - b.chance)[0].item;
    }

    return initialise();

}
