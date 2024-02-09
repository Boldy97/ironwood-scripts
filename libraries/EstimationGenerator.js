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

        #backup;
        #state;

        constructor() {
            this.#backup = {};
            this.#state = this.#backup;
            for(const name in EVENTS) {
                this.#backup[name] = events.getLast(EVENTS[name].event);
            }
        }

        reset() {
            for(const name in EVENTS) {
                this.#state[name] = structuredClone(EVENTS[name].default);
            }
            return this;
        }

        run(skillId, actionId) {
            this.#sendCustomEvents();
            statsStore.update(new Set());
            const estimation = estimator.get(skillId, actionId);
            this.#sendBackupEvents();
            return estimation;
        }

        #sendCustomEvents() {
            for(const name in this.#state) {
                events.emit(EVENTS[name].event, this.#state[name]);
            }
        }

        #sendBackupEvents() {
            for(const name in this.#backup) {
                events.emit(EVENTS[name].event, this.#backup[name]);
            }
        }

        level(skill, level, exp = 0) {
            if(typeof skill === 'string') {
                const match = skillCache.byName[skill];
                if(!match) {
                    throw `Could not find skill ${skill}`;
                }
                skill = match.id;
            }
            if(!exp) {
                exp = util.levelToExp(level);
            }
            this.#state.exp[skill] = {
                id: skill,
                exp,
                level
            };
            return this;
        }

        equipment(item, amount = 1) {
            if(typeof item === 'string') {
                const match = itemCache.byName[item];
                if(!match) {
                    throw `Could not find item ${item}`;
                }
                item = match.id;
            }
            this.#state.equipment[item] = amount;
            return this;
        }

        rune(item, amount = 1) {
            if(typeof item === 'string') {
                const match = itemCache.byName[item];
                if(!match) {
                    throw `Could not find item ${item}`;
                }
                item = match.id;
            }
            this.#state.runes[item] = amount;
            return this;
        }

        tome(item) {
            if(typeof item === 'string') {
                const match = itemCache.byName[item];
                if(!match) {
                    throw `Could not find item ${item}`;
                }
                item = match.id;
            }
            this.#state.tomes[item] = 1;
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
            this.#state.structures[structure] = level;
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
            this.#state.enhancements[structure] = level;
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
            this.#state.guild[structure] = level;
            return this;
        }

        export() {
            return structuredClone(this.#state);
        }

        import(state) {
            this.#state = structuredClone(state);
            return this;
        }

    }

    return EstimationGenerator;

}
