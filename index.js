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

const MODAL_AUTO_CLOSE_MS = 12000;
const ALERT_AUTO_CLOSE_MS = 8000;

function limpiarRUT(rut) {
    return rut.replace(/[^0-9kK]/g, "").toUpperCase();
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

function obtenerFechaHoyChile() {
    const partes = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Santiago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date());

    const year = partes.find((p) => p.type === "year").value;
    const month = partes.find((p) => p.type === "month").value;
    const day = partes.find((p) => p.type === "day").value;

    return `${year}-${month}-${day}`;
}

function horaATotalMinutos(hora) {
    if (!hora || typeof hora !== "string") return 999999;

    const [hh, mm] = hora.split(":").map(Number);

    if (Number.isNaN(hh) || Number.isNaN(mm)) return 999999;

    return hh * 60 + mm;
}

function normalizarEstado(estado) {
    return (estado || "pendiente").toLowerCase().trim();
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
    }, 10000);
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

async function obtenerDatosDoctor(doctorId) {
    let nombreDoctorMostrar = "No asignado";
    let ubicacionMostrar = "Por confirmar";

    if (!doctorId) {
        return { nombreDoctorMostrar, ubicacionMostrar };
    }

    const idBuscado = doctorId.trim().toLowerCase();
    const docRefDoc = doc(db, "doctores", idBuscado);
    const docSnapDoc = await getDoc(docRefDoc);

    if (docSnapDoc.exists()) {
        const dData = docSnapDoc.data();
        nombreDoctorMostrar = dData.nombre || "No asignado";
        ubicacionMostrar = `Piso ${dData.piso} - Consulta ${dData.consulta}`;
    } else {
        nombreDoctorMostrar = "Dr(a). " + idBuscado.split("@")[0].toUpperCase();
    }

    return { nombreDoctorMostrar, ubicacionMostrar };
}

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
    resDoctor.innerText = doctor || "---";
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

async function confirmarLlegada() {
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

    btn.disabled = true;
    btn.innerHTML = '<span>Procesando...</span>';

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

        const ahora24 = new Date().toLocaleTimeString("es-CL", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        });

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
    } catch (error) {
        console.error(error);
        mostrarAlerta("ERROR AL PROCESAR.");
        resetearInputRUT();
    } finally {
        btn.disabled = false;
        btn.innerHTML = `
            <span>Confirmar llegada</span>
            <span class="btn-arrow">→</span>
        `;
    }
}

function actualizarFechaHora() {
    const ahora = new Date();

    if (fechaActualEl) {
        fechaActualEl.textContent = ahora.toLocaleDateString("es-CL", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        });
    }

    if (horaActualEl) {
        horaActualEl.textContent = ahora.toLocaleTimeString("es-CL", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        });
    }
}

keypadButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const key = button.dataset.key;
        if (!key || btn.disabled) return;
        agregarCaracterAlRut(key);
    });
});

btnBorrar.addEventListener("click", () => {
    if (btn.disabled) return;
    borrarUltimoCaracterRut();
});

btn.addEventListener("click", confirmarLlegada);
btnCerrarModal.addEventListener("click", cerrarModal);

document.addEventListener("keydown", (event) => {
    if (btn.disabled) return;

    if (/^[0-9]$/.test(event.key)) {
        agregarCaracterAlRut(event.key);
        return;
    }

    if (event.key === "k" || event.key === "K") {
        agregarCaracterAlRut("K");
        return;
    }

    if (event.key === "Backspace") {
        borrarUltimoCaracterRut();
        return;
    }

    if (event.key === "Enter") {
        confirmarLlegada();
    }
});

window.addEventListener("load", () => {
    actualizarFechaHora();
    setInterval(actualizarFechaHora, 1000);

    if (window.Android) {
    window.Android.showToast("Puente Android conectado");
    window.Android.log("La web se comunicó con Android correctamente");
}
});
