// ============ FIREBASE KONFIGURATION ============
// ⚠️ HIER DEINE FIREBASE-KONFIGURATION EINFÜGEN! ⚠️
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
let pendingCoordinates = null; // Für Dialog beim Punkt hinzufügen

// Punkt-Typen mit Farben und Icons/Emojis
const pointTypes = {
    'Sammler': { color: '#ff6b6b', icon: '💰', name: 'Sammler', emoji: '💰' },
    'Verarbeiter': { color: '#4ecdc4', icon: '🏭', name: 'Verarbeiter', emoji: '🏭' },
    'Anwesen': { color: '#45b7d1', icon: '🏠', name: 'Anwesen', emoji: '🏠' },
    'Hersteller': { color: '#96ceb4', icon: '🔧', name: 'Hersteller', emoji: '🔧' }
};

// ============ KARTE MIT EIGENEM BILD INITIALISIEREN ============
function initMap() {
    // Bild-Dimensionen deiner map.jpg (PASSE DIESE WERTE AN!)
    // Du kannst die tatsächliche Breite/Höhe deines Bildes in Pixel hier eintragen
    const imageWidth = 1920;   // Breite deiner map.jpg in Pixeln
    const imageHeight = 1080;  // Höhe deiner map.jpg in Pixeln
    
    // Koordinaten für das Bild (0,0) oben links bis (imageWidth, imageHeight)
    const southWest = L.latLng(0, 0);
    const northEast = L.latLng(imageHeight, imageWidth);
    const bounds = L.latLngBounds(southWest, northEast);
    
    // Karte erstellen mit den Bild-Bounds
    map = L.map('map', {
        maxBounds: bounds,
        maxBoundsViscosity: 1.0,
        crs: L.CRS.Simple  // Einfaches Koordinatensystem für Bilder
    }).setView([imageHeight / 2, imageWidth / 2], 1);
    
    // Dein eigenes Kartenbild hinzufügen
    L.imageOverlay('map.jpg', bounds, {
        attribution: 'GTA V Map',
        interactive: true
    }).addTo(map);
    
    // Optional: Gitterlinien für bessere Orientierung
    L.gridLayer().addTo(map);
    
    console.log("Karte mit eigenem Bild wurde initialisiert! Bildgröße:", imageWidth, "x", imageHeight);
    
    // Doppelklick-Event für Admin
    map.on('dblclick', async (e) => {
        if (isAdmin) {
            // Koordinaten speichern und Dialog öffnen
            pendingCoordinates = e.latlng;
            showAddPointDialog();
        } else if (currentUser) {
            alert('Nur Admins können Punkte hinzufügen');
        } else {
            alert('Bitte als Admin einloggen, um Punkte hinzuzufügen');
        }
    });
    
    return bounds;
}

// ============ DIALOG ZUM HINZUFÜGEN VON PUNKTEN ============
function showAddPointDialog() {
    // Dialog erstellen, falls nicht vorhanden
    let dialog = document.getElementById('addPointDialog');
    if (dialog) dialog.remove();
    
    dialog = document.createElement('div');
    dialog.id = 'addPointDialog';
    dialog.className = 'add-point-dialog';
    dialog.innerHTML = `
        <h3>📍 Neuen Punkt erstellen</h3>
        <input type="text" id="pointName" placeholder="Name des Punktes (z.B. 'Geld-Lager Nord')" autocomplete="off">
        <select id="pointTypeSelect">
            <option value="Sammler">💰 Sammler</option>
            <option value="Verarbeiter">🏭 Verarbeiter</option>
            <option value="Anwesen">🏠 Anwesen</option>
            <option value="Hersteller">🔧 Hersteller</option>
        </select>
        <div class="button-group">
            <button onclick="confirmAddPoint()" class="primary">✓ Hinzufügen</button>
            <button onclick="cancelAddPoint()">✗ Abbrechen</button>
        </div>
        <div class="info-text">
            💡 Tipp: Gib einen aussagekräftigen Namen ein, um den Punkt später leichter zu finden.
        </div>
    `;
    document.body.appendChild(dialog);
    
    // Fokus auf Namensfeld setzen
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

// ============ FIREBASE: PUNKTE LIVE LADEN ============
function loadPoints() {
    db.collection('points').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const point = { id: change.doc.id, ...change.doc.data() };
            
            if (change.type === 'added') {
                addMarkerToMap(point);
            } else if (change.type === 'modified') {
                updateMarkerOnMap(point);
            } else if (change.type === 'removed') {
                removeMarkerFromMap(point.id);
            }
        });
        
        updatePointCount();
        updatePointList();
    }, (error) => {
        console.error("Firestore Fehler:", error);
    });
}

