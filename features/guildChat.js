(events, elementWatcher, components, configuration, elementCreator, crypto, socket) => {

    let enabled = false;
    let key = '';
    let name = '';
    let missedMessageCount = 0;
    let chatOpened = false;

    let disclaimerMessage = {
        content: {
            message: "@C:red@❗❗❗ Do not share your key with anyone! This is a private encrypted channel for your guild. Don't share your account password with anyone! This chat is not affiliated with the game developers."
        },
    }
    let messages = [];

    function initialise() {
        configuration.registerCheckbox({
            category: 'Guild Chat',
            key: 'guild-chat',
            name: 'Enable Guild Chat',
            default: false,
            handler: handleConfigStateChange,
        });
        configuration.registerInput({
            category: 'Guild Chat',
            key: 'guild-chat-key',
            name: `Enter channel key`,
            default: '',
            inputType: 'text',
            text: 'Private key for Guild Chat Channel',
            layout: '5/2',
            class: 'noPad_InheritHeigth',
            noHeader: true,
            handler: handleConfigGuildChatKeyChange,
        });
        configuration.registerInput({
            category: 'Guild Chat',
            key: 'guild-chat-name',
            name: `Enter name`,
            default: '',
            inputType: 'text',
            text: 'Your Display Name for Guild Chat',
            layout: '7/5',
            class: 'noPad_InheritHeigth',
            noHeader: true,
            handler: handleConfigGuildChatUserNameChange,
        });
        elementCreator.addStyles(styles);
        events.register('page', buildComponent);
        events.register('socket', handleSocketEvent);

        window.sentMessageTest = function (text, key) {
            const encryptedMessage = crypto.encrypt(JSON.stringify({ message: text, sender: name }), key);
            socket.sendMessage(encryptedMessage);
        };
    }

    async function handleConfigStateChange(state) {
        enabled = state;
    }

    async function handleConfigGuildChatKeyChange(state) {
        key = state;
        requiredConfigChange();
    }

    async function handleConfigGuildChatUserNameChange(state) {
        name = state;
        requiredConfigChange();
    }

    function requiredConfigChange() {
        if (key == '' || name == '') {
            componentBlueprint.selectedTabIndex = 1;
        } else {
            componentBlueprint.selectedTabIndex = 0;
        }
    }

    // Menu Notification missed messages
    function addMissedMessageNotification() {
        const $btn = $('nav-component button[routerLink="/guild"]');
        if ($btn.find('.missedMessageNotification').length) return;

        const $reminder = $('<div>', {
            class: `missedMessageNotification`,
            id: 'missedMessageNotification',
            text: `${missedMessageCount} 💬`,
        });

        $btn.append($reminder);
    }
    function removeMissedMessageNotification() {
        $('#missedMessageNotification').remove();
    }
    function updateMissedMessageNotification() {
        if (!enabled || missedMessageCount === 0) {
            removeMissedMessageNotification();
            return;
        }
        const notification = $('#missedMessageNotification');
        if (!notification.length) {
            addMissedMessageNotification();
            return;
        }
        notification.text(`${missedMessageCount} 💬`);
    }





    function handleSocketEvent(socketEventData) {
        if (!enabled) {
            return;
        }

        console.log('Socket Data:', socketEventData);

        if (key && socketEventData) {
            const decryptedContent = JSON.parse(crypto.decrypt(socketEventData.content, key));
            if (decryptedContent) {
                messages.push({ ...socketEventData, content: decryptedContent });
                if (!chatOpened) {
                    missedMessageCount++;
                    updateMissedMessageNotification();
                }
            }
        }

        buildComponent();
    }

    function sendMessage(text) {
        if (text === '') return;

        const encryptedMessage = crypto.encrypt(JSON.stringify({ message: text, sender: name }), key)
        socket.sendMessage(encryptedMessage);
    }

    async function buildComponent() {
        if (!enabled) {
            return;
        }
        try {
            if (events.getLast('page').type !== 'guild') {
                chatOpened = false;
                return;
            }
            await elementWatcher.exists('guild-component > .groups');

            missedMessageCount = 0;
            chatOpened = true;
            updateMissedMessageNotification();

            components.search(componentBlueprint, 'chatMessagesContainer').messages = [disclaimerMessage, ...messages];
            //components.search(componentBlueprint, 'guildChatHeader').textRight = `${messages.at(-1)?.clientCount || 0} 👨‍👩‍👧‍👦`;
            // this is WRONG, clientcount is ALL clients, not just guild members

            components.addComponent(componentBlueprint);
        } catch (e) { }
    }

    // textRight: '0 👨‍👩‍👧‍👦'
    const componentBlueprint = {
        componentId: 'guildChatComponent',
        dependsOn: 'guild-page',
        parent: 'guild-component > .groups > :last-child',
        prepend: false,
        selectedTabIndex: 0,
        after: () => {
            scrollChatToBottom()
        },
        tabs: [{
            title: 'guild-chat-tab',
            rows: [{
                id: 'guildChatHeader',
                type: 'header',
                title: 'Guild Chat'
            }, {
                id: 'chatMessagesContainer',
                type: 'chat',
                messages: []
            }, {
                type: 'input',
                id: 'chatMessageInput',
                name: 'Type a message',
                value: '',
                inputType: 'text',
                layout: '1/6',
                chat: true,
                class: 'chatMessageInput',
                action: () => buildComponent(), // onfocusout
                submit: (value) => sendMessage(value)
            }]
        }, {
            hidden: true,
            title: 'guild-chat-tab',
            rows: [{
                id: 'header',
                type: 'header',
                title: 'Guild Chat',
                textRight: `⛔`
            }, {
                type: 'header',
                id: 'errorHeader',
                title: 'Missing Guild Chat Key or Name',
                centered: true
            }]
        }]
    };

    const styles = `
        .missedMessageNotification {
            box-sizing: border-box;
            padding: 2px 8px;
            display: flex;
            align-items: center;
            font-weight: 600;
            letter-spacing: .25px;
            border-radius: 4px;
            font-size: .875rem;
            background-color: #db6565;
        }
        .inlineImage {
            width: 20px;
            height: 20px;
            vertical-align: middle;
        }
    `;

    initialise();

    function scrollChatToBottom() {
        const $container = $('#chatMessagesContainer');
        if ($container.length) {
            $container.scrollTop($container[0].scrollHeight);
        }
    }
}




