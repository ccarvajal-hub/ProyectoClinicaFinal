import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore,
    collection,
    query,
    where,
    getDocs,
    doc,
    updateDoc,
    getDoc
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

const input = document.getElementById("rutInput");
const btn = document.getElementById("btnConfirmar");
const btnBorrar = document.getElementById("btnBorrar");
const keypadButtons = document.querySelectorAll(".key[data-key]");

const modal = document.getElementById("modalConfirmacion");
const modalTitulo = document.getElementById("modalTitulo");
const modalMensaje = document.getElementById("modalMensaje");
const btnCerrarModal = document.getElementById("btnCerrarModal");

const resNombre = document.getElementById("resNombre");
const resDoctor = document.getElementById("resDoctor");
const resUbicacion = document.getElementById("resUbicacion");

const customAlert = document.getElementById("customAlert");
const customAlertText = document.getElementById("customAlertText");

const modalSound = document.getElementById("modalSound");
const alertSound = document.getElementById("alertSound");

const fechaActualEl = document.getElementById("fechaActual");
const horaActualEl = document.getElementById("horaActual");

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
    input.value = "";
}

function programarResetInput() {
    cancelarResetInput();

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
    customAlert.classList.remove("show");
}

function mostrarAlerta(mensaje) {
    cancelarAutoCierreAlert();

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

    if (pisoTexto && consultaTexto) {
        return `Piso ${pisoTexto} - Consulta ${consultaTexto}`;
    }

    if (pisoTexto) {
        return `Piso ${pisoTexto}`;
    }

    if (consultaTexto) {
        return `Consulta ${consultaTexto}`;
    }

    return "Por confirmar";
}

async function obtenerDatosDoctor(doctorId) {
    let nombreDoctorMostrar = "Doctor asignado";
    let ubicacionMostrar = "Por confirmar";

    if (!doctorId) {
        return { nombreDoctorMostrar, ubicacionMostrar };
    }

    const idBuscado = String(doctorId).trim();

    try {
        const docRefDirecto = doc(db, "doctores", idBuscado);
        const docSnapDirecto = await getDoc(docRefDirecto);

        if (docSnapDirecto.exists()) {
            const dData = docSnapDirecto.data();

            nombreDoctorMostrar =
                dData.nombre ||
                dData.nombre_doctor ||
                dData.displayName ||
                "Doctor asignado";

            ubicacionMostrar = construirUbicacionDoctor(dData.piso, dData.consulta);

            return { nombreDoctorMostrar, ubicacionMostrar };
        }

        const qDoctores = query(collection(db, "doctores"));
        const querySnapshot = await getDocs(qDoctores);

        let doctorEncontrado = null;

        querySnapshot.forEach((docSnap) => {
            if (doctorEncontrado) return;

            const data = docSnap.data();

            const posiblesIds = [
                docSnap.id,
                data.uid,
                data.doctor_id,
                data.email
            ]
                .filter(Boolean)
                .map((v) => String(v).trim().toLowerCase());

            if (posiblesIds.includes(idBuscado.toLowerCase())) {
                doctorEncontrado = data;
            }
        });

        if (doctorEncontrado) {
            nombreDoctorMostrar =
                doctorEncontrado.nombre ||
                doctorEncontrado.nombre_doctor ||
                doctorEncontrado.displayName ||
                "Doctor asignado";

            ubicacionMostrar = construirUbicacionDoctor(
                doctorEncontrado.piso,
                doctorEncontrado.consulta
            );
        }

        return { nombreDoctorMostrar, ubicacionMostrar };
    } catch (error) {
        console.error("Error obteniendo datos del doctor:", error);
        return { nombreDoctorMostrar, ubicacionMostrar };
    }
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

    modalTitulo.textContent = titulo;
    modalTitulo.className = tipo;

    resNombre.innerText = nombre || "---";
    resDoctor.innerText = doctor || "Doctor asignado";
    resUbicacion.innerText = (ubicacion || "---").toUpperCase();
    modalMensaje.textContent = (mensaje || "").toUpperCase();

    modal.style.display = "flex";
    input.value = "";

    reproducirSonidoModal();

    if (autoClose) {
        modalTimer = setTimeout(() => {
            cerrarModal();
        }, MODAL_AUTO_CLOSE_MS);
    }
}

function cerrarModal() {
    cancelarAutoCierreModal();
    modal.style.display = "none";
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
    const limpioActual = limpiarRUT(input.value);

    if (limpioActual.length >= 9) return;

    input.value = formatearRUT(limpioActual + caracter);
    programarResetInput();
}

function borrarUltimoCaracterRut() {
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

    const lineas = [
        "CLINICA CEMO",
        "",
        "LLEGADA CONFIRMADA",
        "----------------------",
        "PACIENTE:",
        `${nombreFmt}`,
        "",
        `RUT: ${rut || "---"}`,
        "",
        "DOCTOR:",
        `${doctorFmt}`,
        "",
        "UBICACION:",
        `${ubicacionFmt}`,
        "",
        `HORA: ${hora || "--:--"}`,
        "----------------------",
        "POR FAVOR, DIRIJASE A RECEPCION"
    ];

    return lineas.join("\n");
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
    btn.disabled = estaProcesando;
    btnBorrar.disabled = estaProcesando;

    if (estaProcesando) {
        btn.innerHTML = "<span>Procesando...</span>";
    } else {
        btn.innerHTML = `
            <span>Confirmar llegada</span>
            <span class="btn-arrow">→</span>
        `;
    }
}

/* =========================
   FLUJO PRINCIPAL
========================= */
async function confirmarLlegada() {
    if (procesandoConfirmacion) return;

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

        abrirModal({
            titulo: "LLEGADA CONFIRMADA",
            tipo: "success",
            mensaje: "POR FAVOR, DIRÍJASE A RECEPCIÓN.",
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
   FECHA / HORA
========================= */
function actualizarFechaHora() {
    const ahora = new Date();

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

    if (fechaActualEl) {
        fechaActualEl.textContent =
            fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1);
    }

    if (horaActualEl) {
        horaActualEl.textContent = hora24;
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
        if (!key || btn.disabled) return;

        reproducirSonidoTecla();
        agregarCaracterAlRut(key);
    });
});

btnBorrar.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (btn.disabled) return;

    reproducirSonidoTecla();
    borrarUltimoCaracterRut();
});

btn.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (btn.disabled) return;

    reproducirSonidoConfirmar();
    confirmarLlegada();
});

btnCerrarModal.addEventListener("click", cerrarModal);

modal.addEventListener("click", (event) => {
    if (event.target === modal) {
        cerrarModal();
    }
});

document.addEventListener("keydown", (event) => {
    if (btn.disabled) return;

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

    if (event.key === "Escape" && modal.style.display === "flex") {
        event.preventDefault();
        cerrarModal();
    }
});

window.addEventListener("load", () => {
    actualizarFechaHora();
    setInterval(actualizarFechaHora, 1000);
    bloquearGestosNoDeseados();
    resetearInputRUT();
});