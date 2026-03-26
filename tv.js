import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore,
    collection,
    onSnapshot,
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

/* =========================
   ELEMENTOS DOM
========================= */
const elUnlock = document.getElementById("audio-unlock");
const elAudio = document.getElementById("snd");
const elBtnResetTv = document.getElementById("btn-reset-tv");

/* DOCTOR */
const elContainerDoctor = document.getElementById("container-llamado-doctor");
const elDoctorPaciente = document.getElementById("tv-doctor-paciente");
const elDoctorModulo = document.getElementById("tv-doctor-modulo");
const elDoctorHora = document.getElementById("tv-doctor-hora");
const elHistorialDoctor = document.getElementById("historial-doctor");

/* RECEPCIÓN */
const elContainerRecepcion = document.getElementById("container-llamado-recepcion");
const elRecepcionPaciente = document.getElementById("tv-recepcion-paciente");
const elRecepcionModulo = document.getElementById("tv-recepcion-modulo");
const elRecepcionHora = document.getElementById("tv-recepcion-hora");
const elHistorialRecepcion = document.getElementById("historial-recepcion");

/* =========================
   FIREBASE
========================= */
const refTvConfig = doc(db, "tv_config", "pantalla_principal");

/* =========================
   ESTADO
========================= */
let agendadosCache = [];

let resetDesdeDoctorMs = 0;
let resetDesdeRecepcionMs = 0;

let primerRenderDoctor = false;
let primerRenderRecepcion = false;

let ultimaClaveDoctor = "";
let ultimaClaveRecepcion = "";

/* =========================
   HELPERS
========================= */
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

function esHoraSimpleHHMM(valor) {
    return typeof valor === "string" && /^\d{2}:\d{2}$/.test(valor.trim());
}

function formatearHora(valor) {
    if (esHoraSimpleHHMM(valor)) {
        return valor.trim();
    }

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
    elAudio.volume = 1;
    elAudio.play().catch(() => {
        console.warn("Audio bloqueado. Haz clic para activarlo.");
    });
}

function destacarLlamado(container) {
    if (!container) return;

    container.classList.add("flash");
    setTimeout(() => {
        container.classList.remove("flash");
    }, 5000);
}

function obtenerNombrePaciente(item) {
    return (
        item.nombre ||
        item.paciente ||
        item.nombre_paciente ||
        "---"
    );
}

/* =========================
   RECEPCIÓN
========================= */
function obtenerHoraRecepcion(item) {
    return item.hora_llamado_recepcion || null;
}

function obtenerOrdenRecepcionMs(item) {
    return (
        obtenerTimestampMs(item.ultimo_llamado_recepcion) ||
        obtenerTimestampMs(item.hora_llamado_recepcion) ||
        0
    );
}

function obtenerNombreRecepcion(item) {
    return (
        item.recepcion_nombre ||
        item.modulo_recepcion ||
        item.recepcion ||
        "RECEPCIÓN"
    );
}

/* =========================
   DOCTOR
========================= */
function obtenerHoraDoctor(item) {
    return (
        item.tv_hora_llamado ||
        item.hora_llamado_doctor ||
        item.hora_llamado_consulta ||
        item.hora_llamado_medico ||
        item.hora_llamado_box ||
        item.hora_llamado ||
        null
    );
}

function obtenerOrdenDoctorMs(item) {
    return (
        obtenerTimestampMs(item.ultimo_llamado) ||
        obtenerTimestampMs(item.hora_llamado_doctor) ||
        obtenerTimestampMs(item.hora_llamado_consulta) ||
        obtenerTimestampMs(item.hora_llamado_medico) ||
        obtenerTimestampMs(item.hora_llamado_box) ||
        obtenerTimestampMs(item.hora_llamado) ||
        0
    );
}

function obtenerNombreDoctor(item) {
    return (
        item.tv_destino ||
        item.tv_doctor ||
        item.doctor_nombre ||
        item.nombre_doctor ||
        item.medico_nombre ||
        item.medico ||
        item.doctor ||
        item.box_nombre ||
        item.box ||
        item.consulta_nombre ||
        item.consulta ||
        "CONSULTA"
    );
}

function obtenerPacienteDoctor(item) {
    return (
        item.tv_paciente ||
        item.nombre ||
        item.paciente ||
        item.nombre_paciente ||
        "---"
    );
}

