(events, elementWatcher, request, util, configuration) => {

    let enabled = false;
    let guild = null;

    async function initialise() {
        const category = configuration.registerCategory('ui-features', 'UI Features');
        configuration.registerToggle('leaderboard-badges', 'Leaderboard Badges', true, handleConfigStateChange, category);
        events.register('page', handlePage);
        addStyles();
    }

    async function handleConfigStateChange(state, name) {
        enabled = state;
        if(enabled && !guild) {
            guild = await request.getGuildMembers();
        }
    }

    async function handlePage(page) {
        if(!enabled || !guild || page.type !== 'leaderboards') {
            return;
        }
        await elementWatcher.exists('.card > .row');

        setupLeaderboardButtons();
        await addGuildBadgeToGuildMembers();
    }

    function setupLeaderboardButtons() {
        $('button.category').each(function() {
            $(this).on('click', async function() {
                await util.sleep(50);
                await addGuildBadgeToGuildMembers();
            });
        })
    }

    async function addGuildBadgeToGuildMembers() {
        await elementWatcher.exists('.card > .row');
        $('.customBadge').remove();

        const leaderboard = $('div.column').find('div.row')
        leaderboard.each(function(index) {
            const leaderboardRowName = $(this).find('div.name').find('div').text();
            if(guild.includes(leaderboardRowName)) {
                addGuildBadge($(this).find('div.name').find(`div:contains(${leaderboardRowName})`));
            }
        })
    }

    function addGuildBadge(node) {
        const custombadge = 
            $('<div/>')
            .addClass('customBadge')
            .append(
                $('<img/>')
                    .attr('src', 'https://ironwoodrpg.com/assets/misc/guild.png')
            )
            .attr('title', 'Guild member');
        node.after(custombadge);
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
        .customBadge {
            display: flex;
            width: 16px;
            height: 16px;
            margin-left: 8px;
        }
    `;

    initialise();
    
}
