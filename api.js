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
        if (data && data.stateCert) localStorage.setItem('stateCert', data.stateCert);
        return data;
    },

    // Auth
    loginParent(email, pwd) { return this.request('POST', '/api/v1/auth/parent', { email, pwd }); },
    registerParent(email, pwd) { return this.request('POST', '/api/v1/parent/', { email, pwd }); },
    changePassword(oldPassword, newPassword) { return this.request('PATCH', '/api/v1/parent/password', { oldPassword, newPassword }); },
    resetRequest(email) { return this.request('POST', '/api/v1/parent/reset-request', { email }); },
    resetPassword(email, otp, newPassword) { return this.request('POST', '/api/v1/parent/reset', { email, otp, newPassword }); },
    loginUser(token) { return this.request('POST', '/api/v1/auth/user', { token }); },

    // Users
    createChild(nick) { return this.request('POST', '/api/v1/user/', { nick }); },
    getChildrenByParent(email) { return this.request('GET', '/api/v1/parent/' + encodeURIComponent(email) + '/children'); },
    editChildNick(userid, nick) { return this.request('PATCH', '/api/v1/user/' + userid, { nick }); },
    deleteChild(userid) { return this.request('DELETE', '/api/v1/user/' + userid); },

    // Devices
    createDevice(userid) { return this.request('POST', '/api/v1/device/' + userid); },

    // Messages
    getMessageList(status, limit) { return this.request('GET', '/api/v1/message/list/' + status + (limit ? '?limit=' + limit : '')); },
    getMessage(id) { return this.request('GET', '/api/v1/message/' + id); },
    sendMessage(to, message) { return this.request('POST', '/api/v1/message/', { to, message }); },
    deleteMessage(id) { return this.request('DELETE', '/api/v1/message/' + id); },

    // Connections
    getConnections() { return this.request('GET', '/api/v1/connection/'); },
    requestConnection(from, to) { return this.request('POST', '/api/v1/connection/' + from + '/' + to); },
    getApprovalList() { return this.request('GET', '/api/v1/parent/me/connections/pending'); },
    getSentRequests() { return this.request('GET', '/api/v1/parent/me/connections/sent'); },
    approveConnection(connId, status) { return this.request('PATCH', '/api/v1/connection/' + connId, { status }); },

    // Discovery
    findParent(email) { return this.request('GET', '/api/v1/parent/' + encodeURIComponent(email)); },
};
