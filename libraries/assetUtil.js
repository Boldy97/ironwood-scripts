(itemCache) => {
    const loadedImages = new Map();

    const exports = {
        loadImageFromUrl,
        loadItemImage
    };

    async function loadImageFromUrl(url) {
        if (loadedImages.has(url)) {
            return loadedImages.get(url);
        }

        return await new Promise((res) => {
            const img = new Image();
            img.onload = () => {
                loadedImages.set(url, img);
                res(img);
            };
            img.onerror = () => res(null);
            img.src = url;
        });
    }

    async function loadItemImage(itemId) {
        const item = itemCache.byId[itemId];
        if (!item) return null;
        return await loadImageFromUrl('assets/' + item.image);
    }

    return exports;
}
