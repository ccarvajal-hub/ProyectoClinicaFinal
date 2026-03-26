import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore,
    collection,
    query,
    where,
    getDocs,
    updateDoc,
    doc,
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

const rutInput = document.getElementById("rutInput");
const btnConfirmar = document.getElementById("btnConfirmar");
const modal = document.getElementById("successModal");
const alertBox = document.getElementById("alertBox");

const modalNombre = document.getElementById("modalNombre");
const modalDoctor = document.getElementById("modalDoctor");
const modalUbicacion = document.getElementById("modalUbicacion");
const modalMensaje = document.getElementById("modalMensaje");
const modalTitulo = document.getElementById("modalTitulo");

const fechaActual = document.getElementById("fechaActual");
const horaActual = document.getElementById("horaActual");

let citaSeleccionada = null;

/* =========================
   HELPERS
========================= */
function soloNumerosYk(valor) {
    return String(valor || "")
        .replace(/[^0-9kK]/g, "")
        .toUpperCase();
}

function limpiarRut(valor) {
    return soloNumerosYk(valor);
}

function formatearRUT(rut) {
    const limpio = limpiarRut(rut);
    if (limpio.length < 2) return limpio;

    const cuerpo = limpio.slice(0, -1);
    const dv = limpio.slice(-1);

    const cuerpoFormateado = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${cuerpoFormateado}-${dv}`;
}

function validarRUT(rut) {
    const limpio = limpiarRut(rut);
    if (!/^\d{7,8}[0-9K]$/.test(limpio)) return false;

    const cuerpo = limpio.slice(0, -1);
    const dv = limpio.slice(-1);

    let suma = 0;
    let multiplo = 2;

    for (let i = cuerpo.length - 1; i >= 0; i--) {
        suma += Number(cuerpo[i]) * multiplo;
        multiplo = multiplo === 7 ? 2 : multiplo + 1;
    }

    const resto = 11 - (suma % 11);
    let dvEsperado = "";

    if (resto === 11) dvEsperado = "0";
    else if (resto === 10) dvEsperado = "K";
    else dvEsperado = String(resto);

    return dv === dvEsperado;
}

function normalizarEstado(estado) {
    return String(estado || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

function obtenerFechaHoyChile() {
    const partes = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Santiago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date());

    const year = partes.find((p) => p.type === "year")?.value;
    const month = partes.find((p) => p.type === "month")?.value;
    const day = partes.find((p) => p.type === "day")?.value;

    return `${year}-${month}-${day}`;
}

function obtenerHoraActualChile24() {
    return new Intl.DateTimeFormat("es-CL", {
        timeZone: "America/Santiago",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).format(new Date());
}

function obtenerFechaVisualChile() {
    return new Intl.DateTimeFormat("es-CL", {
        timeZone: "America/Santiago",
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric"
    }).format(new Date());
}

function obtenerFechaHoraVisual() {
    const ahora = new Date();

    const fecha = new Intl.DateTimeFormat("es-CL", {
        timeZone: "America/Santiago",
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric"
    }).format(ahora);

    const hora = new Intl.DateTimeFormat("es-CL", {
        timeZone: "America/Santiago",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).format(ahora);

    return { fecha, hora };
}

function actualizarFechaHora() {
    const { fecha, hora } = obtenerFechaHoraVisual();

    if (fechaActual) {
        fechaActual.textContent = fecha.charAt(0).toUpperCase() + fecha.slice(1);
    }

    if (horaActual) {
        horaActual.textContent = hora;
    }
}

function mostrarAlerta(texto) {
    if (!alertBox) return;

    alertBox.textContent = texto;
    alertBox.classList.add("show");

    setTimeout(() => {
        alertBox.classList.remove("show");
    }, 2800);
}

function abrirModal({ titulo, mensaje, nombre, doctor, ubicacion }) {
    if (modalTitulo) modalTitulo.textContent = titulo || "CONFIRMACIÓN";
    if (modalMensaje) modalMensaje.textContent = mensaje || "";
    if (modalNombre) modalNombre.textContent = nombre || "---";
    if (modalDoctor) modalDoctor.textContent = doctor || "---";
    if (modalUbicacion) modalUbicacion.textContent = ubicacion || "---";

    if (modal) {
        modal.classList.add("show");
    }
}

function cerrarModal() {
    if (modal) {
        modal.classList.remove("show");
    }
}

/* =========================
   MANEJO VISUAL DEL RUT
========================= */
function obtenerValorRut() {
    if (!rutInput) return "";

    if ("value" in rutInput) {
        return String(rutInput.value || "");
    }

    return String(rutInput.textContent || "");
}

function asignarValorRut(valor) {
    if (!rutInput) return;

    const limpio = soloNumerosYk(valor);

    if ("value" in rutInput) {
        rutInput.value = limpio;
    } else {
        rutInput.textContent = limpio;
    }

    rutInput.setAttribute("data-rut", limpio);

    if (rutInput.isContentEditable) {
        rutInput.textContent = limpio;
    }
}

function enfocarRut() {
    if (!rutInput) return;

    if (typeof rutInput.focus === "function") {
        rutInput.focus();
    }

    if (rutInput.isContentEditable) {
        const range = document.createRange();
        const selection = window.getSelection();

        range.selectNodeContents(rutInput);
        range.collapse(false);

        selection.removeAllRanges();
        selection.addRange(range);
    }
}

function resetearInputRUT() {
    asignarValorRut("");
    enfocarRut();
    citaSeleccionada = null;
}

/* =========================
   DOCTOR / UBICACIÓN
========================= */
async function obtenerDatosDoctor(doctorId) {
    if (!doctorId) {
        return {
            nombreDoctorMostrar: "DOCTOR NO ASIGNADO",
            ubicacionMostrar: "UBICACIÓN NO DISPONIBLE"
        };
    }

    try {
        const doctorRef = doc(db, "doctores", doctorId);
        const doctorSnap = await getDoc(doctorRef);

        if (!doctorSnap.exists()) {
            return {
                nombreDoctorMostrar: "DOCTOR NO ENCONTRADO",
                ubicacionMostrar: "UBICACIÓN NO DISPONIBLE"
            };
        }

        const d = doctorSnap.data();
        const nombreDoctorMostrar = d.nombre
            ? `DR. ${String(d.nombre).toUpperCase()}`
            : "DOCTOR NO ASIGNADO";

        const ubicacionMostrar = (d.piso && d.consulta)
            ? `PISO ${d.piso} - CONSULTA ${d.consulta}`
            : "UBICACIÓN NO DISPONIBLE";

        return { nombreDoctorMostrar, ubicacionMostrar };
    } catch (error) {
        console.error("Error al obtener doctor:", error);
        return {
            nombreDoctorMostrar: "DOCTOR NO DISPONIBLE",
            ubicacionMostrar: "UBICACIÓN NO DISPONIBLE"
        };
    }
}

/* =========================
   IMPRESIÓN ANDROID
========================= */
function imprimirTicketSiExisteAndroid({
    titulo,
    mensaje,
    nombre,
    rut,
    doctor,
    ubicacion,
    fecha,
    horaLlegada
}) {
    try {
        if (
            window.AndroidBridge &&
            typeof window.AndroidBridge.printTicket === "function"
        ) {
            const payload = JSON.stringify({
                titulo: titulo || "LLEGADA CONFIRMADA",
                mensaje: mensaje || "POR FAVOR, DIRÍJASE A RECEPCIÓN.",
                nombre: nombre || "---",
                rut: rut || "---",
                doctor: doctor || "---",
                ubicacion: ubicacion || "---",
                fecha: fecha || "---",
                hora: horaLlegada || "---"
            });

            window.AndroidBridge.printTicket(payload);
        }
    } catch (error) {
        console.warn("No se pudo imprimir el ticket:", error);
    }
}

/* =========================
   BÚSQUEDA Y CONFIRMACIÓN
========================= */
async function buscarCitaPorRutHoy(rutLimpio) {
    const fechaHoy = obtenerFechaHoyChile();

    const q = query(
        collection(db, "agendados"),
        where("rut", "==", rutLimpio),
        where("fecha_turno", "==", fechaHoy)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) return null;

    return snapshot.docs[0];
}

async function confirmarLlegada() {
    try {
        const rutLimpio = limpiarRut(obtenerValorRut());

        if (!rutLimpio) {
            mostrarAlerta("INGRESE SU RUT.");
            resetearInputRUT();
            return;
        }

        if (!validarRUT(rutLimpio)) {
            mostrarAlerta("RUT INVÁLIDO.");
            resetearInputRUT();
            return;
        }

        citaSeleccionada = await buscarCitaPorRutHoy(rutLimpio);

        if (!citaSeleccionada) {
            mostrarAlerta("NO SE ENCONTRÓ UNA CITA PARA HOY CON ESE RUT.");
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
            "llamado_recepcion",
            "pago_manual",
            "pagado",
            "llamado_doctor"
        ];

        if (estadosYaRegistrados.includes(estadoActual)) {
            mostrarAlerta("SU LLEGADA YA FUE REGISTRADA.");
            resetearInputRUT();
            return;
        }

        const estadosInicialesValidos = ["pendiente"];

        if (!estadosInicialesValidos.includes(estadoActual)) {
            mostrarAlerta("NO SE ENCONTRÓ UNA CITA VÁLIDA PARA HOY CON ESE RUT.");
            resetearInputRUT();
            return;
        }

        const ahora24 = obtenerHoraActualChile24();
        const fechaVisual = obtenerFechaVisualChile();

        await updateDoc(doc(db, "agendados", docSnap.id), {
            estado: "llegado",
            hora_llegada: ahora24
        });

        const datosTicket = {
            titulo: "LLEGADA CONFIRMADA",
            mensaje: "POR FAVOR, DIRÍJASE A RECEPCIÓN.",
            nombre: p.nombre || "---",
            rut: formatearRUT(rutLimpio),
            doctor: nombreDoctorMostrar,
            ubicacion: ubicacionMostrar,
            fecha: fechaVisual.charAt(0).toUpperCase() + fechaVisual.slice(1),
            horaLlegada: ahora24
        };

        abrirModal({
            titulo: datosTicket.titulo,
            mensaje: datosTicket.mensaje,
            nombre: datosTicket.nombre,
            doctor: datosTicket.doctor,
            ubicacion: datosTicket.ubicacion
        });

        imprimirTicketSiExisteAndroid(datosTicket);

        resetearInputRUT();
    } catch (error) {
        console.error("Error al confirmar llegada:", error);
        mostrarAlerta("NO SE PUDO CONFIRMAR LA LLEGADA.");
        resetearInputRUT();
    }
}

/* =========================
   TECLADO
========================= */
function insertarEnRut(valor) {
    const actual = obtenerValorRut();
    asignarValorRut(`${actual}${valor}`);
}

function borrarUltimoRut() {
    const actual = obtenerValorRut();
    asignarValorRut(actual.slice(0, -1));
}

function inicializarTeclado() {
    const keys = document.querySelectorAll(".key");

    keys.forEach((key) => {
        key.addEventListener("click", () => {
            const rawValue =
                key.dataset.value ||
                key.getAttribute("data-value") ||
                key.textContent ||
                "";

            const value = String(rawValue).trim();
            const valueUpper = value.toUpperCase();
            const valueLower = value.toLowerCase();

            if (valueLower === "back" || valueLower === "borrar" || value === "⌫") {
                borrarUltimoRut();
                return;
            }

            if (valueLower === "clear" || valueLower === "limpiar" || valueUpper === "C") {
                resetearInputRUT();
                return;
            }

            if (valueLower === "confirm" || valueLower === "confirmar" || valueLower === "ok") {
                confirmarLlegada();
                return;
            }

            if (/^[0-9K]$/.test(valueUpper)) {
                insertarEnRut(valueUpper);
            }
        });
    });
}

/* =========================
   EVENTOS
========================= */
if (btnConfirmar) {
    btnConfirmar.addEventListener("click", confirmarLlegada);
}

if (rutInput) {
    rutInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            confirmarLlegada();
            return;
        }

        const teclasPermitidas = [
            "Backspace",
            "Delete",
            "ArrowLeft",
            "ArrowRight",
            "Tab"
        ];

        if (teclasPermitidas.includes(e.key)) return;

        if (!/^[0-9kK]$/.test(e.key)) {
            e.preventDefault();
        }
    });

    rutInput.addEventListener("input", () => {
        asignarValorRut(obtenerValorRut());
    });

    if (rutInput.isContentEditable) {
        rutInput.addEventListener("paste", (e) => {
            e.preventDefault();
            const texto = e.clipboardData?.getData("text") || "";
            asignarValorRut(texto);
        });
    }
}

if (modal) {
    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            cerrarModal();
        }
    });
}

const btnCerrarModal = document.getElementById("btnCerrarModal");
if (btnCerrarModal) {
    btnCerrarModal.addEventListener("click", cerrarModal);
}

/* =========================
   INICIO
========================= */
actualizarFechaHora();
setInterval(actualizarFechaHora, 1000);
inicializarTeclado();
enfocarRut();