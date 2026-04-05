// ============ FIREBASE KONFIGURATION ============
const firebaseConfig = {
  apiKey: "AIzaSyCXJoRlLQloM9ODw23dGYpl5r3GWR5HZgA",
  authDomain: "swat-map-a8286.firebaseapp.com",
  projectId: "swat-map-a8286",
  storageBucket: "swat-map-a8286.firebasestorage.app",
  messagingSenderId: "381226507900",
  appId: "1:381226507900:web:cf2426af92f9d1c557b3f9"
};

// Firebase initialisieren
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ============ GLOBALE VARIABLEN ============
let map;
let markers = {};
let currentUser = null;
let isAdmin = false;
let pendingCoordinates = null;
let currentZoom = 12;
let markerGroup = null; // Für dynamische Marker-Gruppe

// Punkt-Typen mit Farben und Icons
const pointTypes = {
    'Sammler': { color: '#DAA520', icon: '🧺', name: 'Sammler', emoji: '🧺' },
    'Verarbeiter': { color: '#8B008B', icon: '⚙️', name: 'Verarbeiter', emoji: '⚙️' },
    'Hersteller': { color: '#FF8C00', icon: '🔨', name: 'Hersteller', emoji: '🔨' },
    'Anwesen': { color: '#45b7d1', icon: '🏰', name: 'Anwesen', emoji: '🏰' },
    'Wichtig': { color: '#DC143C', icon: '📍', name: 'Wichtig', emoji: '📍' },
    'Labor': { color: '#1B2838', icon: '🏪', name: 'Labor', emoji: '🏪' },
    'Velvet Echo': { color: '#1B2838', icon: '💊', name: 'Velvet Echo', emoji: '💊' }
};

// ============ KARTE MIT EIGENEM BILD INITIALISIEREN ============
function initMap() {
    // Bild-Dimensionen deiner map.jpg (passe diese Werte an dein Bild an!)
    const imageWidth = 1536;
    const imageHeight = 2304;
    
    const southWest = L.latLng(0, 0);
    const northEast = L.latLng(imageHeight, imageWidth);
    const bounds = L.latLngBounds(southWest, northEast);
    
    // Karte erstellen
    map = L.map('map', {
        maxBounds: bounds,
        maxBoundsViscosity: 1.0,
        crs: L.CRS.Simple,
        zoomControl: true
    }).setView([imageHeight / 2, imageWidth / 2], 1);
    
    // Dein eigenes Kartenbild
    L.imageOverlay('map.jpg', bounds, {
        attribution: 'GTA V Map'
    }).addTo(map);
    
    // Zoom-Event für dynamische Marker-Größe
    map.on('zoomend', function() {
        currentZoom = map.getZoom();
        updateAllMarkersSize();
    });
    
    console.log("Karte initialisiert! Zoom-Level:", currentZoom);
    
    // Doppelklick für Admin
    map.on('dblclick', async (e) => {
        if (isAdmin) {
            pendingCoordinates = e.latlng;
            showAddPointDialog();
        } else if (currentUser) {
            alert('Nur Admins können Punkte hinzufügen');
        } else {
            alert('Bitte als Admin einloggen');
        }
    });
    
    return bounds;
}

// ============ MARKER GRÖSSE BASIEREND AUF ZOOM-LEVEL ============
function getMarkerSize() {
    const zoom = map.getZoom();
    // Je höher der Zoom, desto größer der Marker
    if (zoom >= 5) return 48;  // Sehr nah: große Marker
    if (zoom >= 4) return 42;
    if (zoom >= 3) return 36;
    if (zoom >= 2) return 32;
    if (zoom >= 1) return 28;
    return 24;  // Ganz weit raus: kleine Marker
}

function getFontSize() {
    const zoom = map.getZoom();
    if (zoom >= 5) return 24;
    if (zoom >= 4) return 22;
    if (zoom >= 3) return 20;
    if (zoom >= 2) return 18;
    if (zoom >= 1) return 16;
    return 14;
}

