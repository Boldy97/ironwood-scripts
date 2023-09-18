(events, elementWatcher, util, elementCreator) => {

    function initialise() {
        elementCreator.addStyles(styles);
        events.register('page', handlePage);
    }

    async function handlePage(page) {
        if(page.type === 'guild') {
            await elementWatcher.exists('.card > .row');
            await addAdditionGuildSortButtons();
            setupGuildMenuButtons();
        }
        if(page.type === 'market') {
            // TODO for another script?
        }
    }

    function setupGuildMenuButtons() {
        $(`button > div.name:contains('Members')`).parent().on('click', async function () {
            await util.sleep(50);
            await addAdditionGuildSortButtons();
        });
    }

    async function addAdditionGuildSortButtons() {
        await elementWatcher.exists('div.sort');
        const orginalButtonGroup = $('div.sort').find('div.container');

        // rename daily to daily xp
        $(`button:contains('Daily')`).text('Daily XP');
        // fix text on 2 lines
        $('div.sort').find('button').addClass('overrideFlex');
        // attach clear custom to game own sorts
        $('div.sort').find('button').on('click', function() {
            clearCustomActiveButtons()
        });

        const customButtonGroup = $('<div/>')
            .addClass('customButtonGroup')
            .addClass('alignButtonGroupLeft')
            .attr('id', 'guildSortButtonGroup')
            .append(
                $('<button/>')
                    .attr('type', 'button')
                    .addClass('customButtonGroupButton')
                    .addClass('customSortByLevel')
                    .text('Level')
                    .click(() => { sortByLevel(); })
            )
            .append(
                $('<button/>')
                    .attr('type', 'button')
                    .addClass('customButtonGroupButton')
                    .addClass('customSortByIdle')
                    .text('Idle')
                    .click(() => { sortByIdle(); })
            )
            .append(
                $('<button/>')
                    .attr('type', 'button')
                    .addClass('customButtonGroupButton')
                    .addClass('customSortByTotalXP')
                    .text('Total XP')
                    .click(() => { sortByXp(); })
            );

        customButtonGroup.insertAfter(orginalButtonGroup);
    }

    function clearCustomActiveButtons() {
        $('.customButtonGroupButton').removeClass('custom-sort-active');
    }

    function clearActiveButtons() {
        $('div.sort').find('button').removeClass('sort-active');
    }

    function sortByXp() {
        $(`button:contains('Date')`).trigger('click');
        
        clearCustomActiveButtons();
        clearActiveButtons();
        $('.customSortByTotalXP').addClass('custom-sort-active');

        const parent = $('div.sort').parent();
        sortElements({
            elements: parent.find('button.row'),
            extractor: a => util.parseNumber($(a).find('div.amount').text()),
            sorter: (a,b) => b-a,
            target: parent
        });
    }

    function sortByIdle() {
        // make sure the last contributed time is visible
        if(
            !$(`div.sort button:contains('Date')`).hasClass('sort-active') &&
            !$(`button:contains('Daily XP')`).hasClass('sort-active')
        ) {
            $(`button:contains('Date')`).trigger('click');
        }

        clearCustomActiveButtons();
        clearActiveButtons();
        $('.customSortByIdle').addClass('custom-sort-active');

        const parent = $('div.sort').parent();
        sortElements({
            elements: parent.find('button.row'),
            extractor: a => util.parseDuration($(a).find('div.time').text()),
            sorter: (a,b) => b-a,
            target: parent
        });
    }

    function sortByLevel() {
        clearCustomActiveButtons();
        clearActiveButtons();
        $('.customSortByLevel').addClass('custom-sort-active');

        const parent = $('div.sort').parent();
        sortElements({
            elements: parent.find('button.row'),
            extractor: a => util.parseNumber($(a).find('div.level').text().replace('Lv. ', '')),
            sorter: (a,b) => b-a,
            target: parent
        });
    }

    // sorts a list of `elements` according to the extracted property from `extractor`,
    // sorts them using `sorter`, and appends them to the `target`
    // elements is a jquery list
    // target is a jquery element
    // { elements, target, extractor, sorter }
    function sortElements(config) {
        const list = config.elements.get().map(element => ({
            element,
            value: config.extractor(element)
        }));
        list.sort((a,b) => config.sorter(a.value, b.value));
        for(const item of list) {
            config.target.append(item.element);
        }
    }

    const styles = `
        .alignButtonGroupLeft {
            margin-right: auto;
            margin-left: 8px;
        }
        .customButtonGroup {
            display: flex;
            align-items: center;
            border-radius: 4px;
            box-shadow: 0 1px 2px #0003;
            border: 1px solid #263849;
            overflow: hidden;
        }
        .customButtonGroupButton {
            padding: 4px var(--gap);
            flex: none !important;
            text-align: center;
            justify-content: center;
            background-color: #061a2e;
        }
        .customButtonGroupButton:not(:first-of-type) {
            border-left: 1px solid #263849;
        }
        .overrideFlex {
            flex: none !important
        }
        .custom-sort-active {
            background-color: #0d2234;
        }
    `;

    initialise();
}
