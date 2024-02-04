(events, estimator, statsStore, util, skillCache, itemCache, structuresCache) => {

    const EVENTS = {
        exp: {
            event: 'state-exp',
            default: skillCache.list.reduce((a,b) => (a[b.id] = {id:b.id,exp:0,level:1}, a), {})
        },
        tomes: {
            event: 'state-equipment-tomes',
            default: {}
        },
        equipment: {
            event: 'state-equipment-equipment',
            default: {}
        },
        runes: {
            event: 'state-equipment-runes',
            default: {}
        },
        structures: {
            event: 'state-structures',
            default: {}
        },
        enhancements: {
            event: 'state-enhancements',
            default: {}
        },
        guild: {
            event: 'state-structures-guild',
            default: {}
        }
    };

    class EstimationGenerator {

        #snapshot;
        #values;

        constructor() {
            this.#snapshot = {};
            this.#values = this.#snapshot;
            for(const name in EVENTS) {
                this.#snapshot[name] = events.getLast(EVENTS[name].event);
            }
        }

        reset() {
            for(const name in EVENTS) {
                this.#values[name] = structuredClone(EVENTS[name].default);
            }
            return this;
        }

        run(skillId, actionId) {
            this.#sendCustomEvents();
            statsStore.update(new Set());
            const estimation = estimator.get(skillId, actionId);
            this.#sendSnapshotEvents();
            return estimation;
        }

        #sendCustomEvents() {
            for(const name in this.#values) {
                events.emit(EVENTS[name].event, this.#values[name]);
            }
        }

        #sendSnapshotEvents() {
            for(const name in this.#snapshot) {
                events.emit(EVENTS[name].event, this.#snapshot[name]);
            }
        }

        level(skill, level) {
            if(typeof skill === 'string') {
                const match = skillCache.byName[skill];
                if(!match) {
                    throw `Could not find skill ${skill}`;
                }
                skill = match.id;
            }
            const exp = util.levelToExp(level);
            this.#values.exp[skill] = {
                id: skill,
                exp,
                level
            };
            return this;
        }

        tome(item) {
            if(typeof item === 'string') {
                const match = itemCache.byName[item];
                if(!match) {
                    throw `Could not find item ${skill}`;
                }
                item = match.id;
            }
            this.#values.tomes[item] = 1;
            return this;
        }

        equipment(item, amount = 1) {
            if(typeof item === 'string') {
                const match = itemCache.byName[item];
                if(!match) {
                    throw `Could not find item ${skill}`;
                }
                item = match.id;
            }
            this.#values.equipment[item] = amount;
            return this;
        }

        rune(item, amount = 1) {
            if(typeof item === 'string') {
                const match = itemCache.byName[item];
                if(!match) {
                    throw `Could not find item ${skill}`;
                }
                item = match.id;
            }
            this.#values.runes[item] = amount;
            return this;
        }

        structure(structure, level) {
            if(typeof structure === 'string') {
                const match = structuresCache.byName[structure];
                if(!match) {
                    throw `Could not find structure ${structure}`;
                }
                structure = match.id;
            }
            this.#values.structures[structure] = level;
            return this;
        }

        enhancement(structure, level) {
            if(typeof structure === 'string') {
                const match = structuresCache.byName[structure];
                if(!match) {
                    throw `Could not find structure ${structure}`;
                }
                structure = match.id;
            }
            this.#values.enhancements[structure] = level;
            return this;
        }

        guild(structure, level) {
            if(typeof structure === 'string') {
                const match = structuresCache.byName[structure];
                if(!match) {
                    throw `Could not find structure ${structure}`;
                }
                structure = match.id;
            }
            this.#values.guild[structure] = level;
            return this;
        }

        export() {
            return structuredClone(this.#values);
        }

        import(values) {
            this.#values = structuredClone(values);
            return this;
        }

    }

    return EstimationGenerator;

}
