
/* Navigation Logic with Autocomplete & Risk Detection */

// State
let startCoords = null;
let endCoords = null;
let routeLine = null;
let hotspotLayer = L.layerGroup();
let map;

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Map
    map = L.map('navigation-map').setView([28.6139, 77.2090], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    hotspotLayer.addTo(map);

    // Initial Geolocation for Start (optional)
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            const { latitude, longitude } = pos.coords;
            // Reverse geocode to fill start input? 
            // For now, just center map
            map.setView([latitude, longitude], 13);
        });
    }

    // Setup Autocomplete
    setupAutocomplete('start-input', 'start-suggestions', (coords) => startCoords = coords);
    setupAutocomplete('destination', 'dest-suggestions', (coords) => endCoords = coords);

    // Lucide
    lucide.createIcons();
    // Fetch Verified Hotspots on Load
    loadHistoricalHotspots();
});

let allHotspots = [];

async function loadHistoricalHotspots() {
    try {
        const res = await fetch('/api/hotspots');
        const data = await res.json();
        allHotspots = Array.isArray(data) ? data : (data.data || []);

        // Draw ALL verified hotspots permanently on the map
        allHotspots.forEach(spot => {
            const radius = spot.radius || 300;
            L.circle([spot.lat, spot.lng], {
                color: '#9333ea', // Purple verified
                dashArray: '5, 5',
                fillColor: '#9333ea',
                fillOpacity: 0.15, // Light fill for all
                radius: radius
            }).addTo(hotspotLayer).bindPopup(`<b>${spot.name}</b><br>Verified Risk Zone`);
        });

    } catch (err) {
        console.error("Failed to load initial hotspots:", err);
    }
}

// Autocomplete using Nominatim (OpenStreetMap)
function setupAutocomplete(inputId, listId, callback) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    let debounceTimer;

    input.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value;

        if (query.length < 3) {
            list.style.display = 'none';
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                // Bounds for Delhi roughly (optional bias) -> viewbox=76.8,28.4,77.3,28.9&bounded=1
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
                const data = await res.json();

                list.innerHTML = '';
                if (data.length > 0) {
                    list.style.display = 'block';
                    data.forEach(item => {
                        const li = document.createElement('li');
                        li.textContent = item.display_name;
                        li.style.padding = '8px';
                        li.style.cursor = 'pointer';
                        li.style.borderBottom = '1px solid #eee';

                        li.addEventListener('click', () => {
                            input.value = item.display_name;
                            list.style.display = 'none';
                            const coords = [parseFloat(item.lat), parseFloat(item.lon)];
                            callback(coords);

                            // Add marker
                            L.marker(coords).addTo(map).bindPopup(inputId === 'start-input' ? "Start" : "Destination").openPopup();
                            map.setView(coords, 14);
                        });

                        list.appendChild(li);
                    });
                } else {
                    list.style.display = 'none';
                }
            } catch (err) {
                console.error("Autocomplete error:", err);
            }
        }, 300);
    });

    // Close list on outside click
    document.addEventListener('click', (e) => {
        if (e.target !== input && e.target !== list) {
            list.style.display = 'none';
        }
    });
}

// Find Route & Check Risks
async function analyzeRoute() {
    if (!startCoords || !endCoords) {
        alert("Please select both a Start point and a Destination from the suggestions.");
        return;
    }

    // Clear previous line only (keep hotspots)
    if (routeLine) map.removeLayer(routeLine);

    // Draw Line (Straight for now, as requested "line joining the places")
    // Note: User asked for "line joining the places", straight line is safest interpretation without 3rd party routing key.
    routeLine = L.polyline([startCoords, endCoords], { color: 'blue', weight: 4, opacity: 0.7 }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });

    // Check Collisions against loaded hotspots
    try {
        const collisions = [];

        allHotspots.forEach(spot => {
            const spotLatLng = L.latLng(spot.lat, spot.lng);
            // Distance from point to line segment
            const dist = distanceFromLineSegment(spotLatLng, L.latLng(startCoords), L.latLng(endCoords)); // in meters
            const radius = spot.radius || 300;

            if (dist < radius) {
                collisions.push(spot);
                // Highlight colliding spots? 
                // We keep the purple circle, maybe add a Red Border? 
                // For now, modal is enough. Users see the line crossing the purple circle.
            }
        });

        if (collisions.length > 0) {
            document.getElementById('risk-msg').innerHTML = `
                Found <b>${collisions.length} verified risk zones</b> on this route!<br>
                Major Risks: ${collisions.slice(0, 3).map(c => c.name).join(', ')}
            `;
            document.getElementById('risk-modal-overlay').style.display = 'flex';
        } else {
            // Show Success
            const popup = L.popup()
                .setLatLng(map.getCenter())
                .setContent("✅ Route is SAFE from known historical hotspots!")
                .openOn(map);
        }

        // Show Google Maps Link
        const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${startCoords[0]},${startCoords[1]}&destination=${endCoords[0]},${endCoords[1]}&travelmode=driving`;
        const linkBtn = document.getElementById('gmaps-link');
        linkBtn.href = gmapsUrl;
        linkBtn.style.display = 'flex';
        // Re-render icons if needed by Lucide
        if (window.lucide) lucide.createIcons();

    } catch (err) {
        console.error("Risk check failed:", err);
        // User-friendly error message
        const msg = err.message || "Unknown error";
        alert(`Navigation System Error: ${msg}. Proceed with caution.`);
    }
}

// Helper: Distance (meters) from Point P to Segment AB
function distanceFromLineSegment(p, a, b) {
    // Fixed: Removed redundant map initialization which caused "Map already initialized" error

    // Leaflet's distanceTo is huge circle distance.
    // Let's use simple geometric projection for "approx" meters.
    // 1 deg lat ~ 111km.

    // Convert to simple x/y (Mercatorish approximation locally is fine for detection)
    const x = p.lat, y = p.lng;
    const x1 = a.lat, y1 = a.lng;
    const x2 = b.lat, y2 = b.lng;

    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const len_sq = C * C + D * D;
    let param = -1;
    if (len_sq !== 0) param = dot / len_sq;

    let xx, yy;

    if (param < 0) {
        xx = x1; yy = y1;
    } else if (param > 1) {
        xx = x2; yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    const dx = x - xx;
    const dy = y - yy;

    // Convert degrees diff to meters
    const distDeg = Math.sqrt(dx * dx + dy * dy);
    return distDeg * 111000; // approx meters
}

function closeRiskModal() {
    document.getElementById('risk-modal-overlay').style.display = 'none';
}
