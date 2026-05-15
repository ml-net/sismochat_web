// State
let currentProfile = null; // 'Parent' or 'User'
let parentEmail = null;

// Crypto helpers
async function privateEncrypt(message, privateKeyPem) {
    const forge = window.forge;
    if (!forge) throw new Error('forge library not loaded');
    const privateKey = forge.pki.decryptRsaPrivateKey(privateKeyPem, '');
    if (!privateKey) throw new Error('Failed to decrypt private key');
    // Equivalent to Node crypto.privateEncrypt (PKCS1 v1.5 type 1 padding)
    const bytes = forge.util.encodeUtf8(message);
    const encrypted = forge.pki.rsa.encrypt(bytes, privateKey, 0x01);
    return forge.util.encode64(encrypted);
}

function saveChildCredentials(userId, deviceId, keys) {
    const children = JSON.parse(localStorage.getItem('childCredentials') || '{}');
    children[userId] = { deviceId, keys };
    localStorage.setItem('childCredentials', JSON.stringify(children));
}

function getChildCredentials() {
    return JSON.parse(localStorage.getItem('childCredentials') || '{}');
}

// Views
const views = {
    login: document.getElementById('login-view'),
    parent: document.getElementById('parent-view'),
    chat: document.getElementById('chat-view'),
};

function showView(name) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    views[name].classList.remove('hidden');
}

// Local message storage
function saveLocalMessage(msg) {
    const msgs = JSON.parse(localStorage.getItem('messages') || '[]');
    if (!msgs.find(m => m.id === msg.id)) {
        msgs.push(msg);
        localStorage.setItem('messages', JSON.stringify(msgs));
    }
}

function getLocalMessages() {
    return JSON.parse(localStorage.getItem('messages') || '[]');
}

function renderLocalMessages() {
    const list = document.getElementById('local-messages');
    list.innerHTML = '';
    getLocalMessages().forEach(msg => {
        const li = document.createElement('li');
        const date = msg.createdAt ? new Date(msg.createdAt).toLocaleString() : '';
        li.textContent = `[${date}] From: ${msg.from} → To: ${msg.to} - ${msg.body}`;
        if (msg.from === 'me' && msg.serverMsgId) {
            const btn = document.createElement('button');
            btn.textContent = 'Withdraw';
            btn.style.marginLeft = '10px';
            btn.onclick = async () => {
                try {
                    await api.deleteMessage(msg.serverMsgId);
                    removeLocalMessage(msg.id);
                    renderLocalMessages();
                } catch (e) {
                    alert(e.data?.msg || 'Cannot withdraw (already downloaded?)');
                }
            };
            li.appendChild(btn);
        }
        list.appendChild(li);
    });
}

function removeLocalMessage(id) {
    const msgs = getLocalMessages().filter(m => m.id !== id);
    localStorage.setItem('messages', JSON.stringify(msgs));
}

// API URL config
document.getElementById('api-base').value = localStorage.getItem('apiBase') || 'http://localhost:3000';
document.getElementById('api-status').textContent = 'Current: ' + (localStorage.getItem('apiBase') || 'http://localhost:3000');
document.getElementById('btn-set-api').addEventListener('click', () => {
    const url = document.getElementById('api-base').value.replace(/\/$/, '');
    localStorage.setItem('apiBase', url);
    document.getElementById('api-status').textContent = 'Set to: ' + url + ' (reload page)';
});

// Tabs
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
        if (tab.dataset.tab === 'user-login') populateUserSelect();
    });
});

// Parent login
document.getElementById('btn-parent-login').addEventListener('click', async () => {
    try {
        const email = document.getElementById('parent-email').value;
        const pwd = document.getElementById('parent-pwd').value;
        const res = await api.loginParent(email, pwd);
        api.setToken(res.token);
        const payload = JSON.parse(atob(res.token.split('.')[1]));
        parentEmail = payload.email;
        currentProfile = 'Parent';
        document.getElementById('parent-email-display').textContent = parentEmail;
        showView('parent');
        loadChildren();
    } catch (e) {
        document.getElementById('login-error').textContent = e.data?.errDesc || 'Login failed';
    }
});

