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
const APP_VERSION = "Totem v2026.04.12_02";

/* URL fija del pase en GitHub Pages */
const PASE_BASE_URL = "https://ccarvajal-hub.github.io/ProyectoClinicaFinal/pase-paciente.html";

const ESTADOS = {
    PENDIENTE: "pendiente",
    LLEGADO: "llegado",
    LLAMADO_RECEPCION: "llamado_recepcion",
    PAGO_MANUAL: "pago_manual",
    PAGADO: "pagado",
    LLAMADO_DOCTOR: "llamado_doctor",
    ATENDIDO: "atendido"
};

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

let resetTimer = null;
let modalTimer = null;
let alertTimer = null;
let procesandoConfirmacion = false;
let uiAudioCtx = null;

const MODAL_AUTO_CLOSE_MS = 12000;
const ALERT_AUTO_CLOSE_MS = 8000;
const INPUT_AUTO_RESET_MS = 10000;

let modalContext = {
    type: "info",
    selectedAppointment: null,
    autoCloseAction: null,
    passDraftId: null,
    passDraftUrl: "",
    closingByAction: false
};

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
    return String(estado || ESTADOS.PENDIENTE)
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "_");
}

function estadoEsPendiente(estado) {
    const e = normalizarEstado(estado);
    return e === ESTADOS.PENDIENTE || e === "agendado" || e === "confirmado";
}

function estadoEsAtendido(estado) {
    return normalizarEstado(estado) === ESTADOS.ATENDIDO;
}

function estadoEsEnProceso(estado) {
    const e = normalizarEstado(estado);

    return [
        ESTADOS.LLEGADO,
        ESTADOS.LLAMADO_RECEPCION,
        ESTADOS.PAGO_MANUAL,
        ESTADOS.PAGADO,
        ESTADOS.LLAMADO_DOCTOR,
        "en_recepcion",
        "llamado",
        "llamando",
        "atendiendo"
    ].includes(e);
}

function textoEstadoHumano(estado) {
    const e = normalizarEstado(estado);

    if (estadoEsPendiente(e)) return "Pendiente";
    if (e === ESTADOS.LLEGADO) return "Ya registraste tu llegada";
    if (e === ESTADOS.LLAMADO_RECEPCION || e === "en_recepcion") return "En recepción";
    if (e === ESTADOS.PAGO_MANUAL) return "Pago manual";
    if (e === ESTADOS.PAGADO) return "Pagado";
    if (e === ESTADOS.LLAMADO_DOCTOR || e === "llamado" || e === "llamando" || e === "atendiendo") return "En atención";
    if (e === ESTADOS.ATENDIDO) return "Atendido";

    return "No disponible";
}

function ordenarCitasPorHoraAsc(citas) {
    return [...citas].sort((a, b) => {
        return horaATotalMinutos(a.data.hora_consulta) - horaATotalMinutos(b.data.hora_consulta);
    });
}

