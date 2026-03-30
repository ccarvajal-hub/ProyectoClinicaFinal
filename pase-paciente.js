import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore,
    doc,
    getDoc,
    updateDoc,
    collection,
    query,
    where,
    getDocs,
    onSnapshot,
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
const MINUTOS_POR_PACIENTE = 10;

const estadoVisual = document.getElementById("estadoVisual");
const mensajePrincipal = document.getElementById("mensajePrincipal");
const pacienteNombre = document.getElementById("pacienteNombre");
const pacienteRut = document.getElementById("pacienteRut");
const doctorNombre = document.getElementById("doctorNombre");
const ubicacionTexto = document.getElementById("ubicacionTexto");
const pacientesAntes = document.getElementById("pacientesAntes");
const esperaEstimada = document.getElementById("esperaEstimada");
const indicacionesTexto = document.getElementById("indicacionesTexto");
const passIdTexto = document.getElementById("passIdTexto");
const ultimaActualizacion = document.getElementById("ultimaActualizacion");
const mapaDestinoTexto = document.getElementById("mapaDestinoTexto");
const mapaConsultaBox = document.getElementById("mapaConsultaBox");
const listaPasos = document.getElementById("listaPasos");

const contenidoActivo = document.getElementById("contenidoActivo");
const contenidoExpirado = document.getElementById("contenidoExpirado");
const expiredTitle = document.getElementById("expiredTitle");
const expiredMessage = document.getElementById("expiredMessage");

const btnAvisos = document.getElementById("btnAvisos");
const avisosEstado = document.getElementById("avisosEstado");

let stopAgendadoListener = null;
let passIdActual = "";
let ultimoEstadoRenderizado = "";
let ultimoNombreDoctor = "";
let ultimaUbicacion = "";

function getPassIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("pass") || "";
}

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

function horaATotalMinutos(hora) {
    if (!hora || typeof hora !== "string") return 999999;

    const [hh, mm] = hora.split(":").map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return 999999;

    return hh * 60 + mm;
}

function normalizarEstado(estado) {
    return String(estado || "pendiente").toLowerCase().trim();
}

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

function expiraAtYaPaso(expiraAt) {
    if (!expiraAt) return false;

    if (typeof expiraAt === "string") {
        const d = new Date(expiraAt);
        if (Number.isNaN(d.getTime())) return false;
        return Date.now() > d.getTime();
    }

    if (typeof expiraAt?.toDate === "function") {
        return Date.now() > expiraAt.toDate().getTime();
    }

    return false;
}

function mapearEstadoVisual(estado) {
    const e = normalizarEstado(estado);

    if (["pendiente", "agendado", "confirmado", "llegado"].includes(e)) {
        return { texto: "En espera", clase: "status-pending" };
    }

    if (["llamado_recepcion", "pago_manual", "pagado", "en_recepcion"].includes(e)) {
        return { texto: "En proceso", clase: "status-progress" };
    }

    if (["llamado_doctor", "llamando", "llamado", "atendiendo"].includes(e)) {
        return { texto: "Es tu turno", clase: "status-success" };
    }

    if (e === "atendido") {
        return { texto: "Finalizado", clase: "status-danger" };
    }

    return { texto: "En espera", clase: "status-pending" };
}

function actualizarEstadoVisual(estado) {
    const info = mapearEstadoVisual(estado);
    estadoVisual.textContent = info.texto;
    estadoVisual.className = `status-badge ${info.clase}`;
}

function generarMensajePrincipal(estado, doctor, ubicacion) {
    const e = normalizarEstado(estado);

    if (e === "llamado_doctor") {
        return `Ya es tu turno. Dirígete ahora con ${doctor || "tu doctor"} en ${ubicacion || "la consulta indicada"}.`;
    }

    if (e === "pagado") {
        return "Tu pago ya fue registrado. Mantente atento, pronto serás llamado a consulta.";
    }

    if (e === "pago_manual") {
        return "Tu atención está siendo gestionada en recepción. Espera la siguiente indicación.";
    }

    if (e === "llamado_recepcion") {
        return "Recepción te está llamando. Acércate al mesón para continuar con tu atención.";
    }

    if (["pendiente", "agendado", "confirmado", "llegado"].includes(e)) {
        return "Tu llegada ya fue registrada correctamente. Espera tu llamado en recepción.";
    }

    if (e === "atendido") {
        return "Tu atención ya fue finalizada.";
    }

    return "Tu atención está avanzando. Mantente atento a esta pantalla.";
}