// ============ MARKER FUNKTIONEN ============
function addMarkerToMap(point) {
    const typeInfo = pointTypes[point.type] || pointTypes['Sammler'];
    
    // Benutzerdefinierten Icon erstellen mit Namen als Tooltip
    const customIcon = L.divIcon({
        html: `<div style="
            background: ${typeInfo.color};
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            cursor: pointer;
            transition: transform 0.2s;
        " 
        onmouseover="this.style.transform='scale(1.1)'"
        onmouseout="this.style.transform='scale(1)'"
        >${typeInfo.icon}</div>`,
        className: 'custom-marker',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
    });
    
    const marker = L.marker([point.lat, point.lng], { icon: customIcon }).addTo(map);
    
    // Popup mit allen Informationen (inkl. Name und Bearbeitungsmöglichkeit)
    const popupContent = `
        <div class="custom-popup">
            <strong>📌 ${escapeHtml(point.name)}</strong>
            <div class="type-badge" style="background: ${typeInfo.color}20; color: ${typeInfo.color}; border: 1px solid ${typeInfo.color}">
                ${typeInfo.icon} ${point.type}
            </div>
            <div class="coordinates">
                📍 Koordinaten: ${point.lat.toFixed(1)} | ${point.lng.toFixed(1)}
            </div>
            ${isAdmin ? `
                <div class="button-group">
                    <button onclick="editPointName('${point.id}', '${escapeHtml(point.name)}')" class="warning">✏️ Name ändern</button>
                    <button onclick="deletePoint('${point.id}')" class="danger">🗑️ Löschen</button>
                </div>
                <div class="button-group">
                    <button onclick="editPointType('${point.id}', '${point.type}')">🏷️ Typ ändern</button>
                </div>
            ` : ''}
            <div class="info-text" style="margin-top: 8px;">
                🕐 Erstellt: ${point.createdAt ? new Date(point.createdAt.toDate()).toLocaleDateString('de-DE') : 'Unbekannt'}
            </div>
        </div>
    `;
    
    marker.bindPopup(popupContent);
    marker.pointData = point;
    markers[point.id] = marker;
}

function updateMarkerOnMap(point) {
    if (markers[point.id]) {
        markers[point.id].remove();
        delete markers[point.id];
    }
    addMarkerToMap(point);
}

function removeMarkerFromMap(id) {
    if (markers[id]) {
        markers[id].remove();
        delete markers[id];
    }
}

// ============ CRUD OPERATIONEN ============
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
        alert("Fehler beim Hinzufügen des Punktes: " + error.message);
    }
}

async function deletePoint(id) {
    const point = markers[id]?.pointData;
    const confirmMsg = point 
        ? `Möchtest du "${point.name}" wirklich löschen?` 
        : 'Möchtest du diesen Punkt wirklich löschen?';
    
    if (confirm(confirmMsg)) {
        try {
            await db.collection('points').doc(id).delete();
            console.log("✅ Punkt gelöscht!");
        } catch (error) {
            console.error("Fehler beim Löschen:", error);
            alert("Fehler beim Löschen des Punktes");
        }
    }
}

async function editPointName(id, currentName) {
    const newName = prompt('Gib einen neuen Namen für diesen Punkt ein:', currentName);
    if (newName && newName.trim() !== currentName) {
        try {
            await db.collection('points').doc(id).update({
                name: newName.trim()
            });
            console.log("✅ Punkt umbenannt in:", newName);
        } catch (error) {
            console.error("Fehler beim Bearbeiten:", error);
            alert("Fehler beim Bearbeiten des Namens");
        }
    } else if (newName === '') {
        alert('Der Name darf nicht leer sein!');
    }
}

