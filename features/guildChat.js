(events, elementWatcher, components, configuration, elementCreator, crypto, socket, hotkey) => {

    // Guild Chat Feature TODO list

    // @ mention toasts
    // DONE extract component, dont use other components

    let enabled = false;
    let audionotification = false;
    let channelKey = '';
    let displayName = '';
    let missedMessageCount = 0;
    let chatOpened = false;
    let openChatHotkey = '';

    const disclaimerMessage = {
        content: {
            message: "@C:red@Do NOT share your chat key or account password with anyone! This is a private encrypted channel for your guild. This chat is not affiliated with the game developers."
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
            text: 'Private Channel Key',
            layout: '1/1',
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
            text: 'Your Display Name',
            layout: '1/1',
            class: 'noPad_InheritHeigth',
            noHeader: true,
            handler: handleConfigGuildChatUserNameChange,
        });
        configuration.registerCheckbox({
            category: 'Guild Chat',
            key: 'guild-chat-notification-sound',
            name: 'Message Notification Sound',
            default: false,
            handler: handleConfigGuildChatMessageNotificationChange,
        });
        configuration.registerInput({
            category: 'Guild Chat',
            key: 'guild-chat-open-hotkey',
            name: `Key`,
            default: '',
            inputType: 'text',
            text: 'Focus chat hotkey (while on guild page) (empty for none)',
            layout: '8/1',
            class: 'noPad_InheritHeigth',
            noHeader: true,
            handler: handleConfigGuildChatHotkeyChange,
        });
        elementCreator.addStyles(styles);
        events.register('page', buildComponent);
        events.register('socket', handleSocketEvent);

        window.sentMessageTest = function (text, key) {
            const encryptedMessage = crypto.encrypt(JSON.stringify({ message: text, sender: displayName }), key);
            socket.sendMessage(encryptedMessage);
        };
        audio.volume = 0.5;
    }

    async function handleConfigStateChange(state) {
        enabled = state;
    }

    async function handleConfigGuildChatKeyChange(state) {
        channelKey = state;
        requiredConfigChange();
    }

    async function handleConfigGuildChatUserNameChange(state) {
        displayName = state;
        requiredConfigChange();
    }

    async function handleConfigGuildChatMessageNotificationChange(state) {
        audionotification = state;
    }

    async function handleConfigGuildChatHotkeyChange(state) {
        openChatHotkey = state;
    }

    function requiredConfigChange() {
        if (channelKey == '' || displayName == '') {
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

        if (channelKey && socketEventData) {
            const decryptedContent = JSON.parse(crypto.decrypt(socketEventData.content, channelKey));
            if (decryptedContent) {
                messages.push({ ...socketEventData, content: decryptedContent });
                if (!chatOpened) {
                    missedMessageCount++;
                    updateMissedMessageNotification();
                    if (audionotification) audio.play();
                }
            }
        }

        buildComponent();
    }

    function sendMessage(text) {
        if (text === '') return;

        const encryptedMessage = crypto.encrypt(JSON.stringify({ message: text, sender: displayName }), channelKey)
        socket.sendMessage(encryptedMessage);
    }

    async function buildComponent() {
        if (!enabled) {
            return;
        }
        try {
            if (events.getLast('page').type !== 'guild') {
                chatOpened = false;
                hotkey.detachAll();
                return;
            }
            await elementWatcher.exists('guild-component > .groups');

            missedMessageCount = 0;
            chatOpened = true;
            hotkey.attach(openChatHotkey, () => { $('#chatMessagesContainer_input').focus(); });
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
                inputPlaceholder: `Type a message...${openChatHotkey !== '' ? ` (hotkey: ${openChatHotkey})` : ''}`,
                inputType: 'text',
                inputValue: '',
                inputLayout: '1/6',
                messages: [],
                action: () => setTimeout(() => buildComponent(), 100), // onfocusout
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

    function scrollChatToBottom() {
        const $container = $('#chatMessagesContainer');
        if ($container.length) {
            $container.scrollTop($container[0].scrollHeight);
        }
    }

    const audio = new Audio('data:audio/wav;base64,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6v/q/+L/4v/Z/9v/0f/R/8z/xf/H/7//vf+8/7j/tv+z/6//sP+s/6//qP+s/6b/qf+m/6j/pf+q/6X/q/+m/6z/qv+x/6v/tf+v/7j/tv+6/73/wP/E/8L/zv/H/9T/0v/Y/9z/3v/k/+X/7v/s//n/9P///wAABQAJAAsAEAATABUAGgAYACUAIQAsACkAMwAxADgAOgA7AD8APwBDAEIARwBGAEoASQBLAEsATABLAE8ASwBMAE4ASQBOAEgASQBJAEQASAA/AEMAPwA8ADsAOAA2ADIAMQAsACoAKAAjACAAHwAWABsADwARAAoACQAFAAEA///5//n/8v/y/+v/6//l/+b/3f/g/9r/2P/Y/9D/1P/N/87/yP/L/8T/x//F/8T/wv/B/7//wv+9/8H/vf/A/7//vv/E/77/xv/C/8b/xP/K/8b/zv/L/83/0//P/9j/1P/d/9r/3//h/+P/6f/n//D/6//4//H/+//6/wEAAQADAAkABwAPAA0AEQASABUAGwAaACEAHgAlACMAKQAoAC0AKwAtADAAMQAxADQAMgA0ADUANAA2ADUANgAyADgAMwA3ADIANAAxADQAMAAuAC8AKwAtACkAJwAoACIAIwAfACEAGgAcABQAGAASABEADwAMAAoABgAFAAIA///+//v/+P/3//X/7//y/+z/7//n/+v/5P/l/+P/4P/g/97/3f/b/9r/2v/Z/9X/2v/S/9r/0//X/9T/1f/W/9T/1v/W/9f/1//X/9n/2f/b/9z/2v/f/9z/4v/g/+L/5//h/+z/5f/v/+n/8//u//P/8//2//n//P/6/wIA/f8DAAIABwAFAAwABgAPAAgAEQAOABIAFQASABsAEwAcABcAHwAZACAAGgAgAB4AIQAfACQAHQAlAB0AIgAgACIAHwAhAB8AHwAhAB0AIQAbAB8AGQAdABgAGQAXABYAFgATABQAEAARAA8ADQANAAgACwAGAAcABQADAAQA/v8DAPv/AAD5//v/+P/2//j/9f/z//b/7//0/+3/8f/t/+7/7//o//D/5v/v/+n/5//s/+X/7v/l/+v/5f/s/+X/7f/l/+z/6P/r/+r/6//q/+3/7P/s//D/6//y/+3/9P/w//b/8P/3//L/+f/0//v/9//+//r//f/8/wAA/v8CAP7/BAABAAYABAADAAcABwAHAAcACwAHAA4ABwAQAAgAEQAJABEACwAQAA8ADAASAAwADwAPAA4AEQANAA8ADgAOAA4ADgAOAAsAEQAKAA4ADQAJAA4ABwAKAAsACAAKAAcACQAGAAcABgAEAAcAAwADAAQAAAACAAIA//8CAP7/AAD+/////v/8//z//v/8//z/+P////b//f/5//n//P/6//n/+P/8//X//P/2//r/+P/7//n//P/3//3/8/8BAPT/AAD3//3/+//5/wAA9/8AAPf/AQD6////+f////7/+/8DAPn/AgD8////AAD+/wAA/v///wIAAAD+/wQA/f8DAAAAAAABAP//AQAAAExJU1SYAAAASU5GT0lQUkQOAAAAcmhvZGVzbWFzLmNvbQBJQVJUDAAAAEFuZHkgUmhvZGUAAElDTVRUAAAAVGhpcyBmaWxlIGlzIGxpY2Vuc2VkIHVuZGVyIENDIEJZIDMuMCAtIGh0dHA6Ly9jcmVhdGl2ZWNvbW1vbnMub3JnL2xpY2Vuc2VzL2J5LzMuMC8ASUNSRAYAAAAyMDE3AABpZDMgqAAAAElEMwMAAAAAAR5UQUxCAAAADgAAAHJob2Rlc21hcy5jb21URFJDAAAABQAAADIwMTdUUEUxAAAACwAAAEFuZHkgUmhvZGVDT01NAAAAWAAAAAAAAABUaGlzIGZpbGUgaXMgbGljZW5zZWQgdW5kZXIgQ0MgQlkgMy4wIC0gaHR0cDovL2NyZWF0aXZlY29tbW9ucy5vcmcvbGljZW5zZXMvYnkvMy4wLw==');

    initialise();
}




