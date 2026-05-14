// State
let currentProfile = null; // 'Parent' or 'User'
let parentEmail = null;

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
        li.textContent = `From: ${msg.from} - ${msg.body}`;
        list.appendChild(li);
    });
}

// Tabs
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
    });
});

// Parent login
document.getElementById('btn-parent-login').addEventListener('click', async () => {
    try {
        const email = document.getElementById('parent-email').value;
        const pwd = document.getElementById('parent-pwd').value;
        const res = await api.loginParent(email, pwd);
        api.setToken(res.token);
        parentEmail = email;
        currentProfile = 'Parent';
        document.getElementById('parent-email-display').textContent = email;
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
        document.getElementById('login-error').textContent = e.data?.errDesc || 'Registration failed';
    }
});

// User login
document.getElementById('btn-user-login').addEventListener('click', async () => {
    try {
        const token = document.getElementById('user-token').value;
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
        document.getElementById('child-result').textContent =
            `Created! ID: ${res.ID}, Device: ${deviceRes}, Keys generated.`;
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
            li.textContent = `${u.nick} (${u.id})`;
            ul.appendChild(li);
        });
    } catch (e) {
        // No children yet
    }
}

// Send message
document.getElementById('btn-send').addEventListener('click', async () => {
    try {
        const to = document.getElementById('msg-to').value;
        const body = document.getElementById('msg-body').value;
        await api.sendMessage(to, body);
        document.getElementById('msg-body').value = '';
        // Save sent message locally
        saveLocalMessage({ id: Date.now().toString(), from: 'me', to, body });
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
