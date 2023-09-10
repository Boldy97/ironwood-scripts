(events, elementWatcher, easyRequests, util) => {
    events.register('url', handlePage);

    let guild = undefined;

    async function handlePage(page) {
        if(!page.endsWith('leaderboards')) {
            return;
        }
        await elementWatcher.exists('.card > .row');

        setupLeaderboardButtons();
        await addGuildBadgeToGuildMembers();
    }

    function setupLeaderboardButtons() {
        $('button.category').each(function() {
            //$(this).off('click');
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

    async function initialise() {
        await getGuild();
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
        .customBadge {
            display: flex;
            width: 16px;
            height: 16px;
            margin-left: 8px;
        }
    `;

    async function getGuild() {
        guild = await easyRequests.getGuildMembers();
    }

    function getGuildieNames() {
        if(!guild) return [];
        return guild.guild.members.map(m => m.displayName);
    }

    initialise();
    
}