function updateAllMarkersSize() {
    // Alle Marker neu erstellen mit neuer Größe
    Object.values(markers).forEach(marker => {
        const point = marker.pointData;
        if (point) {
            // Marker entfernen und neu hinzufügen
            marker.remove();
            addMarkerToMap(point);
        }
    });
}

// ============ MARKER MIT DYNAMISCHER GRÖSSE ============
function addMarkerToMap(point) {
    const typeInfo = pointTypes[point.type] || pointTypes['Sammler'];
    const markerSize = getMarkerSize();
    const fontSize = getFontSize();
    
    // Dynamischer Marker mit Hover-Effekt
    const customIcon = L.divIcon({
        html: `<div style="
            background: ${typeInfo.color};
            width: ${markerSize}px;
            height: ${markerSize}px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: ${fontSize}px;
            border: ${Math.max(2, markerSize / 12)}px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            cursor: pointer;
            transition: all 0.2s ease;
            font-weight: bold;
        " 
        onmouseover="this.style.transform='scale(1.15)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.5)'"
        onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.4)'"
        >${typeInfo.icon}</div>`,
        className: 'custom-marker',
        iconSize: [markerSize, markerSize],
        iconAnchor: [markerSize / 2, markerSize / 2],
        popupAnchor: [0, -markerSize / 2]
    });
    
    const marker = L.marker([point.lat, point.lng], { icon: customIcon }).addTo(map);
    
    // Popup mit dynamischer Größe erstellen
    const popupContent = createPopupContent(point, typeInfo);
    marker.bindPopup(popupContent, {
        maxWidth: 300,
        minWidth: 200,
        autoPan: true,
        autoPanPadding: [10, 10]
    });
    
    marker.pointData = point;
    markers[point.id] = marker;
}

// ============ POPUP INHALT ERSTELLEN ============
function createPopupContent(point, typeInfo) {
    const isAdminUser = isAdmin;
    const zoom = map.getZoom();
    const popupFontSize = Math.min(16, Math.max(12, 12 + zoom / 2));
    
    return `
        <div class="custom-popup" style="font-size: ${popupFontSize}px; min-width: 200px;">
            <strong style="font-size: ${popupFontSize + 2}px; color: #ff9800; display: block; margin-bottom: 8px;">
                📌 ${escapeHtml(point.name)}
            </strong>
            <div class="type-badge" style="
                background: ${typeInfo.color}20; 
                color: ${typeInfo.color}; 
                border: 1px solid ${typeInfo.color};
                display: inline-block;
                padding: 4px 10px;
                border-radius: 20px;
                font-size: ${popupFontSize - 2}px;
                margin: 5px 0;
            ">
                ${typeInfo.icon} ${point.type}
            </div>
            <div class="coordinates" style="
                font-size: ${popupFontSize - 3}px; 
                color: #aaa; 
                margin: 8px 0;
                font-family: monospace;
            ">
                📍 ${point.lat.toFixed(1)} | ${point.lng.toFixed(1)}
            </div>
            ${isAdminUser ? `
                <div style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
                    <button onclick="editPointName('${point.id}', '${escapeHtml(point.name)}')" style="
                        flex: 1;
                        padding: 8px 12px;
                        background: #ff9800;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: ${popupFontSize - 2}px;
                        transition: background 0.2s;
                    " onmouseover="this.style.background='#f57c00'" onmouseout="this.style.background='#ff9800'">
                        ✏️ Name ändern
                    </button>
                    <button onclick="deletePoint('${point.id}')" style="
                        flex: 1;
                        padding: 8px 12px;
                        background: #f44336;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: ${popupFontSize - 2}px;
                        transition: background 0.2s;
                    " onmouseover="this.style.background='#da190b'" onmouseout="this.style.background='#f44336'">
                        🗑️ Löschen
                    </button>
                </div>
                <div style="margin-top: 8px;">
                    <button onclick="editPointType('${point.id}', '${point.type}')" style="
                        width: 100%;
                        padding: 6px;
                        background: #3a3a3a;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: ${popupFontSize - 2}px;
                    ">
                        🏷️ Typ ändern
                    </button>
                </div>
            ` : ''}
            <div class="info-text" style="
                font-size: ${popupFontSize - 4}px; 
                color: #666; 
                margin-top: 10px;
                padding-top: 8px;
                border-top: 1px solid #333;
            ">
                🕐 ${point.createdAt ? new Date(point.createdAt.toDate()).toLocaleDateString('de-DE') : 'Unbekannt'}
            </div>
        </div>
    `;
}

