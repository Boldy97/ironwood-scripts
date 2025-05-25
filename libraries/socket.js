(events) => {

    const exports = {
        openSocket,
        closeSocket,
        sendMessage,
        getHistory
    };

    const emitEvent = events.emit.bind(null, 'socket');

    let socket = null;
    let reconnectInterval = 3000;
    let url = "wss://iwrpg.vectordungeon.com/websocket";
    let shouldReconnect = true;

    const HISTORY_LIMIT = 100;
    const history = [];
    const requesters = new Set();

    function initialise() { }

    function openSocket(forKey) {
        requesters.add(forKey);

        if (socket && socket.readyState <= 1) return;

        socket = new WebSocket(url);

        socket.addEventListener("open", () => {
            console.log("WebSocket connected");
        });

        socket.addEventListener("message", (event) => {
            try {
                const data = JSON.parse(event.data);

                history.push(data);
                if (history.length > HISTORY_LIMIT) {
                    history.shift();
                }

                emitEvent(data);
            } catch {
                console.warn("Invalid message:", event.data);
            }
        });

        socket.addEventListener("close", () => {
            console.log("WebSocket closed");

            if (shouldReconnect && requesters.size > 0) {
                setTimeout(openSocket, reconnectInterval);
            }
        });

        socket.addEventListener("error", (err) => {
            console.error("WebSocket error", err);
            socket.close();
        });
    }

    function closeSocket(forKey) {
        requesters.delete(forKey);

        if (requesters.size === 0) {
            shouldReconnect = false;
            if (socket) {
                socket.close();
                socket = null;
            }
        }
    }

    function sendMessage(data) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(data));
        } else {
            console.warn("Socket not open. Message not sent:", data);
        }
    }

    function getHistory() {
        return [...history];
    }

    initialise();

    return exports;
}
