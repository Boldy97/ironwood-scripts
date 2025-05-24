(events, elementWatcher, components, configuration, elementCreator, crypto) => {

    let enabled = false;
    let key = '';

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
        elementCreator.addStyles(styles);
        events.register('page', setup);

        messages = generateFakeChat(30);

        //messages = messages.map(m => crypto.encrypt(JSON.stringify(m), key));

        components.search(componentBlueprint, 'chatMessagesContainer').messages = messages//.map(m => JSON.parse(crypto.decrypt(m, key)));
        components.search(componentBlueprint, 'guildChatHeader').textRight = `${messages.length} 👨‍👩‍👧‍👦`;
    }

    async function handleConfigStateChange(state) {
        enabled = state;
    }

    async function handleConfigGuildChatKeyChange(state) {
        key = state;
        if (key === '') {
            componentBlueprint.selectedTabIndex = 1;
        } else {
            componentBlueprint.selectedTabIndex = 0;
        }
    }

    async function setup() {
        if (!enabled) {
            return;
        }
        try {
            if (events.getLast('page').type !== 'guild') {
                return;
            }
            await elementWatcher.exists('guild-component > .groups');
            components.addComponent(componentBlueprint);
        } catch (e) { }
    }

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
                title: 'Guild Chat',
                textRight: '0 👨‍👩‍👧‍👦'
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
                submit: (value) => {

                    if (value === '') return;

                    messages.push({
                        sender: 'You',
                        message: value,
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    });
                    components.search(componentBlueprint, 'chatMessagesContainer').messages = messages
                    components.search(componentBlueprint, 'guildChatHeader').textRight = `${messages.length} 👨‍👩‍👧‍👦`;
                    components.search(componentBlueprint, 'chatMessageInput').value = '';
                    $(`#chatMessageInput`).val('').blur();

                    components.addComponent(componentBlueprint);
                }
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
                title: 'Missing Guild Chat Key',
                centered: true
            }]
        }]
    };

    const styles = `

    `;

    initialise();

    function generateFakeChat(count = 10) {
        const sampleMessages = [
            'Hello, world!',
            'How are you?',
            'Anyone online?',
            'lorem ipsum dolor sit amet, consectetur adipiscing elit. lorem ipsum dolor sit amet, consectetur adipiscing elit.',
            'What’s the plan today?',
            'I just found a rare item!',
            'Let’s meet at the dungeon entrance.',
            'brb, quick break.',
            'gg everyone!',
            'Need help with this quest.'
        ];

        const messages = [];
        const baseHour = 12;
        const baseMinute = 0;

        for (let i = 0; i < count; i++) {
            const minutes = (baseMinute + i * 2) % 60;
            const hour = baseHour + Math.floor((baseMinute + i * 2) / 60);
            const time = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

            messages.push({
                sender: 'Player',
                message: sampleMessages[i % sampleMessages.length],
                time: time
            });
        }

        return messages;
    }

    function scrollChatToBottom() {
        const $container = $('#chatMessagesContainer');
        if ($container.length) {
            $container.scrollTop($container[0].scrollHeight);
        }
    }
}