// ============ PUNKT HINZUFÜGEN DIALOG ============
function showAddPointDialog() {
    let dialog = document.getElementById('addPointDialog');
    if (dialog) dialog.remove();
    
    dialog = document.createElement('div');
    dialog.id = 'addPointDialog';
    dialog.className = 'add-point-dialog';
    dialog.innerHTML = `
        <h3 style="margin: 0 0 15px 0; color: #4CAF50;">Neuen Punkt erstellen</h3>
        <input type="text" id="pointName" placeholder="Name des Punktes (z.B. 'Geld-Lager Nord')" style="
            width: 100%;
            padding: 12px;
            margin-bottom: 12px;
            border-radius: 8px;
            border: none;
            background: #2a2a2a;
            color: white;
            box-sizing: border-box;
            font-size: 14px;
        ">
        <select id="pointTypeSelect" style="
            width: 100%;
            padding: 12px;
            margin-bottom: 12px;
            border-radius: 8px;
            border: none;
            background: #2a2a2a;
            color: white;
            font-size: 14px;
        ">
            <option value="Sammler">💰 Sammler</option>
            <option value="Verarbeiter">🏭 Verarbeiter</option>
            <option value="Hersteller">🔧 Hersteller</option>
            <option value="Anwesen">🏠 Anwesen</option>
            <option value="Wichtig">📍 Wichtig</option>
            <option value="Labor">🏪 Labor</option>
            <option value="Labor">💊 Velvet Echo</option>
        </select>
        <div style="display: flex; gap: 10px; margin-top: 15px;">
            <button onclick="confirmAddPoint()" style="flex: 1; padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer;">✓ Hinzufügen</button>
            <button onclick="cancelAddPoint()" style="flex: 1; padding: 12px; background: #3a3a3a; color: white; border: none; border-radius: 8px; cursor: pointer;">✗ Abbrechen</button>
        </div>
        <div class="info-text" style="margin-top: 12px; font-size: 11px; color: #aaa; text-align: center;">
            💡 Tipp: Gib einen aussagekräftigen Namen ein
        </div>
    `;
    document.body.appendChild(dialog);
    
    setTimeout(() => {
        const nameInput = document.getElementById('pointName');
        if (nameInput) nameInput.focus();
    }, 100);
}

function confirmAddPoint() {
    const name = document.getElementById('pointName')?.value.trim();
    const type = document.getElementById('pointTypeSelect')?.value;
    
    if (!name) {
        alert('Bitte gib einen Namen für den Punkt ein!');
        return;
    }
    
    if (pendingCoordinates) {
        addPoint(pendingCoordinates.lat, pendingCoordinates.lng, type, name);
        cancelAddPoint();
    }
}

function cancelAddPoint() {
    const dialog = document.getElementById('addPointDialog');
    if (dialog) dialog.remove();
    pendingCoordinates = null;
}