function esLlamadoDoctor(item) {
    const ordenMs = obtenerOrdenDoctorMs(item);
    if (!ordenMs) return false;

    const tvOrigen = String(item.tv_origen || "").trim().toUpperCase();
    const tvDoctor = String(item.tv_doctor || "").trim();
    const tvPaciente = String(item.tv_paciente || "").trim();
    const tvDestino = String(item.tv_destino || "").trim();
    const estado = String(item.estado || "").toLowerCase();
    const estadoVisual = String(item.estado_visual || "").toLowerCase();

    return (
        tvOrigen === "DOCTOR" ||
        !!tvDoctor ||
        !!tvPaciente ||
        !!tvDestino ||
        estado.includes("doctor") ||
        estado.includes("consulta") ||
        estado.includes("medico") ||
        estadoVisual.includes("doctor") ||
        estadoVisual.includes("consulta") ||
        estadoVisual.includes("medico")
    );
}

/* =========================
   CLAVES
========================= */
function construirClaveRecepcion(item) {
    const id = item.id || "";
    const hora = obtenerOrdenRecepcionMs(item);
    const modulo = obtenerNombreRecepcion(item);
    return `${id}__${hora}__${modulo}`;
}

function construirClaveDoctor(item) {
    const id = item.id || "";
    const hora = obtenerOrdenDoctorMs(item);
    const modulo = obtenerNombreDoctor(item);
    return `${id}__${hora}__${modulo}`;
}

/* =========================
   RENDER PRINCIPAL
========================= */
function renderPrincipalDoctor(item) {
    elDoctorPaciente.innerText = normalizarTexto(obtenerPacienteDoctor(item));
    elDoctorModulo.innerText = normalizarTexto(obtenerNombreDoctor(item), "CONSULTA");
    elDoctorHora.innerText = `HORA: ${formatearHora(obtenerHoraDoctor(item))}`;
}

function renderPrincipalRecepcion(item) {
    elRecepcionPaciente.innerText = normalizarTexto(obtenerNombrePaciente(item));
    elRecepcionModulo.innerText = normalizarTexto(obtenerNombreRecepcion(item));
    elRecepcionHora.innerText = `HORA: ${formatearHora(obtenerHoraRecepcion(item))}`;
}

function renderVacioDoctor() {
    elDoctorPaciente.innerText = "---";
    elDoctorModulo.innerText = "ESPERANDO...";
    elDoctorHora.innerText = "---";
}

function renderVacioRecepcion() {
    elRecepcionPaciente.innerText = "---";
    elRecepcionModulo.innerText = "ESPERANDO...";
    elRecepcionHora.innerText = "---";
}

/* =========================
   HISTORIALES
========================= */
function crearFilaHistorial({ nombre, modulo, hora, tipo }) {
    const row = document.createElement("div");
    row.className = `hist-row ${tipo === "doctor" ? "doctor-row" : "recepcion-row"}`;

    row.innerHTML = `
        <div style="min-width:0;">
            <div class="hist-name">${normalizarTexto(nombre)}</div>
            <div class="hist-doc">${normalizarTexto(modulo)}</div>
        </div>
        <div class="hist-meta">${formatearHora(hora)}</div>
    `;

    return row;
}

function renderHistorialDoctor(items) {
    elHistorialDoctor.innerHTML = "";

    if (!items.length) {
        const row = crearFilaHistorial({
            nombre: "SIN LLAMADOS",
            modulo: "AÚN NO HAY PACIENTES LLAMADOS",
            hora: null,
            tipo: "doctor"
        });
        row.querySelector(".hist-meta").innerText = "---";
        elHistorialDoctor.appendChild(row);
        return;
    }

    items.forEach((item) => {
        elHistorialDoctor.appendChild(
            crearFilaHistorial({
                nombre: obtenerPacienteDoctor(item),
                modulo: obtenerNombreDoctor(item),
                hora: obtenerHoraDoctor(item),
                tipo: "doctor"
            })
        );
    });
}

function renderHistorialRecepcion(items) {
    elHistorialRecepcion.innerHTML = "";

    if (!items.length) {
        const row = crearFilaHistorial({
            nombre: "SIN LLAMADOS",
            modulo: "AÚN NO HAY PACIENTES LLAMADOS",
            hora: null,
            tipo: "recepcion"
        });
        row.querySelector(".hist-meta").innerText = "---";
        elHistorialRecepcion.appendChild(row);
        return;
    }

    items.forEach((item) => {
        elHistorialRecepcion.appendChild(
            crearFilaHistorial({
                nombre: obtenerNombrePaciente(item),
                modulo: obtenerNombreRecepcion(item),
                hora: obtenerHoraRecepcion(item),
                tipo: "recepcion"
            })
        );
    });
}

/* =========================
   FILTROS
========================= */
function filtrarLlamadosRecepcion(items) {
    return items
        .filter((item) => {
            const horaMs = obtenerOrdenRecepcionMs(item);
            const tieneModulo = !!String(obtenerNombreRecepcion(item) || "").trim();

            if (!horaMs || !tieneModulo) return false;
            if (resetDesdeRecepcionMs && horaMs <= resetDesdeRecepcionMs) return false;

            return true;
        })
        .sort(
            (a, b) => obtenerOrdenRecepcionMs(b) - obtenerOrdenRecepcionMs(a)
        );
}

