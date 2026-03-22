import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore,
    collection,
    onSnapshot,
    query,
    orderBy,
    limit,
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyC6sHSNXX9b3ky32Zt5_HYyDj7GiCWCbts",
    authDomain: "llamado-cliente.firebaseapp.com",
    projectId: "llamado-cliente",
    storageBucket: "llamado-cliente.appspot.com",
    messagingSenderId: "444376711880",
    appId: "1:444376711880:web:01c32061eea040ef0f9bfd"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const elUnlock = document.getElementById("audio-unlock");
const elAudio = document.getElementById("snd");
const elContainer = document.getElementById("container-llamado");
const elPaciente = document.getElementById("tv-paciente");
const elRecepcion = document.getElementById("tv-recepcion");
const elHora = document.getElementById("tv-hora");
const elHistorial = document.getElementById("historial-lista");
const elBtnResetTv = document.getElementById("btn-reset-tv");

const refTvConfig = doc(db, "tv_config", "pantalla_principal");

let ultimaClaveMostrada = "";
let primerRenderCompleto = false;
let llamadosCache = [];
let resetDesdeMs = 0;

function normalizarTexto(valor, fallback = "---") {
    if (valor === null || valor === undefined) return fallback;
    const txt = String(valor).trim();
    return txt ? txt.toUpperCase() : fallback;
}

function obtenerTimestampMs(valor) {
    if (!valor) return 0;

    if (typeof valor === "number") return valor;

    if (typeof valor === "string") {
        const ms = Date.parse(valor);
        return Number.isNaN(ms) ? 0 : ms;
    }

    if (typeof valor.toMillis === "function") {
        return valor.toMillis();
    }

    if (typeof valor.seconds === "number") {
        return valor.seconds * 1000;
    }

    return 0;
}

function formatearHora(valor) {
    const ms = obtenerTimestampMs(valor);
    if (!ms) return "---";

    const fecha = new Date(ms);
    return fecha.toLocaleTimeString("es-CL", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    });
}

function reproducirSonido() {
    elAudio.currentTime = 0;
    elAudio.volume = 1.0;
    elAudio.play().catch(() => {
        console.warn("Audio bloqueado. Haz clic en la pantalla.");
    });
}

function destacarLlamado() {
    elContainer.classList.add("flash");
    setTimeout(() => {
        elContainer.classList.remove("flash");
    }, 5000);
}

function construirClaveLlamado(item) {
    const id = item.id || "";
    const hora = obtenerTimestampMs(item.hora_llamado_recepcion);
    const recepcion = item.recepcion_nombre || "";
    return `${id}__${hora}__${recepcion}`;
}

function renderPrincipal(item) {
    elPaciente.innerText = normalizarTexto(item.nombre || item.paciente || "---");
    elRecepcion.innerText = normalizarTexto(item.recepcion_nombre || "RECEPCIÓN");
    elHora.innerText = `HORA: ${formatearHora(item.hora_llamado_recepcion)}`;
}

function renderVacio() {
    elPaciente.innerText = "---";
    elRecepcion.innerText = "ESPERANDO...";
    elHora.innerText = "---";
}

function renderHistorial(items) {
    elHistorial.innerHTML = "";

    if (!items.length) {
        const row = document.createElement("div");
        row.className = "hist-row";
        row.innerHTML = `
            <div style="min-width:0;">
                <div class="hist-name">SIN LLAMADOS</div>
                <div class="hist-doc">AÚN NO HAY PACIENTES LLAMADOS</div>
            </div>
            <div class="hist-meta">---</div>
        `;
        elHistorial.appendChild(row);
        return;
    }

    items.forEach((p) => {
        const row = document.createElement("div");
        row.className = "hist-row";
        row.innerHTML = `
            <div style="min-width:0;">
                <div class="hist-name">${normalizarTexto(p.nombre || p.paciente || "---")}</div>
                <div class="hist-doc">${normalizarTexto(p.recepcion_nombre || "RECEPCIÓN")}</div>
            </div>
            <div class="hist-meta">${formatearHora(p.hora_llamado_recepcion)}</div>
        `;
        elHistorial.appendChild(row);
    });
}

function filtrarLlamadosRecepcion(docs) {
    return docs
        .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
        }))
        .filter((item) => {
            const horaMs = obtenerTimestampMs(item.hora_llamado_recepcion);
            const tieneRecepcion = !!String(item.recepcion_nombre || "").trim();

            if (!horaMs || !tieneRecepcion) return false;
            if (resetDesdeMs && horaMs <= resetDesdeMs) return false;

            return true;
        })
        .sort((a, b) => obtenerTimestampMs(b.hora_llamado_recepcion) - obtenerTimestampMs(a.hora_llamado_recepcion));
}

function refrescarPantalla() {
    const llamados = filtrarLlamadosRecepcion(llamadosCache);

    if (!llamados.length) {
        renderVacio();
        renderHistorial([]);
        ultimaClaveMostrada = "";
        primerRenderCompleto = true;
        return;
    }

    const actual = llamados[0];
    const claveActual = construirClaveLlamado(actual);

    renderPrincipal(actual);
    renderHistorial(llamados.slice(0, 6));

    if (!primerRenderCompleto) {
        ultimaClaveMostrada = claveActual;
        primerRenderCompleto = true;
        return;
    }

    if (claveActual !== ultimaClaveMostrada) {
        reproducirSonido();
        destacarLlamado();
        ultimaClaveMostrada = claveActual;
    }
}

async function resetearTv() {
    const confirmar = window.confirm(
        "¿Seguro que quieres resetear la TV?\n\nEsto limpiará el llamado actual y el historial del módulo TV, sin borrar datos de recepción."
    );

    if (!confirmar) return;

    elBtnResetTv.disabled = true;
    elBtnResetTv.textContent = "Reseteando...";

    try {
        await setDoc(
            refTvConfig,
            {
                reset_desde: serverTimestamp(),
                actualizado_en: serverTimestamp()
            },
            { merge: true }
        );

        alert("TV reseteada correctamente.");
    } catch (error) {
        console.error("Error al resetear TV:", error);
        alert("No se pudo resetear la TV. Revisa la consola o permisos de Firebase.");
    } finally {
        elBtnResetTv.disabled = false;
        elBtnResetTv.textContent = "Resetear TV";
    }
}

elUnlock.addEventListener("click", async () => {
    try {
        await elAudio.play();
        elAudio.pause();
        elAudio.currentTime = 0;
        elUnlock.style.display = "none";
    } catch (error) {
        console.warn("No se pudo desbloquear el audio.", error);
    }
});

elBtnResetTv.addEventListener("click", resetearTv);

onSnapshot(
    refTvConfig,
    (snap) => {
        const data = snap.exists() ? snap.data() : {};
        resetDesdeMs = obtenerTimestampMs(data.reset_desde);
        refrescarPantalla();
    },
    (error) => {
        console.error("Error leyendo configuración TV:", error);
    }
);

const qRecepcion = query(
    collection(db, "agendados"),
    orderBy("hora_llamado_recepcion", "desc"),
    limit(30)
);

onSnapshot(
    qRecepcion,
    (snapshot) => {
        llamadosCache = snapshot.docs;
        refrescarPantalla();
    },
    (error) => {
        console.error("Error escuchando llamados de recepción:", error);
        renderVacio();
        renderHistorial([]);
    }
);