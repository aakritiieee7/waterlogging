let reports = [];
let activeReportId = null;
let detailMap = null;
let currentUser = JSON.parse(localStorage.getItem('user'));
let token = localStorage.getItem('token');

document.addEventListener('DOMContentLoaded', () => {
    loadReports();
    setupChatbot();
});

async function loadReports() {
    const res = await fetch('/api/reports');
    reports = await res.json();
    const list = document.getElementById('public-reports-list');

    if (reports.length === 0) {
        list.innerHTML = '<p>No reports found.</p>';
        return;
    }

    list.innerHTML = reports.map(r => `
        <div class="card" style="cursor:pointer; border-left: 5px solid ${getSeverityColor(r.severity)};" onclick="showReportDetails(${r.id})">
            <div style="display:flex; justify-content:space-between;">
                <strong>${r.title}</strong>
                <span style="font-size:0.8rem; background:#eee; padding:2px 5px; border-radius:3px;">${r.status}</span>
            </div>
            <p style="font-size:0.85rem; color:#666; margin:5px 0;">${r.description.substring(0, 60)}...</p>
            <div style="font-size:0.75rem; display:flex; justify-content:space-between; color:#888;">
                <span>📍 ${r.authority_name}</span>
                <span>🕒 ${new Date(r.created_at).toLocaleDateString()}</span>
            </div>
        </div>
    `).join('');
}

function getSeverityColor(sev) {
    switch (sev) {
        case 'Critical': return '#d9534f';
        case 'High': return '#f0ad4e';
        case 'Medium': return '#5bc0de';
        default: return '#5cb85c';
    }
}

async function showReportDetails(id) {
    const r = reports.find(x => x.id === id);
    activeReportId = id;

    document.getElementById('detail-placeholder').style.display = 'none';
    document.getElementById('active-report-details').style.display = 'block';

    document.getElementById('detail-title').textContent = r.title;
    document.getElementById('detail-desc').textContent = r.description;
    document.getElementById('detail-severity').textContent = r.severity;
    document.getElementById('detail-status').textContent = r.status;
    document.getElementById('detail-authority').textContent = r.authority_name;

    // Lazy init map
    if (detailMap) detailMap.remove();
    detailMap = L.map('detail-map').setView([r.lat, r.lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(detailMap);
    L.marker([r.lat, r.lng]).addTo(detailMap);

    const imgContainer = document.getElementById('detail-image-container');
    imgContainer.innerHTML = r.image_url ? `<img src="${r.image_url}" style="width:100%; border-radius:4px; margin-top:10px;">` : '';

    // Resolution Info
    const resBox = document.getElementById('resolution-info');
    if (r.status === 'Resolved') {
        resBox.style.display = 'block';
        document.getElementById('resolution-note').textContent = r.resolution_note || 'No note provided.';
        document.getElementById('resolution-proof-img').innerHTML = r.resolution_proof_image ?
            `<img src="${r.resolution_proof_image}" style="width:100%; border-radius:4px; margin-top:10px;">` : '';
    } else {
        resBox.style.display = 'none';
    }

    loadUpvotes(id);
    loadComments(id);
}

async function loadUpvotes(reportId) {
    const res = await fetch(`/api/reports/${reportId}/upvotes`);
    const data = await res.json();
    document.getElementById('upvote-count').textContent = data.count;
}

document.getElementById('upvote-btn').onclick = async () => {
    if (!token) return alert("Please login to upvote");
    await fetch(`/api/reports/${activeReportId}/upvote`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    loadUpvotes(activeReportId);
};

async function loadComments(reportId) {
    const res = await fetch(`/api/reports/${reportId}/comments`);
    const comments = await res.json();
    const list = document.getElementById('comments-list');
    list.innerHTML = comments.length > 0 ? comments.map(c => `
        <div style="background:white; border: 1px solid #eee; padding:8px; margin-bottom:8px; border-radius:4px; font-size:0.85rem;">
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <strong>${c.full_name}</strong>
                <span style="font-size:0.7rem; color:#999;">${new Date(c.created_at).toLocaleString()}</span>
            </div>
            ${c.comment_text}
        </div>
    `).join('') : '<p style="color:#999; text-align:center;">No comments yet.</p>';
}

async function submitComment() {
    const text = document.getElementById('new-comment').value;
    if (!token) return alert("Please login to participate in the discussion.");
    if (!text) return alert("Type a comment first!");

    const res = await fetch(`/api/reports/${activeReportId}/comments`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ text })
    });

    if (res.ok) {
        document.getElementById('new-comment').value = '';
        loadComments(activeReportId);
    }
}

// Global Chatbot toggle/logic (simplified copy)
function toggleChat() {
    const win = document.getElementById('chatbot-window');
    win.style.display = win.style.display === 'flex' ? 'none' : 'flex';
}
document.getElementById('chatbot-toggle').onclick = toggleChat;

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value;
    if (!msg) return;
    const messagesDiv = document.getElementById('chat-messages');
    messagesDiv.innerHTML += `<div class="message user-message">${msg}</div>`;
    input.value = '';
    const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history: [] })
    });
    const data = await res.json();
    if (data.error) {
        messagesDiv.innerHTML += `<div class="message ai-message" style="color: #721c24; background-color: #f8d7da; border-color: #f5c6cb;">System: ${data.error}. Please try again later.</div>`;
    } else {
        messagesDiv.innerHTML += `<div class="message ai-message">${data.reply}</div>`;
    }
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function setupChatbot() {
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}