// Parent register
document.getElementById('btn-parent-register').addEventListener('click', async () => {
    try {
        const email = document.getElementById('parent-email').value;
        const pwd = document.getElementById('parent-pwd').value;
        await api.registerParent(email, pwd);
        document.getElementById('login-error').textContent = 'Registered! Now login.';
    } catch (e) {
        const details = e.data?.details?.map(d => d.msg).join(', ') || '';
        document.getElementById('login-error').textContent = e.data?.errDesc || details || 'Registration failed';
    }
});

// Populate user selector from saved credentials
function populateUserSelect() {
    const select = document.getElementById('user-select');
    select.innerHTML = '<option value="">Select a child user...</option>';
    const creds = getChildCredentials();
    Object.keys(creds).forEach(userId => {
        const opt = document.createElement('option');
        opt.value = userId;
        opt.textContent = userId.substring(0, 8) + '...';
        select.appendChild(opt);
    });
}

// User login
document.getElementById('btn-user-login').addEventListener('click', async () => {
    try {
        const userId = document.getElementById('user-select').value;
        if (!userId) return;
        const creds = getChildCredentials()[userId];
        if (!creds) {
            document.getElementById('login-error').textContent = 'No credentials found for this user';
            return;
        }
        const encodedUserId = btoa(userId);
        const encodedDeviceId = btoa(creds.deviceId);
        const encryptedDevice = await privateEncrypt(creds.deviceId, creds.keys.private);
        const token = encodedUserId + '.' + encodedDeviceId + '.' + encryptedDevice;
        const res = await api.loginUser(token);
        api.setToken(res.token);
        currentProfile = 'User';
        const payload = JSON.parse(atob(res.token.split('.')[1]));
        document.getElementById('chat-nick').textContent = payload.nick;
        showView('chat');
        renderLocalMessages();
    } catch (e) {
        document.getElementById('login-error').textContent = e.data?.errDesc || 'Login failed';
    }
});

// Create child
document.getElementById('btn-create-child').addEventListener('click', async () => {
    try {
        const nick = document.getElementById('child-nick').value;
        const res = await api.createChild(nick);
        const deviceRes = await api.createDevice(res.ID);
        saveChildCredentials(res.ID, deviceRes, res.keys);
        document.getElementById('child-result').textContent =
            `Created! ID: ${res.ID}, Device: ${deviceRes}`;
        loadChildren();
    } catch (e) {
        document.getElementById('child-result').textContent = e.data?.errDesc || 'Failed';
    }
});

// Load children
async function loadChildren() {
    try {
        const list = await api.getChildrenByParent(parentEmail);
        const ul = document.getElementById('children-list');
        ul.innerHTML = '';
        list.forEach(u => {
            const li = document.createElement('li');
            li.textContent = `${u.nick} (${u.id.substring(0, 8)}...) `;
            const btnEdit = document.createElement('button');
            btnEdit.textContent = 'Edit';
            btnEdit.onclick = async () => {
                const newNick = prompt('New nickname:', u.nick);
                if (newNick && newNick.trim()) {
                    await api.editChildNick(u.id, newNick.trim());
                    loadChildren();
                }
            };
            const btnDelete = document.createElement('button');
            btnDelete.textContent = 'Delete';
            btnDelete.style.marginLeft = '5px';
            btnDelete.onclick = async () => {
                if (confirm(`Delete ${u.nick}? This cannot be undone.`)) {
                    await api.deleteChild(u.id);
                    loadChildren();
                }
            };
            li.appendChild(btnEdit);
            li.appendChild(btnDelete);
            ul.appendChild(li);
        });
    } catch (e) {
        // No children yet
    }
}

