let currentUser = JSON.parse(localStorage.getItem('user'));
let token = localStorage.getItem('token');

if (!currentUser || currentUser.role !== 'authority') {
    window.location.href = 'login.html';
}

document.addEventListener('DOMContentLoaded', () => {
    loadAuthorities();
    loadReports();
});

async function loadAuthorities() {
    const res = await fetch('/api/authorities');
    const authorities = await res.json();
    const select = document.getElementById('filter-authority');
    authorities.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.name;
        select.appendChild(opt);
    });
}

async function loadReports() {
    const authorityId = document.getElementById('filter-authority').value;
    const status = document.getElementById('filter-status').value;

    let url = '/api/reports?';
    if (authorityId) url += `authority_id=${authorityId}&`;
    if (status) url += `status=${status}&`;

    const res = await fetch(url);
    const reports = await res.json();

    const tbody = document.getElementById('reports-tbody');
    tbody.innerHTML = reports.map(r => `
        <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 10px;">#${r.id}</td>
            <td style="padding: 10px;">
                <strong>${r.title}</strong><br>
                <small>${r.reporter_name} - ${new Date(r.created_at).toLocaleString()}</small>
            </td>
            <td style="padding: 10px;">
                <span style="color: ${r.severity === 'Critical' ? 'red' : r.severity === 'High' ? 'orange' : 'black'}; font-weight: bold;">
                    ${r.severity}
                </span>
            </td>
            <td style="padding: 10px;">${r.authority_name}</td>
            <td style="padding: 10px;">${r.status}</td>
            <td style="padding: 10px;">
                ${r.status !== 'Resolved' ? `<button onclick="openResolveModal(${r.id})" class="btn btn-success btn-sm">Resolve</button>` : 'COMPLETED'}
            </td>
        </tr>
    `).join('');
}

function openResolveModal(id) {
    document.getElementById('resolve-report-id').value = id;
    document.getElementById('resolve-modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('resolve-modal').style.display = 'none';
}

function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

document.getElementById('resolve-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('resolve-report-id').value;
    const note = document.getElementById('resolve-note').value;
    const proofImage = document.getElementById('resolve-proof-image').files[0];

    const formData = new FormData();
    formData.append('note', note);
    formData.append('proof_image', proofImage);

    const res = await fetch(`/api/reports/${id}/resolve`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
    });

    if (res.ok) {
        alert("Report marked as Resolved successfully.");
        closeModal();
        loadReports();
    } else {
        alert("Failed to resolve report.");
    }
};
