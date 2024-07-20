(configuration, events, request, discord, util) => {

    let enabled = false;
    const DATA = {};
    const ONE_MINUTE = 1000 * 60;

    function initialise() {
        configuration.registerCheckbox({
            category: 'Data',
            key: 'data-forwarder',
            name: 'Data Forwarder',
            default: true,
            handler: handleConfigStateChange
        });
        events.register('reader-guild', handleEvent);
        events.register('reader-structures-guild', handleEvent);
        events.register('reader-guild-event', handleEvent);
        events.register('estimator', handleComplexEvent);
        events.register('estimator-expedition', handleComplexEvent);
    }

    function handleConfigStateChange(state) {
        enabled = state;
    }

    function handleEvent(data, eventName) {
        if(!enabled) {
            return;
        }
        if(data.type === 'full') {
            const doForward = JSON.stringify(data.value) !== JSON.stringify(DATA[eventName]);
            DATA[eventName] = data.value;
            if(doForward) {
                forward(eventName);
            }
        }
    }

    function handleComplexEvent(data, eventName) {
        if(!enabled) {
            return;
        }
        switch(eventName) {
            case 'estimator':
            case 'estimator-expedition':
                if(data.isCurrent) {
                    handleEvent({
                        type: 'full',
                        value: {
                            finished: util.roundToMultiple(Date.now() + data.timings.finished * 1000, ONE_MINUTE)
                        }
                    }, eventName);
                }
                break;
            default:
                throw 'Unmapped key : ' + eventName;
        }
    }

    function forward(key) {
        const guildName = DATA['reader-guild']?.name;
        switch(key) {
            case 'reader-guild':
                if(guildName) {
                    request.forwardDataGuildLevel(guildName, DATA[key].level);
                }
                break;
            case 'reader-structures-guild':
                if(guildName) {
                    request.forwardDataGuildStructures(guildName, DATA[key]);
                }
                break;
            case 'reader-guild-event':
                if(guildName && DATA[key].eventRunning) {
                    request.forwardDataGuildEventTime(guildName, DATA[key].eventType, DATA[key].eventStartMillis);
                }
                break;
            case 'estimator':
                forwardEndTime('IDLE_ACTION', DATA[key].finished);
                return;
            case 'estimator-expedition':
                forwardEndTime('TAMING_EXPEDITION', DATA[key].finished);
                return;
            default:
                throw 'Unmapped key : ' + key;
        }
    }

    function forwardEndTime(type, millis) {
        const registrations = discord.getRegistrations().filter(a => a.type === type && !a.errored);
        for(const registration of registrations) {
            request.setTimeDiscordRegistration(registration.id, millis);
        }
    }

    initialise();

    return {forward};

}
