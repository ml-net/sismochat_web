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

function saveChildCredentials(userId, deviceId, keys, nick) {
    const children = JSON.parse(localStorage.getItem('childCredentials') || '{}');
    children[userId] = { deviceId, keys, nick };
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
    getLocalMessages().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).forEach(msg => {
        const li = document.createElement('li');
        const date = msg.createdAt ? new Date(msg.createdAt).toLocaleString() : '';
        let content;
        if (msg.type === 'sticker') {
            const sticker = (window._stickersCache || []).find(s => s.id === msg.body);
            content = sticker ? sticker.emoji : '❓';
            li.innerHTML = `[${date}] From: ${msg.from} → To: ${msg.to} - <span style="font-size:4em">${content}</span>`;
        } else if (msg.type === 'audio') {
            li.innerHTML = `[${date}] From: ${msg.from} → To: ${msg.to} - `;
            const audio = document.createElement('audio');
            audio.controls = true;
            audio.src = 'data:audio/webm;base64,' + msg.body;
            if (!audio.canPlayType('audio/webm')) {
                audio.src = 'data:audio/mp4;base64,' + msg.body;
            }
            li.appendChild(audio);
        } else {
            li.textContent = `[${date}] From: ${msg.from} → To: ${msg.to} - ${msg.body}`;
        }
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
        const res = await api.registerParent(email, pwd);
        // Save virtual user credentials for parent-to-child messaging
        if (res.virtualUser) {
            saveChildCredentials(res.virtualUser.id, res.virtualUser.deviceId, res.virtualUser.keys);
            localStorage.setItem('virtualUserId', res.virtualUser.id);
        }
        document.getElementById('login-error').textContent = 'Registered! Now login.';
    } catch (e) {
        const details = e.data?.details?.map(d => d.msg).join(', ') || '';
        document.getElementById('login-error').textContent = details || e.data?.errDesc || 'Registration failed';
    }
});

// Password reset flow
document.getElementById('btn-forgot-pwd').addEventListener('click', () => {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById('reset-request').classList.add('active');
    document.getElementById('reset-email').value = document.getElementById('parent-email').value || '';
});

document.getElementById('btn-send-reset').addEventListener('click', async () => {
    const email = document.getElementById('reset-email').value;
    const result = document.getElementById('reset-request-result');
    try {
        const res = await api.resetRequest(email);
        result.textContent = res.msg + ' — ' + (res.note || '');
        result.style.color = 'green';
        document.getElementById('reset-confirm-email').value = email;
        document.getElementById('reset-confirm-result').textContent = '';
        setTimeout(() => {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.getElementById('reset-confirm').classList.add('active');
        }, 2000);
    } catch (e) {
        result.textContent = e.data?.errDesc || 'Error';
        result.style.color = 'red';
    }
});

document.getElementById('btn-confirm-reset').addEventListener('click', async () => {
    const email = document.getElementById('reset-confirm-email').value;
    const otp = document.getElementById('reset-otp').value;
    const newPassword = document.getElementById('reset-new-pwd').value;
    const result = document.getElementById('reset-confirm-result');
    try {
        await api.resetPassword(email, otp, newPassword);
        result.textContent = 'Password reset successful! You can now login.';
        result.style.color = 'green';
        setTimeout(() => {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.getElementById('parent-login').classList.add('active');
            document.getElementById('parent-email').value = email;
        }, 2000);
    } catch (e) {
        const msg = e.data?.errDesc || 'Error';
        result.textContent = msg;
        result.style.color = 'red';
        if (msg.includes('request a new code') || msg.includes('Invalid or expired')) {
            setTimeout(() => {
                document.getElementById('reset-otp').value = '';
                document.getElementById('reset-new-pwd').value = '';
                document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
                document.getElementById('reset-request').classList.add('active');
                document.getElementById('reset-request-result').textContent = 'Code invalidated. Request a new one.';
                document.getElementById('reset-request-result').style.color = 'red';
            }, 2000);
        }
    }
});

