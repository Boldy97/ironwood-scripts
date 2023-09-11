(events, elementWatcher) => {
    events.register('page', handlePage);

    async function handlePage(page) {
        if(page.type === 'guild') {
            await elementWatcher.exists('.card > .row');

            await addAdditionGuildSortButtons();
            setupGuildMenuButtons();
        }
        if(page.type === 'market') {
            
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
        //fix text on 2 lines
        $('div.sort').find('button').addClass('overrideFlex');
        //attach clear custom to game own sorts
        $('div.sort').find('button').on('click', function() {
            clearCustomActiveButtons()
        });

        const customButtonGroup =
            $('<div/>')
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

        let sorted = false;
        let count = 0;
        while (!sorted) {
            const originalList = $('div.sort').parent().find('button.row');
            originalList.each(function(index) {
                const thisXP = $(this).find('div.amount').text().replace(' XP', '').replace(',', '');
                const nextXP = $(this).next().find('div.amount').text().replace(' XP', '').replace(',', '') || '0';
                if(parseInt(nextXP) > parseInt(thisXP)) {
                    swapNodes($(this), $(this).next());
                    return false;
                }
            });

            count++;
            if(count === 500) {
                sorted = true;
            }
        }
    }

    function sortByIdle() {
        if(
            !$(`button:contains('Date')`).hasClass('sort-active') &&
            !$(`button:contains('Daily XP')`).hasClass('sort-active')
        ) {
            $(`button:contains('Date')`).trigger('click');
        }

        clearCustomActiveButtons();
        clearActiveButtons();
        $('.customSortByIdle').addClass('custom-sort-active');

        let sorted = false;
        let count = 0;
        while (!sorted) {
            const originalList = $('div.sort').parent().find('button.row');
            originalList.each(function(index) {
                const thisTimeText = $(this).find('div.time').text();
                const nextTimeText = $(this).next().find('div.time').text() || '0';
                let thisTime = parseInt(thisTimeText.replace('m', '').replace('h', ''));
                let nextTime = parseInt(nextTimeText.replace('m', '').replace('h', ''));
                if(thisTimeText.includes('m')) {
                    thisTime *= 60;
                }
                if(thisTimeText.includes('h')) {
                    thisTime *= 3600;
                }
                if(thisTimeText.includes('d')) {
                    thisTime *= 3600 * 24;
                }
                if(nextTimeText.includes('m')) {
                    nextTime *= 60;
                }
                if(nextTimeText.includes('h')) {
                    nextTime *= 3600;
                }
                if(nextTimeText.includes('d')) {
                    nextTime *= 3600 * 24;
                }
                if(parseInt(nextTime) > parseInt(thisTime)) {
                    swapNodes($(this), $(this).next());
                    return false;
                }
            });

            count++;
            if(count === 500) {
                sorted = true;
            }
        }
    }

    function sortByLevel() {
        clearCustomActiveButtons();
        clearActiveButtons();
        $('.customSortByLevel').addClass('custom-sort-active');

        let sorted = false;
        let count = 0;
        while (!sorted) {
            const originalList = $('div.sort').parent().find('button.row');
            originalList.each(function(index) {
                const thisLevel = $(this).find('div.level').text().replace('Lv. ', '');
                const nextLevel = $(this).next().find('div.level').text().replace('Lv. ', '') || '0';
                if(parseInt(nextLevel) > parseInt(thisLevel)) {
                    swapNodes($(this), $(this).next());
                    return false;
                }
            });

            count++;
            if(count === 500) {
                sorted = true;
            }
        }
    }

    function swapNodes(a, b) {
        const adummy = a.clone();
        a.after(adummy);
        const bdummy = b.clone();
        b.after(bdummy);
        bdummy.replaceWith(a);
        adummy.replaceWith(b);
    }

    function initialise() {
        addStyles();
    }

    function addStyles() {
        const head = document.getElementsByTagName('head')[0]
        if(!head) { return; }
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = styles;
        head.appendChild(style);
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