async function editPointType(id, currentType) {
    const typeOptions = Object.entries(pointTypes).map(([key, value]) => 
        `${key} - ${value.icon} ${value.name}`
    ).join('\n');
    
    const newType = prompt(`Gib den neuen Typ ein:\n${typeOptions}\n\nAktuell: ${currentType}`, currentType);
    
    if (newType && pointTypes[newType]) {
        try {
            await db.collection('points').doc(id).update({
                type: newType
            });
            console.log("✅ Typ geändert zu:", newType);
        } catch (error) {
            console.error("Fehler beim Ändern des Typs:", error);
            alert("Fehler beim Ändern des Typs");
        }
    } else if (newType) {
        alert(`Ungültiger Typ! Verfügbare Typen: ${Object.keys(pointTypes).join(', ')}`);
    }
}

// ============ PUNKTE LISTE ANZEIGEN ============
function updatePointList() {
    const pointListElement = document.getElementById('pointList');
    if (!pointListElement) return;
    
    const points = Object.values(markers).map(m => m.pointData).filter(p => p);
    const filteredPoints = points.filter(point => {
        const checkboxes = document.querySelectorAll('.filter-checkbox');
        const activeTypes = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
        return activeTypes.includes(point.type);
    });
    
    if (filteredPoints.length === 0) {
        pointListElement.innerHTML = '<div class="info-text">Keine Punkte gefunden</div>';
        return;
    }
    
    pointListElement.innerHTML = filteredPoints.map(point => `
        <div class="point-list-item" onclick="flyToPoint(${point.lat}, ${point.lng})" style="
            padding: 8px;
            margin-bottom: 5px;
            background: rgba(255,255,255,0.1);
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.2s;
        " onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 18px;">${pointTypes[point.type]?.icon || '📍'}</span>
                <div style="flex: 1;">
                    <strong>${escapeHtml(point.name)}</strong>
                    <div style="font-size: 11px; color: #aaa;">${point.type}</div>
                </div>
            </div>
        </div>
    `).join('');
}

function flyToPoint(lat, lng) {
    map.flyTo([lat, lng], map.getZoom(), {
        duration: 1.5
    });
    // Popup öffnen
    setTimeout(() => {
        Object.values(markers).forEach(marker => {
            if (marker.getLatLng().lat === lat && marker.getLatLng().lng === lng) {
                marker.openPopup();
            }
        });
    }, 500);
}

