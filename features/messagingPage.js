(pages, components, configuration, hotkey, events, elementCreator, modal) => {

    const PAGE_NAME = 'Messages';
    let messagesPageIsOpen = false;

    async function initialise() {
        await pages.register({
            category: 'Communication',
            //after: 'Changelog',
            name: PAGE_NAME,
            image: 'https://cdn-icons-png.flaticon.com/512/610/610413.png',
            columns: 2,
            render: renderPage
        });
        configuration.registerCheckbox({
            category: 'Pages',
            key: 'messages-enabled',
            name: 'Messaging',
            default: true, // TODO: Change to false when ready
            handler: handleConfigStateChange
        });
        elementCreator.addStyles(styles);
        events.register('page', hanglePageEvent);
    }

    function hanglePageEvent(event) {
        //to track when a user leaves this page to start accumulating missed message notifications
        if (events.getLast('page').type !== PAGE_NAME.toLowerCase()) {
            messagesPageIsOpen = false;
            return;
        }
    }

    function handleConfigStateChange(state) {
        if (state) {
            pages.show(PAGE_NAME);
        } else {
            pages.hide(PAGE_NAME);
        }
    }

    async function renderPage() {
        // const header = components.search(componentBlueprint, 'header');
        // const list = components.search(componentBlueprint, 'list');

        // for (const index in changelogs) {
        //     header.title = changelogs[index].title;
        //     header.textRight = new Date(changelogs[index].time).toLocaleDateString();
        //     list.entries = changelogs[index].entries;
        //     components.addComponent(componentBlueprint);
        // }
        await renderLeftColumn();
        await renderRightColumn();
    }

    async function renderLeftColumn() {

        components.addComponent(conversationListComponent);
    }

    async function renderRightColumn() {
        const chatMessagesContainer = components.search(selectedConversationComponent, 'chatMessagesContainer');
        chatMessagesContainer.messages = [disclaimerMessage("The Pope"), ...[]];

        components.addComponent(selectedConversationComponent);
    }

    function disclaimerMessage(otherPartyName) {
        const disclaimerMessage = {
            content: {
                type: 'chat_system',
                message: `@C:red@Do NOT share your account password with anyone. This is a private, encrypted channel for you and ${otherPartyName}. Note: This chat is *not* affiliated with the game or its developers.`,
            }
        }
        return disclaimerMessage;
    }

    async function createNewChat() {
        const modalId = await modal.create({
            title: 'Select a recipient',
            image: 'https://cdn-icons-png.flaticon.com/512/610/610413.png',
            maxWidth: 300
        });
        selectRecipientComponent.parent = `#${modalId}`;

        components.addComponent(selectRecipientComponent);
    }

    const selectRecipientComponent = {
        componentId: 'selectRecipientComponent',
        dependsOn: 'custom-page',
        parent: 'MODAL ID GOES HERE',
        selectedTabIndex: 0,
        tabs: [{
            title: 'tab',
            rows: [{
                id: 'availableRecipientsList',
                type: 'listView',
                maxHeight: 500,
                render: ($element, item) => {
                    $element.append(
                        $('<div/>').addClass('selectRecipientComponentItemWrapper').append(
                            $('<span/>').addClass('selectRecipientComponentItemName').text(String(item || 'Unnamed'))
                        ).on('click', () => {
                            console.log(item);
                            modal.close();
                        })
                    );
                    return $element;
                },
                entries: [
                    "Spaghetti Man",
                    "Captain Cool",
                    "MuffinTop",
                    "JellyBean",
                    "Banana Split",
                    "The Warden",
                    "Ghosty",
                    "IronToast",
                    "Sir Hopsalot",
                    "DJ Noodle",
                    "PickleRick",
                    "Major Mayhem",
                    "Agent Z",
                    "SassySue",
                    "Cranky Carl",
                    "Quiet Quinn",
                    "LoFi Larry",
                    "QueenBean",
                    "WaffleKing",
                    "Mr. Wiggles",
                    "Nana Banana",
                    "SlickRick",
                    "CodeGoblin",
                    "Dr. Pepperoni"
                ]
            }]
        }]
    };

    const conversationListComponent = {
        componentId: 'leftColumnComponent',
        dependsOn: 'custom-page',
        parent: '.column0',
        selectedTabIndex: 0,
        tabs: [{
            title: 'tab',
            rows: [{
                id: 'header',
                type: 'header',
                title: 'Inbox',
                action: async () => { createNewChat(); },
                name: 'New Chat',
            }, {
                id: 'chatsList',
                type: 'listView',
                maxHeight: 1000,
                render: ($element, item) => {
                    $element.append(
                        $('<div/>').addClass('chatListViewContent').append(
                            $('<div/>').addClass('chatListViewTop').append(
                                $('<span/>').addClass('chatListViewSender').text(String(item.sender || 'Unknown')),
                                $('<span/>').addClass('chatListViewTimestamp').text(String(item.time || ''))
                            ),
                            $('<div/>').addClass('chatListViewBottom').append(
                                $('<span/>').addClass('chatListViewLastMessage').text(item.lastMessage ? String(item.lastMessage) : 'No messages yet'),
                                $('<span/>').addClass('chatListViewNotification').text(
                                    item.unreadCount > 0 ? (String(item.unreadCount) + ' new') : ''
                                )
                            )
                        ).on('click', () => {
                            console.log(item);
                        })
                    );
                    return $element;
                },
                entries: [{ // hardcoded for now, will be replaced with actual data later gather from legit messages
                    sender: "Pancake",
                    time: "12:45 PM",
                    lastMessage: "Please respond to my messages.",
                    unreadCount: 9
                }, {
                    sender: "Sexy Lady",
                    time: "12:45 PM",
                    lastMessage: "*image*",
                    unreadCount: 1
                }, {
                    sender: "Miccyboye",
                    time: "12:45 PM",
                    lastMessage: "I'm sorry to inform you you're banned again for violating tos.",
                    unreadCount: 1
                }, {
                    sender: "LEROY JENKINS",
                    time: "12:45 PM",
                    lastMessage: "IM GOING IN!",
                    unreadCount: 1
                }, {
                    sender: "Santa Claus",
                    time: "12:45 PM",
                    unreadCount: 0
                }, {
                    sender: "Patt",
                    time: "12:45 PM",
                    lastMessage: "You have been invited to join the Rift Guild Chat.",
                    unreadCount: 0
                }]
            }]
        }]
    };

    const selectedConversationComponent = {
        componentId: 'rightColumnComponent',
        dependsOn: 'custom-page',
        parent: '.column1',
        selectedTabIndex: 0,
        after: () => {
            scrollChatToBottom()
        },
        tabs: [{
            title: 'private-message-tab',
            rows: [{
                id: 'privateMessageHeader',
                type: 'header',
                title: 'Santa Claus',
            }, {
                id: 'chatMessagesContainer',
                type: 'chat',
                inputPlaceholder: 'Type a message...',
                inputType: 'text',
                inputValue: '',
                inputLayout: '1/6',
                messages: [],
                action: () => setTimeout(() => renderPage(), 100), // onfocusout
                submit: (value) => { console.log('Message sent:', value); },
            }]
        }]
    };

    function scrollChatToBottom() {
        const $container = $('#chatMessagesContainer');
        if ($container.length) {
            $container.scrollTop($container[0].scrollHeight);
        }
    }

    const styles = `
        .chatListViewContent {
            display: flex;
            flex-direction: column;
            height: 100%;
            width: 100%;
            padding: 0.75rem 1rem;
            justify-content: space-between;
        }
        .chatListViewTop,
        .chatListViewBottom {
            display: flex;
            justify-content: space-between;
            padding: 0 0.25rem;
        }
        .chatListViewSender {
            font-weight: bold;
        }
        .chatListViewTimestamp {
            color: #999;
            font-size: 0.85em;
        }
        .chatListViewLastMessage {
            color: #ccc;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 70%;
        }
        .chatListViewNotification {
            color: white;
            background-color: #b35c5c;
            font-size: 0.75em;
            border-radius: 10px;
            padding: 0 6px;
            align-self: center;
        }
        .selectRecipientComponentItemWrapper {
            display: flex;
            align-items: center;
            padding: 0.5rem 0.75rem;
            width: 100%;
        }
        .selectRecipientComponentItemName {
            font-size: 0.95rem;
            font-weight: 500;
            color: #ddd;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
    `;

    initialise();

}
