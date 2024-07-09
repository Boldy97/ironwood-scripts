(events, estimator, statsStore, util, skillCache, actionCache, itemCache, structuresCache) => {

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
        enchantments: {
            event: 'state-enchantments',
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
        #skillId;
        #actionId;

        constructor() {
            this.#backup = {};
            this.#state = {};
            this.reset();
        }

        reset() {
            this.#backup = {};
            this.#state = {};
            this.#skillId = null;
            this.#actionId = null;
            for(const name in EVENTS) {
                this.#state[name] = structuredClone(EVENTS[name].default);
            }
            return this;
        }

        run() {
            this.#populateBackup();
            this.#sendCustomEvents();
            statsStore.update(new Set());
            const estimation = estimator.get(this.#skillId, this.#actionId);
            this.#sendBackupEvents();
            return estimation;
        }

        #populateBackup() {
            this.#backup = {};
            for(const name in EVENTS) {
                this.#backup[name] = events.getLast(EVENTS[name].event);
            }
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

        skill(skill) {
            if(typeof skill === 'string') {
                const match = skillCache.byName[skill];
                if(!match) {
                    throw `Could not find skill ${skill}`;
                }
                skill = match.id;
            }
            this.#skillId = skill;
            return this;
        }

        action(action) {
            if(typeof action === 'string') {
                const match = actionCache.byName[action];
                if(!match) {
                    throw `Could not find action ${action}`;
                }
                action = match.id;
            }
            this.#actionId = action;
            return this;
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

        inventory(item, amount) {
            // noop
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

        enchantment(structure, level) {
            if(typeof structure === 'string') {
                const match = structuresCache.byName[structure];
                if(!match) {
                    throw `Could not find structure ${structure}`;
                }
                structure = match.id;
            }
            this.#state.enchantments[structure] = level;
            return this;
        }

        guild(structure, level) {
            if(typeof structure === 'string') {
                structure = 'Guild ' + structure;
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
