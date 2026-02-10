const PORT = 3000;
const HOST = window.location.hostname;
const BASE_URL = `http://${HOST}:${PORT}/api`;

export const api = {
    async getStatus() {
        const response = await fetch(`${BASE_URL}/status`);
        return response.json();
    },

    async getPeers() {
        const response = await fetch(`${BASE_URL}/peers`);
        return response.json();
    },

    async sendFile(peerIp: string, file: File) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('peerIp', peerIp);

        const response = await fetch(`${BASE_URL}/send`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Transfer failed');
        }

        return response.json();
    }
};
