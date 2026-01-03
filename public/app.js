let map, userMarker, infoWindow;
let reports = [];
let hotspots = [];
let activeReportId = null;
let currentUser = JSON.parse(localStorage.getItem('user'));
let token = localStorage.getItem('token');

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadHotspots();
    loadReports();
    loadAuthorities();
    setupAuthUI();
    setupChatbot();

    if (currentUser && currentUser.role === 'citizen') {
        document.getElementById('report-form-container').style.display = 'block';
        document.getElementById('welcome-card').style.display = 'none';
        getLocation();
    }
});

function setupAuthUI() {
    const authLink = document.getElementById('auth-link');
    if (currentUser) {
        authLink.innerHTML = `<a href="#" onclick="logout()">Logout (${currentUser.username})</a>`;
        if (currentUser.role === 'authority') {
            document.getElementById('nav-links').innerHTML += `<li><a href="authority.html">Dashboard</a></li>`;
        }
    }
}

function logout() {
    localStorage.clear();
    location.reload();
}

function initMap() {
    // Center of Delhi
    map = L.map('map').setView([28.6139, 77.2090], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    map.on('click', (e) => {
        if (currentUser && currentUser.role === 'citizen') {
            updateLocationFields(e.latlng.lat, e.latlng.lng);
        }
    });
}

function getLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            updateLocationFields(position.coords.latitude, position.coords.longitude);
            map.setView([position.coords.latitude, position.coords.longitude], 13);
        });
    }
}

function updateLocationFields(lat, lng) {
    document.getElementById('report-lat').value = lat.toFixed(6);
    document.getElementById('report-lng').value = lng.toFixed(6);

    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([lat, lng], { draggable: true }).addTo(map)
        .bindPopup("Your Location (Drag to refine)").openPopup();

    userMarker.on('dragend', function (event) {
        var marker = event.target;
        var position = marker.getLatLng();
        document.getElementById('report-lat').value = position.lat.toFixed(6);
        document.getElementById('report-lng').value = position.lng.toFixed(6);
    });
}

async function loadHotspots() {
    const res = await fetch('/api/hotspots');
    hotspots = await res.json();
    hotspots.forEach(h => {
        L.circle([h.lat, h.lng], {
            color: 'red',
            fillColor: '#f03',
            fillOpacity: 0.5,
            radius: 500
        }).addTo(map).bindPopup(`<strong>Hotspot: ${h.name}</strong><br>${h.description}<br>Severity: ${h.severity}`);
    });
}

async function loadReports() {
    const res = await fetch('/api/reports');
    reports = await res.json();
    reports.forEach(r => {
        const marker = L.marker([r.lat, r.lng]).addTo(map);
        marker.on('click', () => showReportDetails(r));
    });
}

async function loadAuthorities() {
    const res = await fetch('/api/authorities');
    const authorities = await res.json();
    const select = document.getElementById('report-authority');
    authorities.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.name;
        select.appendChild(opt);
    });
}

function showReportDetails(r) {
    activeReportId = r.id;
    document.getElementById('active-report-details').style.display = 'block';
    document.getElementById('welcome-card').style.display = 'none';
    document.getElementById('report-form-container').style.display = 'none';

    document.getElementById('detail-title').textContent = r.title;
    document.getElementById('detail-desc').textContent = r.description;
    document.getElementById('detail-severity').textContent = r.severity;
    document.getElementById('detail-status').textContent = r.status;
    document.getElementById('detail-authority').textContent = r.authority_name;

    const imgContainer = document.getElementById('detail-image-container');
    imgContainer.innerHTML = r.image_url ? `<img src="${r.image_url}" style="width:100%; margin-top:10px; border-radius:4px;">` : '';

    loadUpvotes(r.id);
    loadComments(r.id);
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
    list.innerHTML = comments.map(c => `
        <div style="background:#f8f9fa; padding:5px; margin-bottom:5px; border-radius:4px; font-size:0.85rem;">
            <strong>${c.full_name}:</strong> ${c.comment_text}
        </div>
    `).join('');
}

async function submitComment() {
    const text = document.getElementById('new-comment').value;
    if (!text || !token) return alert("Please login and type a comment");

    await fetch(`/api/reports/${activeReportId}/comments`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ text })
    });
    document.getElementById('new-comment').value = '';
    loadComments(activeReportId);
}

// AI Prediction helper
document.getElementById('btn-predict-ai').onclick = async () => {
    const desc = document.getElementById('report-desc').value;
    const lat = document.getElementById('report-lat').value;
    const lng = document.getElementById('report-lng').value;

    if (desc.length < 5) {
        return alert("Please enter a short description first.");
    }

    const btn = document.getElementById('btn-predict-ai');
    btn.textContent = 'Analyzing...';
    btn.disabled = true;

    document.getElementById('ai-prediction-box').style.display = 'block';
    document.getElementById('predicted-authority').textContent = 'Predicting...';

    try {
        const res = await fetch('/api/ai/predict-authority', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: desc, location: `${lat}, ${lng}` })
        });
        const data = await res.json();
        if (data.error) {
            document.getElementById('predicted-authority').textContent = "Service Unavailable";
            // Don't alert to avoid spamming user, just show in UI text
        } else {
            document.getElementById('predicted-authority').textContent = data.prediction;
            // Try to auto-select in the dropdown
            const select = document.getElementById('report-authority');
            for (let i = 0; i < select.options.length; i++) {
                const optText = select.options[i].text.toUpperCase();
                if (optText.includes(data.prediction.toUpperCase())) {
                    select.selectedIndex = i;
                    break;
                }
            }
        }
    } catch (e) {
        console.error(e);
        document.getElementById('predicted-authority').textContent = 'Failed to predict.';
    } finally {
        btn.textContent = '✨ Suggest Authority with AI';
        btn.disabled = false;
    }
};

// Report Submission
document.getElementById('report-form').onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('title', document.getElementById('report-title').value);
    formData.append('description', document.getElementById('report-desc').value);
    formData.append('severity', document.getElementById('report-severity').value);
    formData.append('lat', document.getElementById('report-lat').value);
    formData.append('lng', document.getElementById('report-lng').value);
    formData.append('assigned_authority_id', document.getElementById('report-authority').value);

    const imageFile = document.getElementById('report-image').files[0];
    if (imageFile) formData.append('image', imageFile);

    const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
    });

    if (res.ok) {
        alert("Report submitted successfully!");
        location.reload();
    } else {
        alert("Failed to submit report. Please try again.");
    }
};

function scrollToReport() {
    if (!currentUser) {
        window.location.href = 'login.html';
    } else {
        document.getElementById('report-form-container').scrollIntoView({ behavior: 'smooth' });
    }
}

// Chatbot Logic
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
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

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
