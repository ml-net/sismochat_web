const API_BASE = localStorage.getItem('apiBase') || 'http://localhost:3000';

const api = {
    token: null,

    setToken(t) {
        this.token = t;
        localStorage.setItem('token', t);
    },

    getToken() {
        if (!this.token) this.token = localStorage.getItem('token');
        return this.token;
    },

    clearToken() {
        this.token = null;
        localStorage.removeItem('token');
    },

    async request(method, path, body) {
        const headers = { 'Content-Type': 'application/json' };
        if (this.getToken()) {
            headers['Authorization'] = 'Bearer ' + this.getToken();
        }
        const opts = { method, headers };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(API_BASE + path, opts);
        if (res.status === 204) return null;
        const contentType = res.headers.get('content-type') || '';
        const data = contentType.includes('application/json') ? await res.json().catch(() => null) : await res.text();
        if (!res.ok) throw { status: res.status, data };
        return data;
    },

    // Auth
    loginParent(email, pwd) { return this.request('POST', '/api/auth/parent', { email, pwd }); },
    registerParent(email, pwd) { return this.request('POST', '/api/super/', { email, pwd }); },
    loginUser(token) { return this.request('POST', '/api/auth/user', { token }); },

    // Users
    createChild(nick) { return this.request('POST', '/api/user/', { nick }); },
    getChildrenByParent(email) { return this.request('GET', '/api/user/parent/' + encodeURIComponent(email)); },

    // Devices
    createDevice(userid) { return this.request('POST', '/api/device/' + userid); },

    // Messages
    getMessageList(status) { return this.request('GET', '/api/message/list/' + status); },
    getMessage(id) { return this.request('GET', '/api/message/' + id); },
    sendMessage(to, message) { return this.request('POST', '/api/message/', { to, message }); },
    deleteMessage(id) { return this.request('DELETE', '/api/message/' + id); },

    // Connections
    getConnections() { return this.request('GET', '/api/connection/'); },
    requestConnection(from, to) { return this.request('POST', '/api/connection/' + from + '/' + to); },
    getApprovalList(parent) { return this.request('GET', '/api/connection/approvalList/' + parent); },
    approveConnection(connId, status) { return this.request('PATCH', '/api/connection/' + connId, { status }); },
};