// Populate user selector from saved credentials
function populateUserSelect() {
    const select = document.getElementById('user-select');
    select.innerHTML = '<option value="">Select a child user...</option>';
    const creds = getChildCredentials();
    const virtualUserId = localStorage.getItem('virtualUserId');
    Object.keys(creds).forEach(userId => {
        const opt = document.createElement('option');
        opt.value = userId;
        opt.textContent = userId === virtualUserId ? '👤 Parent (virtual user)' : (creds[userId].nick || userId.substring(0, 8) + '...');
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
        await loadAssets();
        renderLocalMessages();
        connectWebSocket(res.token);
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
        saveChildCredentials(res.ID, deviceRes, res.keys, nick);
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
            const idSpan = document.createElement('span');
            idSpan.textContent = `${u.nick} (${u.id.substring(0, 8)}...)`;
            idSpan.title = u.id;
            idSpan.style.cursor = 'pointer';
            idSpan.onclick = () => { 
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(u.id); 
                    idSpan.textContent = `${u.nick} (copied!)`;
                } else {
                    prompt('Copy this UUID:', u.id);
                }
                setTimeout(() => { idSpan.textContent = `${u.nick} (${u.id.substring(0, 8)}...)`; }, 1000); 
            };
            li.appendChild(idSpan);
            li.appendChild(document.createTextNode(' '));
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
                    const creds = JSON.parse(localStorage.getItem('childCredentials') || '{}');
                    delete creds[u.id];
                    localStorage.setItem('childCredentials', JSON.stringify(creds));
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

// Discover parent
document.getElementById('btn-discover').addEventListener('click', async () => {
    const email = document.getElementById('discover-email').value;
    const result = document.getElementById('discover-result');
    const childrenList = document.getElementById('discover-children');
    childrenList.innerHTML = '';
    try {
        await api.findParent(email);
        const children = await api.getChildrenByParent(email);
        result.textContent = `Found! ${children.length} child(ren):`;
        children.forEach(c => {
            const li = document.createElement('li');
            li.textContent = `${c.nick} (${c.id.substring(0, 8)}...)`;
            li.style.cursor = 'pointer';
            li.title = 'Click to copy UUID';
            li.onclick = () => {
                document.getElementById('conn-to').value = c.id;
                result.textContent = `Selected ${c.nick} as connection target`;
            };
            childrenList.appendChild(li);
        });
    } catch (e) {
        result.textContent = e.status === 404 ? 'Parent not found' : (e.data?.errDesc || 'Error');
    }
});

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
        const list = await api.getSentRequests();
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
        const list = await api.getApprovalList();
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

// Load contacts
document.getElementById('btn-load-contacts').addEventListener('click', async () => {
    try {
        const list = await api.getConnections();
        const ul = document.getElementById('contacts-list');
        ul.innerHTML = '';
        if (!list || list.length === 0) {
            ul.innerHTML = '<li>No contacts</li>';
            return;
        }
        for (const contact of list) {
            const li = document.createElement('li');
            const id = contact.id || contact;
            const nick = contact.nick || id.substring(0, 8) + '...';
            const span = document.createElement('span');
            span.textContent = nick;
            span.title = id;
            span.style.cursor = 'pointer';
            span.onclick = () => {
                document.getElementById('msg-to').value = id;
                span.textContent = 'selected!';
                setTimeout(() => { span.textContent = nick; }, 1000);
            };
            li.appendChild(span);
            ul.appendChild(li);
        }
    } catch (e) {
        document.getElementById('contacts-list').innerHTML = '<li>No contacts</li>';
    }
});

// Emoji picker
function populateEmojiPicker(emojis) {
    const picker = document.getElementById('emoji-picker');
    picker.innerHTML = '';
    emojis.forEach(e => {
        const span = document.createElement('span');
        span.textContent = e;
        span.addEventListener('click', () => {
            const input = document.getElementById('msg-body');
            input.value += e;
            input.focus();
        });
        picker.appendChild(span);
    });
}

async function loadAssets() {
    try {
        const emojis = await api.request('GET', '/api/v1/assets/emojis');
        populateEmojiPicker(emojis);
        const stickers = await api.request('GET', '/api/v1/assets/stickers');
        window._stickersCache = stickers;
        populateStickerPicker(stickers);
    } catch (e) {
        // Fallback: empty pickers
    }
}

function populateStickerPicker(stickers) {
    const picker = document.getElementById('sticker-picker');
    picker.innerHTML = '';
    stickers.forEach(s => {
        const span = document.createElement('span');
        span.textContent = s.emoji;
        span.title = s.label;
        span.addEventListener('click', async () => {
            const to = document.getElementById('msg-to').value;
            if (!to) { alert('Select a recipient first'); return; }
            try {
                const result = await api.request('POST', '/api/v1/message/', { to, message: s.id, type: 'sticker' });
                saveLocalMessage({ id: Date.now().toString(), serverMsgId: result.messageID, from: 'me', to, body: s.id, type: 'sticker', createdAt: new Date().toISOString() });
                renderLocalMessages();
                picker.classList.add('hidden');
            } catch (e) { alert(e.data?.msg || 'Send failed'); }
        });
        picker.appendChild(span);
    });
}

document.getElementById('btn-emoji').addEventListener('click', () => {
    document.getElementById('emoji-picker').classList.toggle('hidden');
    document.getElementById('sticker-picker').classList.add('hidden');
});

document.getElementById('btn-sticker').addEventListener('click', () => {
    document.getElementById('sticker-picker').classList.toggle('hidden');
    document.getElementById('emoji-picker').classList.add('hidden');
});

// PTT audio recording
(() => {
    const MAX_DURATION = 20;
    let mediaRecorder = null;
    let chunks = [];
    let timer = null;
    let seconds = 0;
    const btn = document.getElementById('btn-ptt');
    const status = document.getElementById('ptt-status');

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
        clearInterval(timer);
        btn.classList.remove('recording');
        btn.textContent = '🎙️';
        status.classList.add('hidden');
    }

    async function sendAudio(blob) {
        const to = document.getElementById('msg-to').value;
        if (!to) { alert('Select a recipient first'); return; }
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = reader.result.split(',')[1];
            try {
                const result = await api.request('POST', '/api/v1/message/', { to, message: base64, type: 'audio' });
                saveLocalMessage({ id: Date.now().toString(), serverMsgId: result.messageID, from: 'me', to, body: base64, type: 'audio', createdAt: new Date().toISOString() });
                renderLocalMessages();
            } catch (e) { alert(e.data?.msg || 'Send failed'); }
        };
        reader.readAsDataURL(blob);
    }

    btn.addEventListener('click', async () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            stopRecording();
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            chunks = [];
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/mp4';
            mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
            mediaRecorder.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                if (chunks.length > 0) {
                    sendAudio(new Blob(chunks, { type: mimeType }));
                }
            };
            mediaRecorder.start();
            seconds = 0;
            btn.classList.add('recording');
            btn.textContent = '⏹️';
            status.classList.remove('hidden');
            status.textContent = `Recording... ${MAX_DURATION}s`;
            timer = setInterval(() => {
                seconds++;
                status.textContent = `Recording... ${MAX_DURATION - seconds}s`;
                if (seconds >= MAX_DURATION) stopRecording();
            }, 1000);
        } catch (e) {
            alert('Microphone access denied');
        }
    });
})();

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
        const list = await api.getMessageList(0, 2); // UNREAD, limit=2 for testing
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
// Change password
document.getElementById('btn-change-pwd').addEventListener('click', async () => {
    try {
        const oldPwd = document.getElementById('old-pwd').value;
        const newPwd = document.getElementById('new-pwd').value;
        await api.changePassword(oldPwd, newPwd);
        document.getElementById('pwd-result').textContent = 'Password changed!';
        document.getElementById('old-pwd').value = '';
        document.getElementById('new-pwd').value = '';
    } catch (e) {
        const msg = e.data?.details?.map(d => d.msg).join(', ') || e.data?.errDesc || 'Failed';
        document.getElementById('pwd-result').textContent = msg;
    }
});

