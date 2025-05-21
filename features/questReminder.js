(events, elementWatcher, configuration, elementCreator, toast) => {

    let enabled = false;
    let questData = undefined;
    let timer = undefined;
    const RESET_MARGIN = 120;

    async function initialise() {
        elementCreator.addStyles(styles);
        configuration.registerCheckbox({
            category: 'UI Features',
            key: 'quest-reminder',
            name: 'Quest Reminder',
            default: false,
            handler: toggle,
        });

        events.register('reader-quests', handleQuestData);

        startReminderTimer();
    }

    async function toggle(state) {
        enabled = state;

        await elementWatcher.exists('nav-component button[routerLink="/quests"]');

        updateQuestReminder();
    }

    function handleQuestData(event) {
        questData = event;
        updateQuestReminder();

        if (!invalidationTimer) {
            invalidationTimer = setTimeout(() => {

                questData = undefined;
                updateQuestReminder();
                clearTimeout(invalidationTimer);
                invalidationTimer = undefined;

            }, (questData.resetTime - margin) * 1000);
        };
    }

    function addQuestReminder() {
        const { currentCompletedQuests, maxCompletedQuests } = questData;

        const $btn = $('nav-component button[routerLink="/quests"]');
        if ($btn.find('.questReminder').length) return;

        const statusClass = currentCompletedQuests === maxCompletedQuests ? 'questReminderComplete' : 'questReminderIncomplete';

        const $reminder = $('<div>', {
            class: `questReminder ${statusClass}`,
            id: 'questReminderValue',
            text: `${currentCompletedQuests} / ${maxCompletedQuests}`
        });

        $btn.append($reminder);
    }

    function removeQuestReminder() {
        $('#questReminderValue').remove();
    }

    function updateQuestReminder() {
        if (!enabled || !questData || questData.resetTime < RESET_MARGIN) {
            removeQuestReminder();
            return;
        }
        const { currentCompletedQuests, maxCompletedQuests } = questData;

        if (maxCompletedQuests === 0) return;

        const $reminder = $('#questReminderValue');
        if (!$reminder.length) addQuestReminder();

        $reminder.text(`${currentCompletedQuests} / ${maxCompletedQuests}`);
        $reminder
            .removeClass('questReminderIncomplete questReminderComplete')
            .addClass(currentCompletedQuests === maxCompletedQuests ? 'questReminderComplete' : 'questReminderIncomplete');
    }

    function startReminderTimer() {
        // disabled for now, ill get back to this later... or not ...

        // if (!questData) return;
        // const { resetTimeSeconds } = questData;
        // //const resetTimeSeconds = 305;

        // if (timer) {
        //     clearTimeout(timer);
        // }

        // const warningTime = 5 * 60; // maybe configurable idk

        // // maybe calc min time required to complete quests based on  quest action times

        // if (resetTimeSeconds > warningTime) {
        //     console.log("timer")
        //     timer = setTimeout(() => {
        //         toast.create({
        //             time: 10000,
        //             text: `Less then ${5} minutes remaining to complete your quests`,
        //             image: 'https://ironwoodrpg.com/assets/misc/quests.png'
        //         });
        //     }, Math.max(0, (resetTimeSeconds - warningTime) * 1000));
        // }
    }

    const styles = `
        .questReminder {
            box-sizing: border-box;
            padding: 2px 8px;
            display: flex;
            align-items: center;
            font-weight: 600;
            letter-spacing: .25px;
            border-radius: 4px;
            font-size: .875rem;
        }
        .questReminderIncomplete {
            background-color: #e4a11b;
        }
        .questReminderComplete {
            background-color: #53bd73;
        }
    `;

    initialise();
}