function clasificarCitas(citasDocs) {
    const citas = citasDocs.map((docSnap) => ({
        id: docSnap.id,
        ref: docSnap,
        data: docSnap.data(),
        estadoNormalizado: normalizarEstado(docSnap.data().estado)
    }));

    const pendientes = ordenarCitasPorHoraAsc(
        citas.filter((cita) => estadoEsPendiente(cita.estadoNormalizado))
    );

    const enProceso = ordenarCitasPorHoraAsc(
        citas.filter((cita) => estadoEsEnProceso(cita.estadoNormalizado))
    );

    const atendidas = ordenarCitasPorHoraAsc(
        citas.filter((cita) => estadoEsAtendido(cita.estadoNormalizado))
    );

    return { citas, pendientes, enProceso, atendidas };
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
    if (input) {
        input.value = "";
        input.blur();
    }
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
            input.blur();
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

    const idBuscado = String(doctorId).trim();

    try {
        const docDirecto = await getDoc(doc(db, "doctores", idBuscado));

        if (docDirecto.exists()) {
            const doctorData = docDirecto.data();

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
        }

        const qDoctores = query(
            collection(db, "doctores"),
            where("uid", "==", idBuscado)
        );

        const querySnapshot = await getDocs(qDoctores);

        if (!querySnapshot.empty) {
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
        }

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

function limpiarQRCodeEnModal() {
    const extra = asegurarContenedorExtraModal();
    if (!extra) return;

    const qrWrapper = extra.querySelector("#qrFinalWrapper");
    if (qrWrapper) {
        qrWrapper.innerHTML = "";
    }
}

function renderizarQRCodeEnModal(passUrl) {
    const extra = asegurarContenedorExtraModal();
    if (!extra || !passUrl) return;

    let qrWrapper = extra.querySelector("#qrFinalWrapper");

    if (!qrWrapper) {
        qrWrapper = document.createElement("div");
        qrWrapper.id = "qrFinalWrapper";
        qrWrapper.style.display = "flex";
        qrWrapper.style.justifyContent = "center";
        qrWrapper.style.alignItems = "center";
        qrWrapper.style.marginTop = "14px";
        extra.appendChild(qrWrapper);
    }

    qrWrapper.innerHTML = "";

    if (typeof window.QRCode !== "function") {
        console.warn("QRCode library no está disponible.");
        return;
    }

    new window.QRCode(qrWrapper, {
        text: passUrl,
        width: 220,
        height: 220,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.H
    });

    setTimeout(() => {
        const qrImg = qrWrapper.querySelector("img");
        const qrCanvas = qrWrapper.querySelector("canvas");

        if (qrImg) {
            qrImg.style.width = "220px";
            qrImg.style.height = "220px";
            qrImg.style.display = "block";
            qrImg.style.margin = "0 auto";
            qrImg.style.imageRendering = "crisp-edges";
        }

        if (qrCanvas) {
            qrCanvas.style.width = "220px";
            qrCanvas.style.height = "220px";
            qrCanvas.style.display = "block";
            qrCanvas.style.margin = "0 auto";
            qrCanvas.style.imageRendering = "crisp-edges";
        }
    }, 50);
}

async function crearPasePacienteBorrador({ agendadoId }) {
    const paseRef = doc(collection(db, "pases_paciente"));
    const passId = paseRef.id;

    await setDoc(paseRef, {
        pass_id: passId,
        agendado_id: agendadoId,
        activo: false,
        push_enabled: false,
        push_token: "",
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        expira_at: obtenerFechaHoraExpiracionFinDiaChile()
    });

    return passId;
}

async function activarPasePaciente(passId) {
    if (!passId) return;

    await updateDoc(doc(db, "pases_paciente", passId), {
        activo: true,
        updated_at: serverTimestamp()
    });
}

/* =========================
   MODAL HELPERS
========================= */
function asegurarContenedorExtraModal() {
    if (!modal) return null;

    let extra = modal.querySelector("#modalExtraContent");

    if (!extra) {
        extra = document.createElement("div");
        extra.id = "modalExtraContent";
        extra.style.width = "100%";
        extra.style.marginTop = "14px";
        extra.style.display = "none";

        const parent = modalMensaje?.parentElement || modal;
        parent.appendChild(extra);
    }

    return extra;
}

function limpiarContenidoExtraModal() {
    const extra = asegurarContenedorExtraModal();
    if (!extra) return;

    extra.innerHTML = "";
    extra.style.display = "none";
}

function configurarBotonModal(texto = "CERRAR") {
    if (!btnCerrarModal) return;

    if (!texto) {
        btnCerrarModal.style.display = "none";
        return;
    }

    btnCerrarModal.style.display = "flex";
    btnCerrarModal.textContent = texto;
}

function obtenerBloqueInfo(el) {
    if (!el) return null;

    return (
        el.closest(".info-item") ||
        el.closest(".result-item") ||
        el.closest(".result-row") ||
        el.closest(".info-row") ||
        el.parentElement
    );
}

function mostrarOcultarInfoModal(mostrar) {
    const infoBox = modal?.querySelector(".info-box");
    if (infoBox) {
        infoBox.style.display = mostrar ? "" : "none";
    }

    const bloques = [
        obtenerBloqueInfo(resNombre),
        obtenerBloqueInfo(resDoctor),
        obtenerBloqueInfo(resUbicacion)
    ];

    bloques.forEach((bloque) => {
        if (!bloque) return;
        bloque.style.display = mostrar ? "" : "none";
    });
}

function mostrarOcultarMensajeModal(mostrar, texto = "") {
    if (!modalMensaje) return;

    modalMensaje.textContent = texto || "";

    if (mostrar && texto && texto.trim()) {
        modalMensaje.style.display = "";
    } else {
        modalMensaje.style.display = "none";
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
    autoClose = true,
    buttonText = "CERRAR",
    contextType = "info",
    selectedAppointment = null,
    autoCloseAction = null,
    passDraftId = null,
    passDraftUrl = "",
    ocultarInfo = false,
    ocultarMensaje = false
}) {
    cancelarAutoCierreModal();
    ocultarAlerta();
    limpiarContenidoExtraModal();

    modalContext = {
        type: contextType,
        selectedAppointment,
        autoCloseAction,
        passDraftId,
        passDraftUrl,
        closingByAction: false
    };

    if (modalTitulo) {
        modalTitulo.textContent = titulo;
        modalTitulo.className = tipo;
    }

    if (resNombre) resNombre.innerText = nombre || "---";
    if (resDoctor) resDoctor.innerText = doctor || "Doctor asignado";
    if (resUbicacion) resUbicacion.innerText = ubicacion || "---";

    mostrarOcultarInfoModal(!ocultarInfo);
    mostrarOcultarMensajeModal(!ocultarMensaje, mensaje || "");
    configurarBotonModal(buttonText);

    if (modal) modal.style.display = "flex";
    if (input) {
        input.value = "";
        input.blur();
    }

    reproducirSonidoModal();

    if (autoClose) {
        modalTimer = setTimeout(async () => {
            await ejecutarAutoCierreModal();
        }, MODAL_AUTO_CLOSE_MS);
    }
}

async function ejecutarAutoCierreModal() {
    cancelarAutoCierreModal();

    if (typeof modalContext.autoCloseAction === "function") {
        try {
            modalContext.closingByAction = true;
            await modalContext.autoCloseAction();
        } catch (error) {
            console.error("Error en autocierre del modal:", error);
            cerrarModal();
        } finally {
            modalContext.closingByAction = false;
        }
        return;
    }

    cerrarModal();
}

function cerrarModal() {
    cancelarAutoCierreModal();

    if (modal) modal.style.display = "none";

    limpiarContenidoExtraModal();
    limpiarQRCodeEnModal();
    mostrarOcultarInfoModal(true);
    mostrarOcultarMensajeModal(true, "");
    resetearInputRUT();

    modalContext = {
        type: "info",
        selectedAppointment: null,
        autoCloseAction: null,
        passDraftId: null,
        passDraftUrl: "",
        closingByAction: false
    };
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

    return `CLINICA CEMO
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
    btn.textContent = estaProcesando ? "Procesando..." : "CONFIRMAR LLEGADA";
}

/* =========================
   FLUJO CITA / MODALES
========================= */
async function registrarLlegadaFinal(cita, passDraftId) {
    if (!cita?.id || !cita?.data) {
        cerrarModal();
        return;
    }

    const p = cita.data;
    const rutLimpio = limpiarRUT(p.rut || "");
    const ahora24 = obtenerHoraActualChile24();

    try {
        await updateDoc(doc(db, "agendados", cita.id), {
            estado: ESTADOS.LLEGADO,
            hora_llegada: ahora24
        });

        await activarPasePaciente(passDraftId);

        const { nombreDoctorMostrar, ubicacionMostrar } = await obtenerDatosDoctor(p.doctor_id);

        imprimirTicketSiExisteAndroid({
            nombre: p.nombre,
            rut: formatearRUT(rutLimpio),
            doctor: nombreDoctorMostrar,
            ubicacion: ubicacionMostrar,
            hora: ahora24
        });

        cerrarModal();
    } catch (error) {
        console.error("Error al registrar llegada final:", error);
        mostrarAlerta("ERROR AL CONFIRMAR LA LLEGADA.");
        cerrarModal();
    }
}

async function abrirModalFinalConQR(cita) {
    const p = cita.data;
    const { nombreDoctorMostrar, ubicacionMostrar } = await obtenerDatosDoctor(p.doctor_id);

    const passDraftId = await crearPasePacienteBorrador({
        agendadoId: cita.id
    });

    const passDraftUrl = construirUrlPase(passDraftId);

    abrirModal({
        titulo: "LLEGADA CONFIRMADA",
        tipo: "success",
        mensaje: "Por favor, diríjase a recepción.",
        nombre: p.nombre || "---",
        doctor: nombreDoctorMostrar,
        ubicacion: ubicacionMostrar,
        autoClose: true,
        buttonText: "ACEPTAR",
        contextType: "final_confirm",
        selectedAppointment: cita,
        passDraftId,
        passDraftUrl,
        autoCloseAction: async () => {
            await registrarLlegadaFinal(cita, passDraftId);
        }
    });

    const extra = asegurarContenedorExtraModal();
    if (!extra) return;

    extra.innerHTML = "";
    extra.style.display = "block";

    const texto = document.createElement("div");
    texto.style.marginTop = "6px";
    texto.style.textAlign = "center";
    texto.style.fontSize = "0.95rem";
    texto.style.lineHeight = "1.35";
    texto.style.opacity = "0.92";
    texto.textContent = "Al aceptar o al cerrarse este mensaje se activará tu ticket digital e impresión.";

    extra.appendChild(texto);
    renderizarQRCodeEnModal(passDraftUrl);
}

function abrirModalYaIngresado() {
    abrirModal({
        titulo: "YA REGISTRASTE TU LLEGADA",
        tipo: "warning",
        mensaje: "",
        nombre: "",
        doctor: "",
        ubicacion: "",
        autoClose: true,
        buttonText: "CERRAR",
        contextType: "already_registered",
        ocultarInfo: true,
        ocultarMensaje: true
    });

    const extra = asegurarContenedorExtraModal();
    if (!extra) return;

    extra.innerHTML = "";
    extra.style.display = "block";
    extra.style.textAlign = "center";

    const texto = document.createElement("div");
    texto.textContent = "PARA MAYOR INFORMACIÓN, DIRÍJASE A RECEPCIÓN";
    texto.style.fontSize = "1.05rem";
    texto.style.fontWeight = "700";
    texto.style.lineHeight = "1.4";
    texto.style.marginTop = "10px";

    extra.appendChild(texto);
}

function abrirModalYaAtendido() {
    abrirModal({
        titulo: "SU ATENCIÓN YA FUE REALIZADA",
        tipo: "warning",
        mensaje: "",
        nombre: "",
        doctor: "",
        ubicacion: "",
        autoClose: true,
        buttonText: "CERRAR",
        contextType: "already_attended",
        ocultarInfo: true,
        ocultarMensaje: true
    });

    const extra = asegurarContenedorExtraModal();
    if (!extra) return;

    extra.innerHTML = "";
    extra.style.display = "block";
    extra.style.textAlign = "center";

    const texto = document.createElement("div");
    texto.textContent = "PARA MAYOR INFORMACIÓN, DIRÍJASE A RECEPCIÓN";
    texto.style.fontSize = "1.05rem";
    texto.style.fontWeight = "700";
    texto.style.lineHeight = "1.4";
    texto.style.marginTop = "10px";

    extra.appendChild(texto);
}

async function abrirModalSeleccionMultiple(citas, hayCitaEnProceso) {
    abrirModal({
        titulo: "TIENES MÁS DE UNA CITA HOY",
        tipo: "warning",
        mensaje: hayCitaEnProceso
            ? "DEBES TERMINAR TU ATENCIÓN ACTUAL ANTES DE REGISTRAR OTRA CITA."
            : "SELECCIONA LA CITA A LA QUE VIENES:",
        nombre: "---",
        doctor: "---",
        ubicacion: "---",
        autoClose: false,
        buttonText: null,
        contextType: "multi_select",
        ocultarInfo: true
    });

    const extra = asegurarContenedorExtraModal();
    if (!extra) return;

    extra.innerHTML = "";
   extra.style.display = "flex";
extra.style.flexDirection = "column";
extra.style.flex = "1 1 auto";
extra.style.minHeight = "0";

    const lista = document.createElement("div");
    lista.className = "multi-cita-lista";
    lista.style.flex = "1 1 auto";
    lista.style.minHeight = "0";
    lista.style.overflowY = "auto";

    let citaSeleccionada = null;

    const footer = document.createElement("div");
    footer.className = "multi-cita-footer";
    footer.style.flexShrink = "0";
    footer.style.marginTop = "12px";
    footer.style.paddingTop = "10px";
    footer.style.display = "flex";
    footer.style.flexDirection = "column";
    footer.style.alignItems = "center";
    footer.style.gap = "10px";

    const btnAceptar = document.createElement("button");
btnAceptar.type = "button";
btnAceptar.className = "btn-close multi-cita-confirmar";
btnAceptar.textContent = "ACEPTAR";
btnAceptar.style.display = "flex";
btnAceptar.style.width = "100%";
btnAceptar.style.maxWidth = "320px";
btnAceptar.style.flexShrink = "0";
btnAceptar.disabled = true;
btnAceptar.style.opacity = "0.55";
btnAceptar.style.cursor = "not-allowed";

    btnAceptar.addEventListener("click", async () => {
        if (!citaSeleccionada) return;
        await abrirModalFinalConQR(citaSeleccionada);
    });

    for (const cita of ordenarCitasPorHoraAsc(citas)) {
        const p = cita.data;
        const { nombreDoctorMostrar } = await obtenerDatosDoctor(p.doctor_id);

        const boton = document.createElement("button");
        const esPendiente = estadoEsPendiente(cita.estadoNormalizado);
        const habilitado = esPendiente && !hayCitaEnProceso;
        const estadoTexto = textoEstadoHumano(cita.estadoNormalizado).toUpperCase();

        boton.type = "button";
        boton.className = "multi-cita-btn";

        if (!habilitado) {
            boton.classList.add("disabled");
            boton.disabled = true;
        }

        boton.innerHTML = `
            <div class="multi-cita-fila">
                <div class="multi-cita-titulo">
                    <span class="hora">${p.hora_consulta || "--:--"}</span><span class="multi-cita-separador">·</span>${(nombreDoctorMostrar || "").toUpperCase()}
                </div>
                <div class="multi-cita-estado">
                    ${estadoTexto}
                </div>
            </div>
        `;

        if (habilitado) {
            boton.addEventListener("click", () => {
                lista.querySelectorAll(".multi-cita-btn").forEach((b) => b.classList.remove("selected"));
                boton.classList.add("selected");
                citaSeleccionada = cita;
                btnAceptar.disabled = false;
btnAceptar.style.opacity = "1";
btnAceptar.style.cursor = "pointer";
            });
        }

        lista.appendChild(boton);
    }

    const ayuda = document.createElement("div");
    ayuda.className = "multi-cita-ayuda";
    ayuda.textContent = "PARA MAYOR INFORMACIÓN, DIRÍJASE A RECEPCIÓN";

    footer.appendChild(ayuda);
footer.appendChild(btnAceptar);

    extra.appendChild(lista);
    extra.appendChild(footer);
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

        const { pendientes, enProceso, atendidas } = clasificarCitas(citasHoy);
        const totalCitas = pendientes.length + enProceso.length + atendidas.length;

        if (totalCitas >= 2) {
            await abrirModalSeleccionMultiple(
                [...pendientes, ...enProceso, ...atendidas],
                enProceso.length > 0
            );
            return;
        }

        if (pendientes.length === 1) {
            await abrirModalFinalConQR(pendientes[0]);
            return;
        }

        if (enProceso.length === 1) {
            abrirModalYaIngresado();
            return;
        }

        if (atendidas.length === 1) {
            abrirModalYaAtendido();
            return;
        }

        mostrarAlerta("NO SE ENCONTRÓ UNA CITA VÁLIDA PARA HOY CON ESE RUT.");
        resetearInputRUT();
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
    btnCerrarModal.addEventListener("click", async () => {
        if (modalContext.type === "final_confirm" && modalContext.selectedAppointment) {
            await registrarLlegadaFinal(
                modalContext.selectedAppointment,
                modalContext.passDraftId
            );
            return;
        }

        cerrarModal();
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
        return;
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
    limpiarQRCodeEnModal();
});

window.addEventListener("load", () => {
    bloquearGestosNoDeseados();
    resetearInputRUT();
});