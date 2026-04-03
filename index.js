import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore,
    collection,
    query,
    where,
    getDocs,
    doc,
    updateDoc,
    getDoc,
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

const CL_TIMEZONE = "America/Santiago";
const APP_VERSION = "Totem v2026.04.03.01";

/* URL fija del pase en GitHub Pages */
const PASE_BASE_URL = "https://ccarvajal-hub.github.io/ProyectoClinicaFinal/pase-paciente.html";

const input = document.getElementById("rutInput");
const btn = document.getElementById("btnConfirmar");
const btnBorrar = document.getElementById("btnBorrar");
const keypadButtons = document.querySelectorAll(".key[data-key]");

const modal = document.getElementById("modalConfirmacion");
const modalTitulo = document.getElementById("modalTitulo");
const modalMensaje = document.getElementById("modalMensaje");
const btnCerrarModal = document.getElementById("btnCerrarModal");

const qrModal = document.getElementById("qrModal");
const qrCodeContainer = document.getElementById("qrCode");

const resNombre = document.getElementById("resNombre");
const resDoctor = document.getElementById("resDoctor");
const resUbicacion = document.getElementById("resUbicacion");

const customAlert = document.getElementById("customAlert");
const customAlertText = document.getElementById("customAlertText");

const modalSound = document.getElementById("modalSound");
const alertSound = document.getElementById("alertSound");

let resetTimer = null;
let modalTimer = null;
let alertTimer = null;
let procesandoConfirmacion = false;
let uiAudioCtx = null;

const MODAL_AUTO_CLOSE_MS = 12000;
const ALERT_AUTO_CLOSE_MS = 8000;
const INPUT_AUTO_RESET_MS = 10000;

/* =========================
   SONIDOS UI
========================= */
function getUiAudioContext() {
    try {
        if (!uiAudioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return null;
            uiAudioCtx = new AudioContextClass();
        }

        if (uiAudioCtx.state === "suspended") {
            uiAudioCtx.resume().catch(() => {});
        }

        return uiAudioCtx;
    } catch (error) {
        console.warn("No se pudo crear AudioContext:", error);
        return null;
    }
}

function reproducirBeep({
    frequency = 880,
    type = "sine",
    duration = 0.08,
    volume = 0.03,
    endFrequency = null
} = {}) {
    try {
        const ctx = getUiAudioContext();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, ctx.currentTime);

        if (typeof endFrequency === "number") {
            osc.frequency.linearRampToValueAtTime(endFrequency, ctx.currentTime + duration);
        }

        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + duration + 0.01);
    } catch (error) {
        console.warn("No se pudo reproducir beep:", error);
    }
}

function reproducirSonidoTecla() {
    reproducirBeep({
        frequency: 900,
        type: "sine",
        duration: 0.07,
        volume: 0.03
    });
}

function reproducirSonidoConfirmar() {
    reproducirBeep({
        frequency: 720,
        endFrequency: 980,
        type: "triangle",
        duration: 0.14,
        volume: 0.05
    });
}

/* =========================
   HELPERS RUT / FECHA
========================= */
function limpiarRUT(rut) {
    return String(rut || "").replace(/[^0-9kK]/g, "").toUpperCase();
}

function formatearRUT(rut) {
    const limpio = limpiarRUT(rut).slice(0, 9);

    if (limpio.length <= 1) return limpio;

    const cuerpo = limpio.slice(0, -1);
    const dv = limpio.slice(-1);

    let cuerpoFormateado = "";
    let contador = 0;

    for (let i = cuerpo.length - 1; i >= 0; i--) {
        cuerpoFormateado = cuerpo[i] + cuerpoFormateado;
        contador++;

        if (contador === 3 && i !== 0) {
            cuerpoFormateado = "." + cuerpoFormateado;
            contador = 0;
        }
    }

    return `${cuerpoFormateado}-${dv}`;
}