// ============ FIREBASE OPERATIONEN ============
async function addPoint(lat, lng, type, name) {
    try {
        await db.collection('points').add({
            lat: lat,
            lng: lng,
            type: type,
            name: name,
            createdBy: currentUser?.uid || 'unknown',
            createdByEmail: currentUser?.email || 'unknown',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log("✅ Punkt hinzugefügt:", name);
    } catch (error) {
        console.error("Fehler beim Hinzufügen:", error);
        alert("Fehler: " + error.message);
    }
}

async function deletePoint(id) {
    const point = markers[id]?.pointData;
    if (point && confirm(`"${point.name}" wirklich löschen?`)) {
        try {
            await db.collection('points').doc(id).delete();
            console.log("✅ Punkt gelöscht!");
        } catch (error) {
            alert("Fehler beim Löschen");
        }
    }
}

async function editPointName(id, currentName) {
    const newName = prompt('Neuer Name:', currentName);
    if (newName && newName.trim() !== currentName) {
        try {
            await db.collection('points').doc(id).update({ name: newName.trim() });
            console.log("✅ Name geändert zu:", newName);
        } catch (error) {
            alert("Fehler beim Ändern");
        }
    }
}

async function editPointType(id, currentType) {
    const types = Object.keys(pointTypes).join(', ');
    const newType = prompt(`Neuer Typ (${types}):`, currentType);
    if (newType && pointTypes[newType]) {
        try {
            await db.collection('points').doc(id).update({ type: newType });
            console.log("✅ Typ geändert zu:", newType);
        } catch (error) {
            alert("Fehler beim Ändern");
        }
    } else if (newType) {
        alert(`Ungültiger Typ! Verfügbar: ${types}`);
    }
}

// ============ LIVE PUNKTE LADEN ============
function loadPoints() {
    db.collection('points').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const point = { id: change.doc.id, ...change.doc.data() };
            
            if (change.type === 'added') {
                addMarkerToMap(point);
            } else if (change.type === 'modified') {
                if (markers[point.id]) {
                    markers[point.id].remove();
                    delete markers[point.id];
                }
                addMarkerToMap(point);
            } else if (change.type === 'removed') {
                if (markers[point.id]) {
                    markers[point.id].remove();
                    delete markers[point.id];
                }
            }
        });
        updatePointCount();
        updatePointList();
    }, (error) => {
        console.error("Firestore Fehler:", error);
    });
}

// ============ PUNKTE LISTE ============
function updatePointList() {
    const pointListElement = document.getElementById('pointList');
    if (!pointListElement) return;
    
    const points = Object.values(markers).map(m => m.pointData).filter(p => p);
    const checkboxes = document.querySelectorAll('.filter-checkbox');
    const activeTypes = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
    const filteredPoints = points.filter(p => activeTypes.includes(p.type));
    
    if (filteredPoints.length === 0) {
        pointListElement.innerHTML = '<div class="info-text">Keine Punkte gefunden</div>';
        return;
    }
    
    pointListElement.innerHTML = filteredPoints.map(point => `
        <div onclick="flyToPoint(${point.lat}, ${point.lng})" style="
            padding: 10px;
            margin-bottom: 8px;
            background: rgba(255,255,255,0.1);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
        " onmouseover="this.style.background='rgba(255,255,255,0.2)'; this.style.transform='translateX(5px)'" 
           onmouseout="this.style.background='rgba(255,255,255,0.1)'; this.style.transform='translateX(0)'">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 20px;">${pointTypes[point.type]?.icon || '📍'}</span>
                <div style="flex: 1;">
                    <strong style="font-size: 13px;">${escapeHtml(point.name)}</strong>
                    <div style="font-size: 10px; color: #aaa;">${point.type}</div>
                </div>
            </div>
        </div>
    `).join('');
}

function flyToPoint(lat, lng) {
    map.flyTo([lat, lng], Math.max(map.getZoom(), 4), { duration: 1 });
    setTimeout(() => {
        Object.values(markers).forEach(marker => {
            const pos = marker.getLatLng();
            if (Math.abs(pos.lat - lat) < 0.1 && Math.abs(pos.lng - lng) < 0.1) {
                marker.openPopup();
            }
        });
    }, 600);
}

function updatePointCount() {
    const count = Object.keys(markers).length;
    const el = document.getElementById('pointCount');
    if (el) el.textContent = count;
}

// ============ FILTER ============
function setupFilters() {
    const checkboxes = document.querySelectorAll('.filter-checkbox');
    checkboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            const activeTypes = Array.from(checkboxes).filter(c => c.checked).map(c => c.value);
            Object.values(markers).forEach(marker => {
                const point = marker.pointData;
                if (point && activeTypes.includes(point.type)) {
                    if (!map.hasLayer(marker)) marker.addTo(map);
                } else if (marker) {
                    marker.remove();
                }
            });
            updatePointList();
        });
    });
}

