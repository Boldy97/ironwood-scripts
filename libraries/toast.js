(util, elementCreator) => {

    const exports = {
        create
    };

    function initialise() {
        elementCreator.addStyles(styles);
    }

    // text, time, image
    async function create(config) {
        config.time ||= 2000;
        config.image ||= 'https://ironwoodrpg.com/assets/misc/quests.png';
        const notificationId = `customNotification_${Math.floor(Date.now() * Math.random())}`
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
                                .attr('src', config.image)
                        )
                )
                .append(
                    $('<div/>')
                        .addClass('customNotificationDetails')
                        .html(config.text)
                );
        $('div.notifications').append(notificationDiv);
        await util.sleep(config.time);
        $(`#${notificationId}`).fadeOut('slow', () => {
            $(`#${notificationId}`).remove();
        });
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
            pointer-events: all;
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
            image-rendering: auto;
        }
        .customNotificationDetails {
            margin-left: 8px;
            text-align: center;
        }
    `;

    initialise();

    return exports;
}