function validarRUT(rut) {
    const rutLimpio = limpiarRUT(rut);

    if (!/^\d{7,8}[0-9K]$/.test(rutLimpio)) return false;

    const cuerpo = rutLimpio.slice(0, -1);
    const dvIngresado = rutLimpio.slice(-1);

    let suma = 0;
    let multiplo = 2;

    for (let i = cuerpo.length - 1; i >= 0; i--) {
        suma += parseInt(cuerpo[i], 10) * multiplo;
        multiplo = multiplo < 7 ? multiplo + 1 : 2;
    }

    const resto = suma % 11;
    const dvEsperadoNum = 11 - resto;

    let dvEsperado = "";
    if (dvEsperadoNum === 11) dvEsperado = "0";
    else if (dvEsperadoNum === 10) dvEsperado = "K";
    else dvEsperado = String(dvEsperadoNum);

    return dvIngresado === dvEsperado;
}

function obtenerPartesFechaHoraChile() {
    const partes = new Intl.DateTimeFormat("en-CA", {
        timeZone: CL_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).formatToParts(new Date());

    const get = (tipo) => partes.find((p) => p.type === tipo)?.value || "";

    return {
        year: get("year"),
        month: get("month"),
        day: get("day"),
        hour: get("hour"),
        minute: get("minute")
    };
}

function obtenerFechaHoyChile() {
    const { year, month, day } = obtenerPartesFechaHoraChile();
    return `${year}-${month}-${day}`;
}

function obtenerHoraActualChile24() {
    const { hour, minute } = obtenerPartesFechaHoraChile();
    return `${hour}:${minute}`;
}

function obtenerFechaHoraExpiracionFinDiaChile() {
    const { year, month, day } = obtenerPartesFechaHoraChile();
    return `${year}-${month}-${day}T23:59:59`;
}

function horaATotalMinutos(hora) {
    if (!hora || typeof hora !== "string") return 999999;

    const [hh, mm] = hora.split(":").map(Number);

    if (Number.isNaN(hh) || Number.isNaN(mm)) return 999999;

    return hh * 60 + mm;
}

function normalizarEstado(estado) {
    return String(estado || "pendiente").toLowerCase().trim();
}

function seleccionarCitaCorrecta(docs) {
    const prioridadEstado = {
        pendiente: 0,
        agendado: 0,
        confirmado: 0,
        llegado: 1,
        en_recepcion: 1,
        pagado: 1,
        llamando: 1,
        llamado: 1,
        atendiendo: 1,
        atendido: 2
    };

    const citasValidas = docs
        .map((item) => ({
            doc: item,
            data: item.data(),
            estado: normalizarEstado(item.data().estado)
        }))
        .filter((item) => item.estado in prioridadEstado);

    if (citasValidas.length === 0) return null;

    citasValidas.sort((a, b) => {
        const prioridadA = prioridadEstado[a.estado];
        const prioridadB = prioridadEstado[b.estado];

        if (prioridadA !== prioridadB) {
            return prioridadA - prioridadB;
        }

        const horaA = horaATotalMinutos(a.data.hora_consulta);
        const horaB = horaATotalMinutos(b.data.hora_consulta);

        return horaA - horaB;
    });

    return citasValidas[0].doc;
}

/* =========================
   TIMERS / ALERTAS
========================= */
function cancelarResetInput() {
    if (resetTimer) {
        clearTimeout(resetTimer);
        resetTimer = null;
    }
}

function cancelarAutoCierreModal() {
    if (modalTimer) {
        clearTimeout(modalTimer);
        modalTimer = null;
    }
}

function cancelarAutoCierreAlert() {
    if (alertTimer) {
        clearTimeout(alertTimer);
        alertTimer = null;
    }
}

function resetearInputRUT() {
    cancelarResetInput();
    if (input) input.value = "";
}

function programarResetInput() {
    cancelarResetInput();

    if (!input || !btn || !modal) return;
    if (!input.value.trim()) return;
    if (btn.disabled) return;
    if (modal.style.display === "flex") return;

    resetTimer = setTimeout(() => {
        if (!btn.disabled && modal.style.display !== "flex") {
            input.value = "";
        }
    }, INPUT_AUTO_RESET_MS);
}

function reproducirSonidoModal() {
    if (!modalSound) return;

    modalSound.currentTime = 0;
    modalSound.play().catch(() => {
        console.warn("No se pudo reproducir el sonido del modal.");
    });
}

function reproducirSonidoAlerta() {
    if (!alertSound) return;

    alertSound.currentTime = 0;
    alertSound.play().catch(() => {
        console.warn("No se pudo reproducir el sonido de la alerta.");
    });
}

function ocultarAlerta() {
    cancelarAutoCierreAlert();
    if (customAlert) customAlert.classList.remove("show");
}

function mostrarAlerta(mensaje) {
    cancelarAutoCierreAlert();

    if (!customAlert || !customAlertText) return;

    customAlertText.textContent = mensaje;
    customAlert.classList.add("show");

    reproducirSonidoAlerta();

    alertTimer = setTimeout(() => {
        ocultarAlerta();
    }, ALERT_AUTO_CLOSE_MS);
}

/* =========================
   DOCTOR
========================= */
function construirUbicacionDoctor(piso, consulta) {
    const pisoTexto = String(piso ?? "").trim();
    const consultaTexto = String(consulta ?? "").trim();

    if (pisoTexto && consultaTexto) return `Piso ${pisoTexto} - Consulta ${consultaTexto}`;
    if (pisoTexto) return `Piso ${pisoTexto}`;
    if (consultaTexto) return `Consulta ${consultaTexto}`;

    return "Por confirmar";
}

async function obtenerDatosDoctor(doctorId) {
    let nombreDoctorMostrar = "Doctor asignado";
    let ubicacionMostrar = "Por confirmar";

    if (!doctorId) {
        return { nombreDoctorMostrar, ubicacionMostrar };
    }

    const uidBuscado = String(doctorId).trim();

    try {
        const qDoctores = query(
            collection(db, "doctores"),
            where("uid", "==", uidBuscado)
        );

        const querySnapshot = await getDocs(qDoctores);

        if (querySnapshot.empty) {
            return { nombreDoctorMostrar, ubicacionMostrar };
        }

        const doctorData = querySnapshot.docs[0].data();

        nombreDoctorMostrar =
            doctorData.nombre ||
            doctorData.nombre_doctor ||
            doctorData.displayName ||
            "Doctor asignado";

        ubicacionMostrar = construirUbicacionDoctor(
            doctorData.piso,
            doctorData.consulta
        );

        return { nombreDoctorMostrar, ubicacionMostrar };
    } catch (error) {
        console.error("Error obteniendo datos del doctor:", error);
        return { nombreDoctorMostrar, ubicacionMostrar };
    }
}

/* =========================
   PASE PACIENTE / QR
========================= */
function construirUrlPase(passId) {
    return `${PASE_BASE_URL}?pass=${encodeURIComponent(passId)}`;
}

function limpiarQRCode() {
    if (qrCodeContainer) {
        qrCodeContainer.innerHTML = "";
    }
}

function mostrarQrModal() {
    if (qrModal) {
        qrModal.style.display = "flex";
    }
}

function ocultarQrModal() {
    if (qrModal) {
        qrModal.style.display = "none";
    }
}

function renderizarQRCode(passUrl) {
    if (!qrCodeContainer) return;

    limpiarQRCode();

    if (typeof window.QRCode !== "function") {
        console.warn("QRCode library no está disponible.");
        return;
    }

    new window.QRCode(qrCodeContainer, {
        text: passUrl,
        width: 240,
        height: 240,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.H
    });

    setTimeout(() => {
        const qrImg = qrCodeContainer.querySelector("img");
        const qrCanvas = qrCodeContainer.querySelector("canvas");

        if (qrImg) {
            qrImg.style.width = "240px";
            qrImg.style.height = "240px";
            qrImg.style.display = "block";
            qrImg.style.margin = "0 auto";
            qrImg.style.imageRendering = "crisp-edges";
        }

        if (qrCanvas) {
            qrCanvas.style.width = "240px";
            qrCanvas.style.height = "240px";
            qrCanvas.style.display = "block";
            qrCanvas.style.margin = "0 auto";
            qrCanvas.style.imageRendering = "crisp-edges";
        }
    }, 50);
}

async function crearPasePaciente({ agendadoId }) {
    const paseRef = doc(collection(db, "pases_paciente"));
    const passId = paseRef.id;

    await setDoc(paseRef, {
        pass_id: passId,
        agendado_id: agendadoId,
        activo: true,
        push_enabled: false,
        push_token: "",
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        expira_at: obtenerFechaHoraExpiracionFinDiaChile()
    });

    return passId;
}

/* =========================
   MODAL
========================= */
function abrirModal({
    titulo,
    tipo,
    mensaje,
    nombre,
    doctor,
    ubicacion,
    autoClose = true
}) {
    cancelarAutoCierreModal();
    ocultarAlerta();

    if (modalTitulo) {
        modalTitulo.textContent = titulo;
        modalTitulo.className = tipo;
    }

    if (resNombre) resNombre.innerText = nombre || "---";
    if (resDoctor) resDoctor.innerText = doctor || "Doctor asignado";
    if (resUbicacion) resUbicacion.innerText = ubicacion || "---";
    if (modalMensaje) modalMensaje.textContent = mensaje || "";

    if (modal) modal.style.display = "flex";
    if (input) input.value = "";

    reproducirSonidoModal();

    if (autoClose) {
        modalTimer = setTimeout(() => {
            cerrarModal();
        }, MODAL_AUTO_CLOSE_MS);
    }
}

function cerrarModal() {
    cancelarAutoCierreModal();

    if (modal) modal.style.display = "none";

    ocultarQrModal();
    limpiarQRCode();
    resetearInputRUT();
}

/* =========================
   FIREBASE BUSQUEDA
========================= */
async function buscarCitasHoyPorRut(rutLimpio, fechaHoy) {
    const resultados = [];
    const idsVistos = new Set();

    const variantesRUT = [rutLimpio];

    if (rutLimpio.endsWith("K")) {
        variantesRUT.push(rutLimpio.slice(0, -1) + "k");
    }

    for (const rutVariante of variantesRUT) {
        const q = query(
            collection(db, "agendados"),
            where("rut", "==", rutVariante),
            where("fecha_turno", "==", fechaHoy)
        );

        const querySnapshot = await getDocs(q);

        querySnapshot.forEach((docSnap) => {
            if (!idsVistos.has(docSnap.id)) {
                idsVistos.add(docSnap.id);
                resultados.push(docSnap);
            }
        });
    }

    return resultados;
}

/* =========================
   TECLADO
========================= */
function agregarCaracterAlRut(caracter) {
    if (!input) return;

    const limpioActual = limpiarRUT(input.value);

    if (limpioActual.length >= 9) return;

    input.value = formatearRUT(limpioActual + caracter);
    programarResetInput();
}

function borrarUltimoCaracterRut() {
    if (!input) return;

    const limpioActual = limpiarRUT(input.value);

    if (!limpioActual.length) return;

    input.value = formatearRUT(limpioActual.slice(0, -1));
    programarResetInput();
}

/* =========================
   IMPRESION
========================= */
function construirTextoTicket({ nombre, rut, doctor, ubicacion, hora }) {
    const nombreFmt = (nombre || "---").toUpperCase();
    const doctorFmt = (doctor || "---").toUpperCase();
    const ubicacionFmt = (ubicacion || "---").toUpperCase();
    const horaFmt = hora || "--:--";
    const rutFmt = rut || "---";

    const textoTicket = `CLINICA CEMO
------------------------------

HORA: ${horaFmt}

LLEGADA CONFIRMADA
------------------------------
PACIENTE: ${nombreFmt}
RUT: ${rutFmt}
DOCTOR: ${doctorFmt}
UBICACION: ${ubicacionFmt}
------------------------------
POR FAVOR, DIRIJASE A RECEPCION
ESPERE SU LLAMADO
------------------------------`;

    return textoTicket;
}

function imprimirTicketSiExisteAndroid(datosTicket) {
    try {
        if (window.Android && typeof window.Android.printTicket === "function") {
            const ticketText = construirTextoTicket(datosTicket);
            window.Android.printTicket(ticketText);
        } else {
            console.warn("Android.printTicket no está disponible.");
        }
    } catch (error) {
        console.error("Error al imprimir ticket:", error);
    }
}

/* =========================
   BOTON
========================= */
function setBotonProcesando(estaProcesando) {
    if (!btn || !btnBorrar) return;

    btn.disabled = estaProcesando;
    btnBorrar.disabled = estaProcesando;

    if (estaProcesando) {
        btn.textContent = "Procesando...";
    } else {
        btn.textContent = "CONFIRMAR LLEGADA";
    }
}

/* =========================
   FLUJO PRINCIPAL
========================= */
async function confirmarLlegada() {
    if (procesandoConfirmacion || !input) return;

    cancelarResetInput();
    ocultarAlerta();

    const rutLimpio = limpiarRUT(input.value);

    if (!rutLimpio) {
        resetearInputRUT();
        return;
    }

    if (!validarRUT(rutLimpio)) {
        mostrarAlerta("RUT INVÁLIDO. VERIFIQUE E INTENTE NUEVAMENTE.");
        resetearInputRUT();
        return;
    }

    procesandoConfirmacion = true;
    setBotonProcesando(true);

    try {
        const fechaHoy = obtenerFechaHoyChile();
        const citasHoy = await buscarCitasHoyPorRut(rutLimpio, fechaHoy);

        if (citasHoy.length === 0) {
            mostrarAlerta("NO SE ENCONTRÓ UNA CITA PARA HOY CON ESE RUT.");
            resetearInputRUT();
            return;
        }

        const citaSeleccionada = seleccionarCitaCorrecta(citasHoy);

        if (!citaSeleccionada) {
            mostrarAlerta("NO SE ENCONTRÓ UNA CITA VÁLIDA PARA HOY CON ESE RUT.");
            resetearInputRUT();
            return;
        }

        const docSnap = citaSeleccionada;
        const p = docSnap.data();
        const estadoActual = normalizarEstado(p.estado);
        const { nombreDoctorMostrar, ubicacionMostrar } = await obtenerDatosDoctor(p.doctor_id);

        if (estadoActual === "llegado") {
            mostrarAlerta("SU LLEGADA YA FUE REGISTRADA.");
            resetearInputRUT();
            return;
        }

        if (estadoActual === "atendido") {
            mostrarAlerta("SU ATENCIÓN DE HOY YA FUE REALIZADA.");
            resetearInputRUT();
            return;
        }

        const estadosYaRegistrados = [
            "en_recepcion",
            "pagado",
            "llamando",
            "llamado",
            "atendiendo"
        ];

        if (estadosYaRegistrados.includes(estadoActual)) {
            mostrarAlerta("SU LLEGADA YA FUE REGISTRADA.");
            resetearInputRUT();
            return;
        }

        const estadosInicialesValidos = ["pendiente", "agendado", "confirmado"];

        if (!estadosInicialesValidos.includes(estadoActual)) {
            mostrarAlerta("NO SE ENCONTRÓ UNA CITA VÁLIDA PARA HOY CON ESE RUT.");
            resetearInputRUT();
            return;
        }

        const ahora24 = obtenerHoraActualChile24();

        await updateDoc(doc(db, "agendados", docSnap.id), {
            estado: "llegado",
            hora_llegada: ahora24
        });

        const nuevoPassId = await crearPasePaciente({
            agendadoId: docSnap.id
        });

        const passUrl = construirUrlPase(nuevoPassId);

        console.log("Pase paciente creado:", nuevoPassId);
        console.log("URL pase:", passUrl);

        renderizarQRCode(passUrl);
        mostrarQrModal();

        abrirModal({
            titulo: "LLEGADA CONFIRMADA",
            tipo: "success",
            mensaje: "Por favor, diríjase a recepción.",
            nombre: p.nombre,
            doctor: nombreDoctorMostrar,
            ubicacion: ubicacionMostrar
        });

        imprimirTicketSiExisteAndroid({
            nombre: p.nombre,
            rut: formatearRUT(rutLimpio),
            doctor: nombreDoctorMostrar,
            ubicacion: ubicacionMostrar,
            hora: ahora24
        });
    } catch (error) {
        console.error(error);
        mostrarAlerta("ERROR AL PROCESAR.");
        resetearInputRUT();
    } finally {
        procesandoConfirmacion = false;
        setBotonProcesando(false);
    }
}

/* =========================
   FECHA / HORA + VERSION
========================= */
function asegurarVersionEnPantalla() {
    const versionEl = document.getElementById("appVersion");
    if (!versionEl) return;

    versionEl.textContent = APP_VERSION;
}

function actualizarFechaHora() {
    const fechaEl = document.getElementById("fechaActual");
    const horaEl = document.getElementById("horaActual");

    if (!fechaEl || !horaEl) return;

    const ahora = new Date();

    try {
        const fechaLarga = ahora.toLocaleDateString("es-CL", {
            timeZone: CL_TIMEZONE,
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric"
        });

        const hora24 = ahora.toLocaleTimeString("es-CL", {
            timeZone: CL_TIMEZONE,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        });

        fechaEl.textContent =
            fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1);

        horaEl.textContent = hora24;
    } catch (error) {
        const fechaLarga = ahora.toLocaleDateString("es-CL", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric"
        });

        const hora24 = ahora.toLocaleTimeString("es-CL", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        });

        fechaEl.textContent =
            fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1);

        horaEl.textContent = hora24;
    }
}