function generarIndicaciones(estado, ubicacion) {
    const e = normalizarEstado(estado);

    if (e === "llamado_doctor") {
        return `Por favor, dirígete ahora a ${ubicacion || "la consulta indicada"}.`;
    }

    if (e === "pagado") {
        return "Tu pago está listo. Espera en la sala o cerca de tu box hasta ser llamado por el doctor.";
    }

    if (e === "pago_manual") {
        return "Recepción está procesando tu atención. Mantente atento a esta página.";
    }

    if (e === "llamado_recepcion") {
        return "Acércate a recepción para continuar con el proceso de atención.";
    }

    if (["pendiente", "agendado", "confirmado", "llegado"].includes(e)) {
        return "Dirígete a recepción y espera tu llamado. Esta página se actualizará automáticamente.";
    }

    if (e === "atendido") {
        return "Tu atención finalizó. Si tienes una nueva cita, escanea un nuevo código QR.";
    }

    return "Mantente atento a esta pantalla para nuevas indicaciones.";
}

function generarPasos(estado, ubicacion) {
    const e = normalizarEstado(estado);

    if (e === "llamado_doctor") {
        return [
            "Ya puedes avanzar hacia la consulta.",
            `Dirígete a ${ubicacion || "la ubicación indicada"}.`,
            "Si tienes documentos o exámenes, llévalos contigo."
        ];
    }

    if (e === "pagado") {
        return [
            "Tu pago ya fue registrado.",
            "Espera cerca de la sala o consulta asignada.",
            "Mantente atento al llamado del doctor."
        ];
    }

    if (e === "llamado_recepcion") {
        return [
            "Recepción te está llamando ahora.",
            "Acércate al mesón de atención.",
            "Luego espera la siguiente indicación."
        ];
    }

    return [
        "Dirígete a recepción.",
        "Espera en la sala o zona indicada.",
        "Mantente atento a esta pantalla y a tu llamado."
    ];
}

function renderizarPasos(pasos) {
    listaPasos.innerHTML = "";
    pasos.forEach((paso) => {
        const li = document.createElement("li");
        li.textContent = paso;
        listaPasos.appendChild(li);
    });
}

function mostrarExpirado(titulo, mensaje) {
    contenidoActivo.classList.add("hidden");
    contenidoExpirado.classList.remove("hidden");
    expiredTitle.textContent = titulo;
    expiredMessage.textContent = mensaje;
}

function mostrarActivo() {
    contenidoActivo.classList.remove("hidden");
    contenidoExpirado.classList.add("hidden");
}

async function desactivarPase(passId) {
    try {
        const passRef = doc(db, "pases_paciente", passId);
        await updateDoc(passRef, {
            activo: false,
            updated_at: serverTimestamp()
        });
    } catch (error) {
        console.error("No se pudo desactivar el pase:", error);
    }
}

async function actualizarPushEnabled(passId, enabled) {
    try {
        const passRef = doc(db, "pases_paciente", passId);
        await updateDoc(passRef, {
            push_enabled: enabled,
            updated_at: serverTimestamp()
        });
    } catch (error) {
        console.error("No se pudo actualizar push_enabled:", error);
    }
}

async function calcularPacientesAntes(agendadoActualId, agendadoData) {
    try {
        const doctorId = agendadoData.doctor_id;
        const fechaTurno = agendadoData.fecha_turno;
        const horaActual = horaATotalMinutos(agendadoData.hora_consulta);

        if (!doctorId || !fechaTurno) return 0;

        const q = query(
            collection(db, "agendados"),
            where("doctor_id", "==", doctorId),
            where("fecha_turno", "==", fechaTurno)
        );

        const snap = await getDocs(q);
        let totalAntes = 0;

        snap.forEach((docSnap) => {
            if (docSnap.id === agendadoActualId) return;

            const data = docSnap.data();
            const estado = normalizarEstado(data.estado);
            const horaOtro = horaATotalMinutos(data.hora_consulta);

            if (estado === "atendido") return;
            if (horaOtro < horaActual) totalAntes++;
        });

        return totalAntes;
    } catch (error) {
        console.error("Error calculando pacientes antes:", error);
        return 0;
    }
}