document.getElementById('btn-parent-logout').addEventListener('click', () => {
    api.clearToken();
    showView('login');
});
document.getElementById('btn-user-logout').addEventListener('click', () => {
    api.clearToken();
    showView('login');
});

// WebSocket connection
let ws = null;
function connectWebSocket(token) {
    const wsBase = (localStorage.getItem('apiBase') || 'http://localhost:3000').replace('http', 'ws');
    ws = new WebSocket(wsBase + '/ws?token=' + token);

    ws.onopen = () => {
        console.log('WS connected');
        const nickEl = document.getElementById('chat-nick');
        if (!nickEl.textContent.includes('🟢')) nickEl.textContent += ' 🟢';
    };

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log('WS notification:', data);
        if (data.type === 'new_message') {
            // Auto-fetch new messages
            try {
                const list = await api.getMessageList(0, 10);
                const inbox = document.getElementById('inbox');
                for (const item of list) {
                    const msg = await api.getMessage(item.msgID);
                    saveLocalMessage(msg);
                    await api.deleteMessage(item.msgID);
                    const li = document.createElement('li');
                    li.textContent = `From: ${msg.from.substring(0,8)}... - ${msg.body} [live]`;
                    inbox.appendChild(li);
                }
                renderLocalMessages();
            } catch (e) { /* no messages */ }
        }
    };

    ws.onclose = () => {
        console.log('WS disconnected, reconnecting in 3s...');
        setTimeout(() => {
            const t = api.getToken();
            if (t) connectWebSocket(t);
        }, 3000);
    };
}
