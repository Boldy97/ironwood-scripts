(events, util) => {

    const emitEvent = events.emit.bind(null, 'reader-quests');

    function initialise() {
        events.register('page', update);
        window.setInterval(update, 1000);
    }

    function update() {
        const page = events.getLast('page');
        if (!page) {
            return;
        }
        if (page.type === 'quests') {
            readScreen();
        }
    }

    function readScreen() {
        const statsCard = $('quests-page .card:has(.header .name:contains("Stats"))');

        const data = {
            currentCompletedQuests: util.parseNumber($('quests-page .header > .amount').text().split(' / ')[0]),
            maxCompletedQuests: util.parseNumber($('quests-page .header > .amount').text().split(' / ')[1]),
            currentAutoCompletes: util.parseNumber(statsCard.find('.row:has(.name:contains("Auto Quest Completes")) div:last').text().split(' / ')[0]),
            maxAutoCompletes: util.parseNumber(statsCard.find('.row:has(.name:contains("Auto Quest Completes")) div:last').text().split(' / ')[1]),
            resetTime: util.parseDuration(
                statsCard.find('.row:has(.name:contains("Daily Quest Reset")) .time').children().map(function () {
                    return $(this).text().trim();
                }).get().join(' ')
            ),
            totalQuestsCompleted: util.parseNumber(statsCard.find('.row:has(.name:contains("Quests Completed")) div:last').text()),
            missingQuestPoints: util.parseNumber(statsCard.find('.row:has(.name:contains("Missing QP")) div:last').text().replace(' QP', '')),
        };
        emitEvent({
            type: 'full',
            value: data
        });
    }

    initialise();

}
