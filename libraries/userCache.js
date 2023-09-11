(events, itemCache, Promise, util) => {

    const registerPageHandler = events.register.bind(null, 'page');
    const registerXhrHandler = events.register.bind(null, 'xhr');
    const emitEvent = events.emit.bind(null, 'userCache');
    const isReady = new Promise.Deferred();

    const exp = {};
    const inventory = {};
    const equipment = {};
    const action = {
        actionId: null,
        skillId: null,
        amount: null,
        maxAmount: null
    };
    const automations = {};
    let currentPage = null;

    const exports = {
        ready: isReady.promise,
        exp,
        inventory,
        equipment,
        action,
        automations
    };

    function initialise() {
        registerPageHandler(handlePage);
        registerXhrHandler(handleXhr);

        setInterval(update, 1000);
    }

    function handlePage(page) {
        currentPage = page;
        update();
    }

    async function handleXhr(xhr) {
        if(xhr.url.endsWith('/getUser')) {
            await handleGetUser(xhr.response);
            isReady.resolve();
        }
        if(xhr.url.endsWith('/startAction')) {
            handleStartAction(xhr.response);
        }
        if(xhr.url.endsWith('/stopAction')) {
            handleStopAction();
        }
        if(xhr.url.endsWith('/startAutomation')) {
            handleStartAutomation();
        }
    }

    async function handleGetUser(response) {
        await itemCache.ready;
        // exp
        const newExp = Object.entries(response.user.skills)
                .map(a => ({id:a[0],exp:a[1].exp}))
                .reduce((a,v) => Object.assign(a,{[v.id]:v.exp}), {});
        Object.assign(exp, newExp);
        // inventory
        const newInventory = Object.values(response.user.inventory)
            .reduce((a,v) => Object.assign(a,{[v.id]:v.amount}), {});
        newInventory[-1] = response.user.compost;
        newInventory[2] = response.user.charcoal;
        Object.assign(inventory, newInventory);
        // equipment
        const newEquipment = Object.values(response.user.equipment)
            .filter(a => a)
            .map(a => {
                if(a.uses) {
                    const duration = itemCache.byId[a.id]?.attributes?.DURATION || 1;
                    a.amount += a.uses / duration;
                }
                return a;
            })
            .reduce((a,v) => Object.assign(a,{[v.id]:v.amount}), {});
        Object.assign(equipment, newEquipment);
        // action
        if(!response.user.action) {
            action.actionId = null;
            action.skillId = null;
            action.amount = null;
        } else {
            action.actionId = +response.user.action.actionId;
            action.skillId = +response.user.action.skillId;
            action.amount = 0;
        }
    }

    function handleStartAction(response) {
        action.actionId = +response.actionId;
        action.skillId = +response.skillId;
        action.amount = 0;
        action.maxAmount = response.amount;
    }

    function handleStopAction() {
        action.actionId = null;
        action.skillId = null;
        action.amount = null;
        action.maxAmount = null;
    }

    function handleStartAutomation(response) {
        automations[+response.automationId] = {
            amount: 0,
            maxAmount: response.amount
        }
    }

    async function update() {
        await itemCache.ready;
        if(!currentPage) {
            return;
        }
        let updated = false;
        if(currentPage.type === 'action') {
            updated |= updateAction(); // bitwise OR because of lazy evaluation
        }
        if(currentPage.type === 'equipment') {
            updated |= updateEquipment(); // bitwise OR because of lazy evaluation
        }
        if(currentPage.type === 'automation') {
            updated |= updateAutomation(); // bitwise OR because of lazy evaluation
        }
        if(updated) {
            emitEvent();
        }
    }

    function updateAction() {
        let updated = false;
        $('skill-page .card').each((i,element) => {
            const header = $(element).find('.header').text();
            if(header === 'Materials') {
                $(element).find('.row').each((j,row) => {
                    updated |= extractItem(row, inventory); // bitwise OR because of lazy evaluation
                });
            } else if(header === 'Consumables') {
                $(element).find('.row').each((j,row) => {
                    updated |= extractItem(row, equipment); // bitwise OR because of lazy evaluation
                });
            } else if(header === 'Stats') {
                $(element).find('.row').each((j,row) => {
                    const text = $(row).find('.name').text();
                    if(text.startsWith('Total ') && text.endsWith(' XP')) {
                        let expValue = $(row).find('.value').text().split(' ')[0];
                        expValue = util.parseNumber(expValue);
                        updated |= exp[currentPage.skill] !== expValue; // bitwise OR because of lazy evaluation
                        exp[currentPage.skill] = expValue;
                    }
                });
            } else if(header.startsWith('Loot')) {
                const amount = $(element).find('.header .amount').text();
                let newActionAmountValue = null;
                let newActionMaxAmountValue = null;
                if(amount) {
                    newActionAmountValue = util.parseNumber(amount.split(' / ')[0]);
                    newActionMaxAmountValue = util.parseNumber(amount.split(' / ')[1]);
                }
                updated |= action.amount !== newActionAmountValue; // bitwise OR because of lazy evaluation
                updated |= action.maxAmount !== newActionMaxAmountValue; // bitwise OR because of lazy evaluation
                action.amount = newActionAmountValue;
                action.maxAmount = newActionMaxAmountValue;
            }
        });
        return updated;
    }

    function updateEquipment() {
        let updated = false;
        $('equipment-component .card:nth-child(4) .item').each((i,element) => {
            updated |= extractItem(element, equipment); // bitwise OR because of lazy evaluation
        });
        return updated;
    }

    function updateAutomation() {
        let updated = false;
        $('produce-component .card').each((i,element) => {
            const header = $(element).find('.header').text();
            if(header === 'Materials') {
                $(element).find('.row').each((j,row) => {
                    updated |= extractItem(row, inventory); // bitwise OR because of lazy evaluation
                });
            } else if(header.startsWith('Loot')) {
                const amount = $(element).find('.header .amount').text();
                let newAutomationAmountValue = null;
                let newAutomationMaxAmountValue = null;
                if(amount) {
                    newAutomationAmountValue = util.parseNumber(amount.split(' / ')[0]);
                    newAutomationMaxAmountValue = util.parseNumber(amount.split(' / ')[1]);
                }
                updated |= automations[currentPage.action]?.amount !== newAutomationAmountValue; // bitwise OR because of lazy evaluation
                updated |= automations[currentPage.action]?.maxAmount !== newAutomationMaxAmountValue; // bitwise OR because of lazy evaluation
                automations[currentPage.action] = {
                    amount: newAutomationAmountValue,
                    maxAmount: newAutomationMaxAmountValue
                }
            }
        });
        return updated;
    }

    function extractItem(element, target) {
        element = $(element);
        const name = element.find('.name').text();
        if(!name) {
            return false;
        }
        const item = itemCache.byName[name];
        if(!item) {
            console.warn(`Could not find item with name [${name}]`);
            return false;
        }
        let amount = element.find('.amount, .value').text();
        if(!amount) {
            return false;
        }
        if(amount.includes(' / ')) {
            amount = amount.split(' / ')[0];
        }
        amount = util.parseNumber(amount);
        let uses = element.find('.uses, .use').text();
        if(uses) {
            amount += util.parseNumber(uses);
        }
        const updated = target[item.id] !== amount;
        target[item.id] = amount;
        return updated;
    }

    initialise();

    return exports;

}
