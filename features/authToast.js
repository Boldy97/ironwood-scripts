(userStore, toast) => {

    async function initialise() {
        await userStore.ready;
        toast.create({
            text: 'Pancake-Scripts initialised!',
            image: 'https://img.icons8.com/?size=48&id=1ODJ62iG96gX&format=png'
        });
    }

    initialise();

}
