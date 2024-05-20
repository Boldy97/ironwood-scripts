(configuration, events, petUtil, elementCreator, toast) => {

    let enabled = false;
    let lastSeenPet;
    let pasteButton;

    function initialise() {
        configuration.registerCheckbox({
            category: 'Pets',
            key: 'pet-rename',
            name: 'Name suggestions',
            default: false,
            handler: handleConfigStateChange
        });
        events.register('reader-pet', handlePetReader);
        $(document).on('click', 'modal-component .header .heading', onRename);
        pasteButton = elementCreator.getButton('Paste encoded name', pasteName);
    }

    function handleConfigStateChange(state, name) {
        enabled = state;
    }

    function handlePetReader(event) {
        if(event.type === 'single') {
            lastSeenPet = event.value;
        }
    }

    function onRename() {
        if(!enabled) {
            return;
        }
        const page = events.getLast('page');
        if(!page || page.type !== 'taming') {
            return;
        }
        $('modal-component .header > .name').append(pasteButton);
    }

    function pasteName() {
        const text = petUtil.petToText(lastSeenPet);
        const input = $('modal-component input');
        input.val(text);
        input[0].dispatchEvent(new Event('input'));
        toast.create({
            text: 'Pasted encoded name',
            image: 'https://img.icons8.com/?size=48&id=22244'
        });
    }

    initialise();

}