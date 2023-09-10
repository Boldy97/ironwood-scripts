(util) => {

    const exports = {
        create
    };

    async function create(text, time, image) {
        const notificationId = `customNotification_${Date.now()}`
        const notificationDiv =
            $('<div/>')
                .addClass('customNotification')
                .attr('id', notificationId)
                .append(
                    $('<div/>')
                        .addClass('customNotificationImageDiv')
                        .append(
                            $('<img/>')
                                .addClass('customNotificationImage')
                                .attr('src', `${image || 'https://ironwoodrpg.com/assets/misc/quests.png'}`)
                        )
                )
                .append(
                    $('<div/>')
                        .addClass('customNotificationDetails')
                        .text(text)
                );
        $('div.notifications').append(notificationDiv);
        await util.sleep(time || 2000);
        $(`#${notificationId}`).fadeOut('slow', () => {
            $(`#${notificationId}`).remove();
        });
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
        .customNotification {
            padding: 8px 16px 8px 12px;
            border-radius: 4px;
            backdrop-filter: blur(8px);
            background: rgba(255,255,255,.15);
            box-shadow: 0 8px 16px -4px #00000080;
            display: flex;
            align-items: center;
            min-height: 48px;
            margin-top: 12px;
        }
        .customNotificationImageDiv {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
        }
        .customNotificationImage {
            filter: drop-shadow(0px 8px 4px rgba(0,0,0,.1));
        }
        .customNotificationDetails {
            margin-left: 8px;
        }
    `;

    initialise();

    return exports;
}