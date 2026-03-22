// 🔥 Firebase
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js"></script>

<script src="app.js"></script>
  
const firebaseConfig = {
  apiKey: "AIzaSyCXJoRlLQloM9ODw23dGYpl5r3GWR5HZgA",
  authDomain: "swat-map-a8286.firebaseapp.com",
  projectId: "swat-map-a8286",
  storageBucket: "swat-map-a8286.firebasestorage.app",
  messagingSenderId: "381226507900",
  appId: "1:381226507900:web:cf2426af92f9d1c557b3f9"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// 🗺️ MAP
const map = L.map('map', {
  crs: L.CRS.Simple,
  minZoom: -2
});

const bounds = [[0,0], [1000,1000]];
L.imageOverlay('map.jpg', bounds).addTo(map);
map.fitBounds(bounds);

// 🎯 Icons mit Farben
const icons = {
  "Anwesen": L.icon({
    iconUrl: "icons/house.png",
    iconSize: [32,32],
    className: "red-icon"
  }),
  "Dächer": L.icon({
    iconUrl: "icons/roof.png",
    iconSize: [32,32],
    className: "blue-icon"
  }),
  "Punkte": L.icon({
    iconUrl: "icons/point.png",
    iconSize: [32,32],
    className: "green-icon"
  })
};

let markers = [];
let markerData = [];

// 🔴 LIVE
db.collection("markers").onSnapshot(snapshot => {
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  markerData = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    data.id = doc.id;

    const marker = L.marker([data.y, data.x], {
      icon: icons[data.type],
      draggable: !!auth.currentUser
    });

    // 🧲 DRAG & DROP
    marker.on("dragend", async function(e) {
      if (!auth.currentUser) return;

      const pos = e.target.getLatLng();

      await db.collection("markers").doc(data.id).update({
        x: pos.lng,
        y: pos.lat
      });
    });

    marker.bindPopup(createPopup(data));

    markers.push(marker);
    markerData.push(data);
  });

  updateMarkers();
});

// 📦 POPUP
function createPopup(data) {
  let admin = "";

  if (auth.currentUser) {
    admin = `
      <br><br>
      <button onclick="editMarker('${data.id}')">✏️</button>
      <button onclick="deleteMarker('${data.id}')">🗑️</button>
    `;
  }

  return `
    <b>${data.name}</b><br>
    ${data.type}
    ${admin}
  `;
}

// 🔍 FILTER
function updateMarkers() {
  const search = document.getElementById("search").value.toLowerCase();
  const checked = Array.from(document.querySelectorAll(".filters input:checked"))
    .map(cb => cb.value);

  markers.forEach((marker, i) => {
    const data = markerData[i];

    const okSearch = data.name.toLowerCase().includes(search);
    const okFilter = checked.includes(data.type);

    if (okSearch && okFilter) {
      marker.addTo(map);
    } else {
      map.removeLayer(marker);
    }
  });
}

document.getElementById("search").addEventListener("input", updateMarkers);
document.querySelectorAll(".filters input").forEach(cb =>
  cb.addEventListener("change", updateMarkers)
);

// 🔐 LOGIN
function login() {
  const email = prompt("Email:");
  const password = prompt("Passwort:");

  auth.signInWithEmailAndPassword(email, password);
}

function logout() {
  auth.signOut();
}

// ➕ ADD
map.on("click", async function(e) {
  if (!auth.currentUser) return;

  const name = prompt("Name:");
  const type = prompt("Typ (Anwesen, Dächer, Punkte):");

  if (!name || !type) return;

  await db.collection("markers").add({
    name,
    type,
    x: e.latlng.lng,
    y: e.latlng.lat
  });
});

// ✏️ EDIT
async function editMarker(id) {
  const doc = await db.collection("markers").doc(id).get();
  const data = doc.data();

  const name = prompt("Name:", data.name);
  const type = prompt("Typ:", data.type);

  if (!name || !type) return;

  await db.collection("markers").doc(id).update({ name, type });
}

// 🗑️ DELETE
async function deleteMarker(id) {
  if (!confirm("Löschen?")) return;

  await db.collection("markers").doc(id).delete();
}