function formatearEspera(minutos) {
    if (minutos <= 0) return "0 min";
    if (minutos < 60) return `${minutos} min`;

    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;

    if (mins === 0) return `${horas} h`;
    return `${horas} h ${mins} min`;
}

function actualizarUIAvisosSegunPermiso() {
    if (!("Notification" in window)) {
        btnAvisos.disabled = true;
        avisosEstado.textContent = "Este navegador no soporta notificaciones.";
        return;
    }

    const permission = Notification.permission;

    if (permission === "granted") {
        btnAvisos.disabled = true;
        btnAvisos.textContent = "Avisos activados";
        avisosEstado.textContent = "Este dispositivo ya tiene avisos habilitados.";
        return;
    }

    if (permission === "denied") {
        btnAvisos.disabled = true;
        btnAvisos.textContent = "Avisos bloqueados";
        avisosEstado.textContent = "Las notificaciones fueron bloqueadas en este navegador.";
        return;
    }

    btnAvisos.disabled = false;
    btnAvisos.textContent = "Activar avisos";
    avisosEstado.textContent = "Puedes activar avisos desde este dispositivo.";
}

async function activarAvisos() {
    if (!("Notification" in window)) {
        avisosEstado.textContent = "Este navegador no soporta notificaciones.";
        return;
    }

    try {
        const permiso = await Notification.requestPermission();

        if (permiso === "granted") {
            await actualizarPushEnabled(passIdActual, true);
            btnAvisos.disabled = true;
            btnAvisos.textContent = "Avisos activados";
            avisosEstado.textContent = "Avisos activados en este dispositivo.";

            new Notification("Avisos activados", {
                body: "Te avisaremos cuando cambie el estado de tu atención."
            });
            return;
        }

        if (permiso === "denied") {
            btnAvisos.disabled = true;
            btnAvisos.textContent = "Avisos bloqueados";
            avisosEstado.textContent = "Las notificaciones fueron bloqueadas.";
            return;
        }

        avisosEstado.textContent = "No se activaron las notificaciones.";
    } catch (error) {
        console.error("Error activando avisos:", error);
        avisosEstado.textContent = "No fue posible activar avisos en este momento.";
    }
}

function dispararNotificacionLocalSiCorresponde(estado, doctor, ubicacion) {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const estadoActual = normalizarEstado(estado);
    const estadoPrevio = normalizarEstado(ultimoEstadoRenderizado);

    if (estadoActual === estadoPrevio) return;

    if (estadoActual === "llamado_recepcion") {
        new Notification("Recepción te está llamando", {
            body: "Acércate a recepción para continuar tu atención."
        });
    }

    if (estadoActual === "pagado") {
        new Notification("Pago registrado", {
            body: "Tu pago fue confirmado. Espera el llamado del doctor."
        });
    }

    if (estadoActual === "llamado_doctor") {
        new Notification("Ya es tu turno", {
            body: `Dirígete a ${ubicacion || "tu consulta"} con ${doctor || "tu doctor"}.`
        });
    }
}