/* =========================
   GESTOS
========================= */
function bloquearGestosNoDeseados() {
    document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
    document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });
}

/* =========================
   EVENTOS
========================= */
keypadButtons.forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
        event.preventDefault();

        const key = button.dataset.key;
        if (!key || (btn && btn.disabled)) return;

        reproducirSonidoTecla();
        agregarCaracterAlRut(key);
    });
});

if (btnBorrar) {
    btnBorrar.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (btn && btn.disabled) return;

        reproducirSonidoTecla();
        borrarUltimoCaracterRut();
    });
}

if (btn) {
    btn.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (btn.disabled) return;

        reproducirSonidoConfirmar();
        confirmarLlegada();
    });
}

if (btnCerrarModal) {
    btnCerrarModal.addEventListener("click", cerrarModal);
}

if (modal) {
    modal.addEventListener("click", (event) => {
        if (event.target === modal) {
            cerrarModal();
        }
    });
}

document.addEventListener("keydown", (event) => {
    if (btn && btn.disabled) return;

    if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        agregarCaracterAlRut(event.key);
        return;
    }

    if (event.key === "k" || event.key === "K") {
        event.preventDefault();
        agregarCaracterAlRut("K");
        return;
    }

    if (event.key === "Backspace") {
        event.preventDefault();
        borrarUltimoCaracterRut();
        return;
    }

    if (event.key === "Enter") {
        event.preventDefault();
        confirmarLlegada();
    }

    if (event.key === "Escape" && modal && modal.style.display === "flex") {
        event.preventDefault();
        cerrarModal();
    }
});

document.addEventListener("DOMContentLoaded", () => {
    asegurarVersionEnPantalla();
    actualizarFechaHora();
    setInterval(actualizarFechaHora, 1000);
    ocultarQrModal();
    limpiarQRCode();
});

window.addEventListener("load", () => {
    bloquearGestosNoDeseados();
    resetearInputRUT();
});