// ============ FILTER FUNKTION ============
function setupFilters() {
    const checkboxes = document.querySelectorAll('.filter-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const activeTypes = Array.from(checkboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.value);
            
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

function updatePointCount() {
    const count = Object.keys(markers).length;
    const countElement = document.getElementById('pointCount');
    if (countElement) {
        countElement.textContent = count;
    }
}

// ============ UI ELEMENTE ERSTELLEN ============
function createUI() {
    // Haupt-Panel
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `
        <h3>
            <span>🗺️ GTA V Map</span>
            <span style="font-size: 12px;">🎮 Interactive</span>
        </h3>
        
        <div class="filters">
            <h4>🔍 Nach Typ filtern</h4>
            ${Object.entries(pointTypes).map(([key, value]) => `
                <label>
                    <input type="checkbox" class="filter-checkbox" value="${key}" checked>
                    ${value.emoji} ${value.name}
                </label>
            `).join('')}
        </div>
        
        <div style="margin-bottom: 10px;">
            <h4>📋 Punkte-Liste</h4>
            <div id="pointList" style="max-height: 200px; overflow-y: auto;">
                <div class="info-text">Lade Punkte...</div>
            </div>
        </div>
        
        <div class="legend">
            <h4>📖 Legende</h4>
            ${Object.entries(pointTypes).map(([key, value]) => `
                <div class="legend-item">
                    <div class="legend-color ${key.toLowerCase()}"></div>
                    <span>${value.emoji} ${value.name}</span>
                </div>
            `).join('')}
        </div>
        
        <div style="margin-top: 10px; font-size: 12px; color: #aaa; text-align: center;">
            📍 Gesamt: <span id="pointCount">0</span> Punkte
        </div>
        <div class="info-text">
            💡 Admin: Doppelklick auf Karte → Punkt mit Namen erstellen
        </div>
    `;
    document.body.appendChild(panel);
    
    // Admin-Badge und Login/Logout
    if (isAdmin) {
        const badge = document.createElement('div');
        badge.className = 'admin-badge';
        badge.innerHTML = `👑 ${currentUser?.email} | <button onclick="logout()">Logout</button>`;
        document.body.appendChild(badge);
    } else if (!currentUser) {
        const loginBtn = document.createElement('button');
        loginBtn.textContent = '🔐 Admin Login';
        loginBtn.style.position = 'absolute';
        loginBtn.style.top = '10px';
        loginBtn.style.right = '10px';
        loginBtn.style.zIndex = '1000';
        loginBtn.style.width = 'auto';
        loginBtn.style.padding = '8px 16px';
        loginBtn.style.background = '#ff9800';
        loginBtn.onclick = showLoginModal;
        document.body.appendChild(loginBtn);
    } else {
        const userInfo = document.createElement('div');
        userInfo.className = 'admin-badge';
        userInfo.style.background = '#666';
        userInfo.innerHTML = `👤 ${currentUser.email} (nur Leserechte) | <button onclick="logout()">Logout</button>`;
        document.body.appendChild(userInfo);
    }
    
    // Filter Setup nachdem UI erstellt wurde
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
        <input type="email" id="loginEmail" placeholder="Email" autocomplete="email">
        <input type="password" id="loginPassword" placeholder="Passwort" autocomplete="current-password">
        <button onclick="login()" class="primary">Anmelden</button>
        <button onclick="closeLoginModal()">Abbrechen</button>
        <div class="info-text" style="margin-top: 15px;">
            Nur Admins können Punkte erstellen, bearbeiten und löschen.<br>
            Normale Nutzer können die Karte nur ansehen.
        </div>
    `;
    document.body.appendChild(modal);
}

function closeLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) modal.remove();
}

async function login() {
    const email = document.getElementById('loginEmail')?.value;
    const password = document.getElementById('loginPassword')?.value;
    
    if (!email || !password) {
        alert('Bitte Email und Passwort eingeben');
        return;
    }
    
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        console.log("Login erfolgreich:", userCredential.user.email);
        closeLoginModal();
        location.reload();
    } catch (error) {
        console.error("Login Fehler:", error);
        alert('Login fehlgeschlagen: ' + error.message);
    }
}

async function logout() {
    try {
        await auth.signOut();
        location.reload();
    } catch (error) {
        console.error("Logout Fehler:", error);
    }
}

// ============ HELFER FUNKTIONEN ============
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============ AUTH STATE LISTENER ============
auth.onAuthStateChanged((user) => {
    currentUser = user;
    
    if (user) {
        // Prüfe ob Admin (ändere die Email zu deiner Admin-Email!)
        isAdmin = user.email === 'hellomello12853@gmail.com';
    } else {
        isAdmin = false;
    }
    
    // UI neu erstellen
    const existingPanel = document.querySelector('.panel');
    if (existingPanel) existingPanel.remove();
    const existingBadge = document.querySelector('.admin-badge');
    if (existingBadge) existingBadge.remove();
    const existingLoginBtn = document.querySelector('button[onclick="showLoginModal()"]');
    if (existingLoginBtn) existingLoginBtn.remove();
    
    createUI();
    
    // Punkte laden (wenn Karte existiert)
    if (map) {
        loadPoints();
    }
});

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
    initMap();
});

// Globale Funktionen für onclick verfügbar machen
window.deletePoint = deletePoint;
window.editPointName = editPointName;
window.editPointType = editPointType;
window.login = login;
window.logout = logout;
window.closeLoginModal = closeLoginModal;
window.addPoint = addPoint;
window.confirmAddPoint = confirmAddPoint;
window.cancelAddPoint = cancelAddPoint;
window.flyToPoint = flyToPoint;