async function renderizarAgendado(agendadoId, agendadoData, passId) {
    const { nombreDoctorMostrar, ubicacionMostrar } = await obtenerDatosDoctor(agendadoData.doctor_id);
    const estado = normalizarEstado(agendadoData.estado);

    const antes = await calcularPacientesAntes(agendadoId, agendadoData);
    const minutosEstimados = antes * MINUTOS_POR_PACIENTE;

    mostrarActivo();
    actualizarEstadoVisual(estado);

    pacienteNombre.textContent = agendadoData.nombre || "---";
    pacienteRut.textContent = formatearRUT(agendadoData.rut || "---");
    doctorNombre.textContent = nombreDoctorMostrar;
    ubicacionTexto.textContent = ubicacionMostrar;
    pacientesAntes.textContent = String(antes);
    esperaEstimada.textContent = formatearEspera(minutosEstimados);
    mensajePrincipal.textContent = generarMensajePrincipal(estado, nombreDoctorMostrar, ubicacionMostrar);
    indicacionesTexto.textContent = generarIndicaciones(estado, ubicacionMostrar);
    renderizarPasos(generarPasos(estado, ubicacionMostrar));

    passIdTexto.textContent = passId;
    mapaDestinoTexto.textContent = ubicacionMostrar || "Destino";
    mapaConsultaBox.textContent = ubicacionMostrar || "Consulta";
    ultimaActualizacion.textContent = new Date().toLocaleString("es-CL", {
        timeZone: CL_TIMEZONE,
        hour12: false
    });

    dispararNotificacionLocalSiCorresponde(estado, nombreDoctorMostrar, ubicacionMostrar);

    ultimoEstadoRenderizado = estado;
    ultimoNombreDoctor = nombreDoctorMostrar;
    ultimaUbicacion = ubicacionMostrar;

    if (estado === "atendido") {
        await desactivarPase(passId);
        mostrarExpirado(
            "Atención finalizada",
            "Tu atención ya fue realizada. Si tienes una nueva cita, escanea un nuevo código QR."
        );
    }
}

async function iniciar() {
    const passId = getPassIdFromUrl();
    passIdActual = passId;

    if (!passId) {
        mostrarExpirado(
            "Pase no válido",
            "No se encontró un identificador de pase en el enlace."
        );
        return;
    }

    passIdTexto.textContent = passId;
    actualizarUIAvisosSegunPermiso();

    try {
        const passRef = doc(db, "pases_paciente", passId);
        const passSnap = await getDoc(passRef);

        if (!passSnap.exists()) {
            mostrarExpirado(
                "Pase no encontrado",
                "Este pase no existe o ya no está disponible."
            );
            return;
        }

        const passData = passSnap.data();

        if (!passData.activo) {
            mostrarExpirado(
                "Pase expirado",
                "Este pase ya no está activo. Si tienes una nueva atención, escanea un nuevo código QR."
            );
            return;
        }

        if (expiraAtYaPaso(passData.expira_at)) {
            await desactivarPase(passId);
            mostrarExpirado(
                "Pase expirado",
                "El tiempo de este pase ya terminó. Si tienes una nueva atención, escanea un nuevo código QR."
            );
            return;
        }

        if (passData.push_enabled === true && "Notification" in window && Notification.permission === "granted") {
            btnAvisos.disabled = true;
            btnAvisos.textContent = "Avisos activados";
            avisosEstado.textContent = "Avisos activados en este dispositivo.";
        }

        const agendadoId = passData.agendado_id;
        if (!agendadoId) {
            mostrarExpirado(
                "Pase incompleto",
                "Este pase no tiene una cita asociada."
            );
            return;
        }

        const agendadoRef = doc(db, "agendados", agendadoId);

        stopAgendadoListener = onSnapshot(
            agendadoRef,
            async (agendadoSnap) => {
                if (!agendadoSnap.exists()) {
                    mostrarExpirado(
                        "Cita no encontrada",
                        "La cita asociada a este pase ya no está disponible."
                    );
                    return;
                }

                const agendadoData = agendadoSnap.data();
                await renderizarAgendado(agendadoSnap.id, agendadoData, passId);
            },
            (error) => {
                console.error("Error escuchando agendado:", error);
                mostrarExpirado(
                    "Error de conexión",
                    "No fue posible cargar la atención en tiempo real."
                );
            }
        );
    } catch (error) {
        console.error(error);
        mostrarExpirado(
            "Error al cargar",
            "Ocurrió un problema al abrir este pase."
        );
    }
}

btnAvisos?.addEventListener("click", activarAvisos);

window.addEventListener("beforeunload", () => {
    if (typeof stopAgendadoListener === "function") {
        stopAgendadoListener();
    }
});

document.addEventListener("DOMContentLoaded", iniciar);