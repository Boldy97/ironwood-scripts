(request, Promise, itemCache, actionCache, skillCache) => {

    const initialised = new Promise.Expiring(2000);

    const exports = {
        list: [],
        byAction: null,
        byItem: null,
        boneCarveMappings: null,
        lowerGatherMappings: null
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

    Object.defineProperty(Array.prototype, '_distinct', {
        enumerable: false,
        value: function(selector) {
            return [...new Set(this)];
        }
    });

    async function initialise() {
        const drops = await request.listDrops();
        exports.byAction = {};
        exports.byItem = {};
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
        extractLowerGathers();
        initialised.resolve(exports);
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

    function extractLowerGathers() {
        exports.lowerGatherMappings = exports.list
            // filtering
            .filter(drop => drop.type === 'REGULAR')
            .filter(drop => skillCache.byName[actionCache.byId[drop.action].skill].type === 'Gathering')
            // sort
            .sort((a,b) => actionCache.byId[a.action].level - actionCache.byId[b.action].level)
            // per action, the highest chance drop
            ._groupBy(drop => drop.action)
            .map(a => a.reduce((a,b) => a.chance >= b.chance ? a : b))
            // per skill
            ._groupBy(drop => actionCache.byId[drop.action].skill)
            .flatMap(a => a
                ._groupBy(drop => actionCache.byId[drop.action].level)
                .map(b => b.map(drop => drop.item)._distinct())
                .flatMap((b,i,all) => b.map(item => ({
                    from: item,
                    to: [].concat(all[i-1]).concat(all[i-2]).filter(a => a)
                })))
            )
            .reduce((a,b) => (a[b.from] = b.to, a), {});
    }

    initialise();

    return initialised;

}