function filtrarLlamadosDoctor(items) {
    return items
        .filter((item) => {
            const horaMs = obtenerOrdenDoctorMs(item);

            if (!horaMs) return false;
            if (!esLlamadoDoctor(item)) return false;
            if (resetDesdeDoctorMs && horaMs <= resetDesdeDoctorMs) return false;

            return true;
        })
        .sort(
            (a, b) => obtenerOrdenDoctorMs(b) - obtenerOrdenDoctorMs(a)
        );
}

/* =========================
   REFRESCO
========================= */
function refrescarPantallaDoctor() {
    const llamados = filtrarLlamadosDoctor(agendadosCache);

    if (!llamados.length) {
        renderVacioDoctor();
        renderHistorialDoctor([]);
        ultimaClaveDoctor = "";
        primerRenderDoctor = true;
        return;
    }

    const actual = llamados[0];
    const claveActual = construirClaveDoctor(actual);

    renderPrincipalDoctor(actual);
    renderHistorialDoctor(llamados.slice(0, 5));

    if (!primerRenderDoctor) {
        ultimaClaveDoctor = claveActual;
        primerRenderDoctor = true;
        return;
    }

    if (claveActual !== ultimaClaveDoctor) {
        reproducirSonido();
        destacarLlamado(elContainerDoctor);
        ultimaClaveDoctor = claveActual;
    }
}

function refrescarPantallaRecepcion() {
    const llamados = filtrarLlamadosRecepcion(agendadosCache);

    if (!llamados.length) {
        renderVacioRecepcion();
        renderHistorialRecepcion([]);
        ultimaClaveRecepcion = "";
        primerRenderRecepcion = true;
        return;
    }

    const actual = llamados[0];
    const claveActual = construirClaveRecepcion(actual);

    renderPrincipalRecepcion(actual);
    renderHistorialRecepcion(llamados.slice(0, 5));

    if (!primerRenderRecepcion) {
        ultimaClaveRecepcion = claveActual;
        primerRenderRecepcion = true;
        return;
    }

    if (claveActual !== ultimaClaveRecepcion) {
        reproducirSonido();
        destacarLlamado(elContainerRecepcion);
        ultimaClaveRecepcion = claveActual;
    }
}

function refrescarPantallaCompleta() {
    refrescarPantallaDoctor();
    refrescarPantallaRecepcion();
}

/* =========================
   RESET SOLO TV
========================= */
async function resetearTv() {
    const confirmar = window.confirm(
        "¿Seguro que quieres resetear la TV?\n\nEsto limpiará solo la visualización de la TV, sin borrar datos clínicos."
    );

    if (!confirmar) return;

    elBtnResetTv.disabled = true;
    elBtnResetTv.textContent = "Reseteando...";

    try {
        await setDoc(
            refTvConfig,
            {
                reset_desde_doctor: serverTimestamp(),
                reset_desde_recepcion: serverTimestamp(),
                actualizado_en: serverTimestamp()
            },
            { merge: true }
        );

        alert("TV reseteada correctamente.");
    } catch (error) {
        console.error("Error al resetear TV:", error);
        alert("No se pudo resetear la TV.");
    } finally {
        elBtnResetTv.disabled = false;
        elBtnResetTv.textContent = "Resetear TV";
    }
}

/* =========================
   EVENTOS
========================= */
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

/* =========================
   SNAPSHOT CONFIG TV
========================= */
onSnapshot(
    refTvConfig,
    (snap) => {
        const data = snap.exists() ? snap.data() : {};
        const resetGeneralMs = obtenerTimestampMs(data.reset_desde);

        resetDesdeDoctorMs = obtenerTimestampMs(data.reset_desde_doctor) || resetGeneralMs || 0;
        resetDesdeRecepcionMs = obtenerTimestampMs(data.reset_desde_recepcion) || resetGeneralMs || 0;

        refrescarPantallaCompleta();
    },
    (error) => {
        console.error("Error leyendo tv_config:", error);
    }
);

/* =========================
   SNAPSHOT AGENDADOS
========================= */
onSnapshot(
    collection(db, "agendados"),
    (snapshot) => {
        agendadosCache = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
        }));

        console.log("AGENDADOS TV:", agendadosCache);

        agendadosCache.forEach((item, index) => {
            console.log(`DOC ${index + 1}`, item);
        });

        refrescarPantallaCompleta();
    },
    (error) => {
        console.error("Error escuchando agendados:", error);
        renderVacioDoctor();
        renderHistorialDoctor([]);
        renderVacioRecepcion();
        renderHistorialRecepcion([]);
    }
);