// Request connection
document.getElementById('btn-request-conn').addEventListener('click', async () => {
    try {
        const from = document.getElementById('conn-from').value;
        const to = document.getElementById('conn-to').value;
        await api.requestConnection(from, to);
        document.getElementById('conn-result').textContent = 'Connection requested!';
    } catch (e) {
        document.getElementById('conn-result').textContent = e.data?.errDesc || e.data || 'Failed';
    }
});

// Refresh approvals
document.getElementById('btn-refresh-approvals').addEventListener('click', loadApprovals);

// Refresh sent requests
document.getElementById('btn-refresh-sent').addEventListener('click', loadSentRequests);

async function loadSentRequests() {
    try {
        const list = await api.getSentRequests(parentEmail);
        const ul = document.getElementById('sent-list');
        ul.innerHTML = '';
        if (!list || list.length === 0) {
            ul.innerHTML = '<li>No sent requests</li>';
            return;
        }
        const statusNames = ['Accepted', 'Requested', 'Rejected'];
        list.forEach(r => {
            const li = document.createElement('li');
            li.textContent = `${r.from.substring(0, 8)}... → ${r.to.substring(0, 8)}... [${statusNames[r.status]}]`;
            ul.appendChild(li);
        });
    } catch (e) {
        document.getElementById('sent-list').innerHTML = '<li>No sent requests</li>';
    }
}

async function loadApprovals() {
    try {
        const list = await api.getApprovalList(parentEmail);
        const ul = document.getElementById('approval-list');
        ul.innerHTML = '';
        if (!list || list.length === 0) {
            ul.innerHTML = '<li>No pending requests</li>';
            return;
        }
        list.forEach(conn => {
            const li = document.createElement('li');
            li.textContent = `${conn.from} → ${conn.to} `;
            const btnApprove = document.createElement('button');
            btnApprove.textContent = 'Approve';
            btnApprove.onclick = async () => {
                await api.approveConnection(conn.id, 0); // ACCEPTED
                loadApprovals();
            };
            const btnReject = document.createElement('button');
            btnReject.textContent = 'Reject';
            btnReject.style.marginLeft = '5px';
            btnReject.onclick = async () => {
                await api.approveConnection(conn.id, 2); // REJECTED
                loadApprovals();
            };
            li.appendChild(btnApprove);
            li.appendChild(btnReject);
            ul.appendChild(li);
        });
    } catch (e) {
        document.getElementById('approval-list').innerHTML = '<li>No pending requests</li>';
    }
}

// Send message
document.getElementById('btn-send').addEventListener('click', async () => {
    try {
        const to = document.getElementById('msg-to').value;
        const body = document.getElementById('msg-body').value;
        const result = await api.sendMessage(to, body);
        document.getElementById('msg-body').value = '';
        // Save sent message locally
        saveLocalMessage({ id: Date.now().toString(), serverMsgId: result.messageID, from: 'me', to, body, createdAt: new Date().toISOString() });
        renderLocalMessages();
    } catch (e) {
        alert(e.data?.msg || 'Send failed');
    }
});

// Refresh inbox (download + ACK)
document.getElementById('btn-refresh').addEventListener('click', async () => {
    try {
        const list = await api.getMessageList(0); // UNREAD
        const inbox = document.getElementById('inbox');
        inbox.innerHTML = '';
        for (const item of list) {
            const msg = await api.getMessage(item.msgID);
            saveLocalMessage(msg);
            await api.deleteMessage(item.msgID); // ACK
            const li = document.createElement('li');
            li.textContent = `From: ${msg.from} - ${msg.body} [downloaded & ACKed]`;
            inbox.appendChild(li);
        }
        renderLocalMessages();
    } catch (e) {
        if (e.status === 404) {
            document.getElementById('inbox').innerHTML = '<li>No new messages</li>';
        }
    }
});

// Logout
document.getElementById('btn-parent-logout').addEventListener('click', () => {
    api.clearToken();
    showView('login');
});
document.getElementById('btn-user-logout').addEventListener('click', () => {
    api.clearToken();
    showView('login');
});
