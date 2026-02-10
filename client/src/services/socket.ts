import { io, Socket } from 'socket.io-client';

const PORT = 3000;
const HOST = window.location.hostname;
const URL = `http://${HOST}:${PORT}`;

class SocketService {
    public socket: Socket;

    constructor() {
        this.socket = io(URL, {
            autoConnect: false
        });
    }

    connect() {
        this.socket.connect();
    }

    disconnect() {
        this.socket.disconnect();
    }

    on(event: string, callback: (...args: any[]) => void) {
        this.socket.on(event, callback);
    }

    off(event: string, callback?: (...args: any[]) => void) {
        this.socket.off(event, callback);
    }
}

export default new SocketService();