// ============ UI ERSTELLEN ============
function createUI() {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `
        <h3>🗺️ GTA V Map</h3>
        <div class="filters">
            <h4>🔍 Filtern</h4>
            ${Object.entries(pointTypes).map(([key, v]) => `
                <label><input type="checkbox" class="filter-checkbox" value="${key}" checked> ${v.emoji} ${v.name}</label>
            `).join('')}
        </div>
        <div style="margin-bottom: 10px;">
            <h4>📋 Punkte</h4>
            <div id="pointList" style="max-height: 200px; overflow-y: auto;"></div>
        </div>
        <div class="legend">
            <h4>📖 Legende</h4>
            ${Object.entries(pointTypes).map(([key, v]) => `
                <div class="legend-item"><div class="legend-color ${key.toLowerCase()}"></div> ${v.emoji} ${v.name}</div>
            `).join('')}
        </div>
        <div class="info-text">💡 Admin: Doppelklick → Punkt erstellen</div>
    `;
    document.body.appendChild(panel);
    
    if (isAdmin) {
        const badge = document.createElement('div');
        badge.className = 'admin-badge';
        badge.innerHTML = `👑 ${currentUser?.email} | <button onclick="logout()">Logout</button>`;
        document.body.appendChild(badge);
    } else if (!currentUser) {
        const btn = document.createElement('button');
        btn.textContent = '🔐 Admin Login';
        btn.style.cssText = 'position:absolute;top:10px;right:10px;z-index:1000;width:auto;padding:8px 16px;background:#ff9800;border:none;border-radius:8px;color:white;cursor:pointer';
        btn.onclick = showLoginModal;
        document.body.appendChild(btn);
    } else {
        const info = document.createElement('div');
        info.className = 'admin-badge';
        info.style.background = '#666';
        info.innerHTML = `👤 ${currentUser.email} | <button onclick="logout()">Logout</button>`;
        document.body.appendChild(info);
    }
    
    setTimeout(() => {
        setupFilters();
        updatePointList();
    }, 100);
}

// ============ AUTHENTIFIZIERUNG ============
function showLoginModal() {
    if (document.getElementById('loginModal')) return;
    const modal = document.createElement('div');
    modal.id = 'loginModal';
    modal.className = 'login-panel';
    modal.innerHTML = `
        <h3>🔐 Admin Login</h3>
        <input type="email" id="loginEmail" placeholder="Email">
        <input type="password" id="loginPassword" placeholder="Passwort">
        <button onclick="login()" class="primary">Anmelden</button>
        <button onclick="closeLoginModal()">Abbrechen</button>
    `;
    document.body.appendChild(modal);
}

function closeLoginModal() {
    document.getElementById('loginModal')?.remove();
}

async function login() {
    const email = document.getElementById('loginEmail')?.value;
    const pwd = document.getElementById('loginPassword')?.value;
    if (!email || !pwd) return alert('Bitte Email und Passwort eingeben');
    try {
        await auth.signInWithEmailAndPassword(email, pwd);
        closeLoginModal();
        location.reload();
    } catch (e) {
        alert('Login fehlgeschlagen: ' + e.message);
    }
}

async function logout() {
    await auth.signOut();
    location.reload();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============ AUTH STATE ============
auth.onAuthStateChanged((user) => {
    currentUser = user;
    isAdmin = user?.email === 'hellomello12853@gmail.com';
    
    document.querySelector('.panel')?.remove();
    document.querySelector('.admin-badge')?.remove();
    document.querySelector('button[onclick="showLoginModal()"]')?.remove();
    
    createUI();
    if (map) loadPoints();
});

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
    initMap();
});

// Globale Funktionen
window.deletePoint = deletePoint;
window.editPointName = editPointName;
window.editPointType = editPointType;
window.login = login;
window.logout = logout;
window.closeLoginModal = closeLoginModal;
window.confirmAddPoint = confirmAddPoint;
window.cancelAddPoint = cancelAddPoint;
window.flyToPoint = flyToPoint;
