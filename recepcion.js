import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore,
    collection,
    onSnapshot,
    doc,
    updateDoc,
    query,
    orderBy,
    getDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
    getAuth,
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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
const auth = getAuth(app);

const RECEPCION_ACTUAL = {
    numero: 1,
    nombre: "Recepción 1",
    id: "recepcion_1"
};

const cacheDoctores = {};

const ESTADOS_ESPERA = ["pendiente", "llegado", "en_recepcion", "llamado_recepcion", "pago_manual"];
const ESTADOS_HISTORIAL = ["pagado", "atendido"];

function getFechaChileYMD() {
    const partes = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Santiago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date());

    const y = partes.find(p => p.type === "year")?.value;
    const m = partes.find(p => p.type === "month")?.value;
    const d = partes.find(p => p.type === "day")?.value;

    return `${y}-${m}-${d}`;
}

function mostrarFechaCabecera() {
    const el = document.getElementById("fecha-hoy");

    const texto = new Intl.DateTimeFormat("es-CL", {
        timeZone: "America/Santiago",
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    }).format(new Date());

    el.innerHTML = `<strong>Agenda del día:</strong> ${texto.charAt(0).toUpperCase() + texto.slice(1)}`;
}

function mostrarRecepcionActual() {
    const el = document.getElementById("recepcion-actual-label");
    el.textContent = `Módulo: ${RECEPCION_ACTUAL.nombre}`;
}

async function cerrarSesion() {
    const ok = confirm("¿Cerrar sesión de recepción?");
    if (!ok) return;

    try {
        await signOut(auth);
        window.location.href = "login-recepcion.html";
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
        alert("No se pudo cerrar la sesión: " + error.message);
    }
}

function normalizarEstado(estado) {
    return String(estado || "pendiente").trim().toLowerCase().replace(/\s+/g, "_");
}

function esPagoManualVisual(paciente) {
    const estado = normalizarEstado(paciente.estado);
    return estado === "pago_manual" || paciente.tipo_pago === "manual" || paciente.registro_manual_recepcion === true;
}

function formatearEstadoDesdePaciente(paciente) {
    const estado = normalizarEstado(paciente.estado);

    if (estado === "pagado" && esPagoManualVisual(paciente)) {
        return "Pago manual";
    }

    const mapa = {
        pendiente: "Pendiente",
        llegado: "En recepción",
        en_recepcion: "En recepción",
        llamado_recepcion: "Llamado a recepción",
        pago_manual: "Pago manual",
        pagado: "Pagado",
        atendido: "Atendido"
    };

    return mapa[estado] || estado;
}

function getClaseBadgeDesdePaciente(paciente) {
    const estado = normalizarEstado(paciente.estado);

    if (estado === "pagado" && esPagoManualVisual(paciente)) {
        return "badge-pago_manual";
    }

    return `badge-${estado}`;
}

function crearBadgeEstadoDesdePaciente(paciente) {
    const span = document.createElement("span");
    span.className = `badge ${getClaseBadgeDesdePaciente(paciente)}`;
    span.textContent = formatearEstadoDesdePaciente(paciente);
    return span;
}

function obtenerTextoRecepcion(paciente) {
    if (paciente.recepcion_nombre) {
        return String(paciente.recepcion_nombre).toUpperCase();
    }
    return "SIN LLAMAR";
}

async function obtenerNombreDoctor(email) {
    if (!email) return "DOCTOR";

    const cleanEmail = String(email).toLowerCase().trim();

    if (cacheDoctores[cleanEmail]) {
        return cacheDoctores[cleanEmail];
    }

    try {
        const docRef = doc(db, "doctores", cleanEmail);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const nombre = docSnap.data().nombre || cleanEmail.split("@")[0];
            cacheDoctores[cleanEmail] = nombre;
            return nombre;
        }
    } catch (e) {
        console.error("Error obteniendo doctor:", e);
    }

    const fallback = cleanEmail.split("@")[0].toUpperCase();
    cacheDoctores[cleanEmail] = fallback;
    return fallback;
}

async function confirmarLlamadoRecepcion(id, paciente) {
    const nombrePaciente = paciente.nombre || "SIN NOMBRE";
    const mensaje = `¿Confirmar llamado de ${nombrePaciente} a ${RECEPCION_ACTUAL.nombre}?`;

    const ok = confirm(mensaje);
    if (!ok) return false;

    try {
        await updateDoc(doc(db, "agendados", id), {
            estado: "llamado_recepcion",
            recepcion_id: RECEPCION_ACTUAL.id,
            recepcion_numero: RECEPCION_ACTUAL.numero,
            recepcion_nombre: RECEPCION_ACTUAL.nombre,
            hora_llamado_recepcion: serverTimestamp(),
            registro_manual_recepcion: false,
            tipo_pago: null
        });
        return true;
    } catch (e) {
        console.error("Error al llamar en recepción:", e);
        alert("Error al confirmar llamado: " + e.message);
        return false;
    }
}

async function activarPagoDirecto(id, paciente) {
    const nombrePaciente = paciente.nombre || "SIN NOMBRE";
    const mensaje =
        `¿Activar pago directo para ${nombrePaciente}?\n\n` +
        `Esto habilitará el pago manual sin pasar por el llamado de recepción.`;

    const ok = confirm(mensaje);
    if (!ok) return false;

    try {
        await updateDoc(doc(db, "agendados", id), {
            estado: "pago_manual",
            recepcion_id: RECEPCION_ACTUAL.id,
            recepcion_numero: RECEPCION_ACTUAL.numero,
            recepcion_nombre: RECEPCION_ACTUAL.nombre,
            registro_manual_recepcion: true,
            tipo_pago: "manual",
            hora_pago_manual_activado: serverTimestamp()
        });

        return true;
    } catch (e) {
        console.error("Error al activar pago directo:", e);
        alert("Error al activar pago directo: " + e.message);
        return false;
    }
}

async function confirmarPago(id, paciente) {
    const nombrePaciente = paciente.nombre || "SIN NOMBRE";
    const esManual = normalizarEstado(paciente.estado) === "pago_manual" || paciente.registro_manual_recepcion === true;
    const mensaje = esManual
        ? `¿Confirmar pago manual de ${nombrePaciente}?`
        : `¿Confirmar que el paciente ${nombrePaciente} realizó el pago?`;

    const ok = confirm(mensaje);
    if (!ok) return false;

    try {
        const payload = {
            estado: "pagado",
            hora_pago: serverTimestamp(),
            recepcion_id: paciente.recepcion_id || RECEPCION_ACTUAL.id,
            recepcion_numero: paciente.recepcion_numero || RECEPCION_ACTUAL.numero,
            recepcion_nombre: paciente.recepcion_nombre || RECEPCION_ACTUAL.nombre
        };

        if (esManual) {
            payload.registro_manual_recepcion = true;
            payload.tipo_pago = "manual";
        } else {
            payload.registro_manual_recepcion = false;
            payload.tipo_pago = null;
        }

        await updateDoc(doc(db, "agendados", id), payload);
        return true;
    } catch (e) {
        console.error("Error al confirmar pago:", e);
        alert("Error al procesar el pago: " + e.message);
        return false;
    }
}

function crearBotonAccion(id, paciente) {
    const estado = normalizarEstado(paciente.estado);
    const actions = document.createElement("div");
    actions.className = "actions";

    const btn = document.createElement("button");
    btn.className = "btn-action";

    if (estado === "pendiente") {
        btn.classList.add("btn-call");
        btn.textContent = "LLAMAR";
        btn.disabled = true;
        btn.title = "Esperando registro del paciente en el tótem o activación de pago directo";
        actions.appendChild(btn);
        return actions;
    }

    if (estado === "llegado") {
        btn.classList.add("btn-call");
        btn.textContent = "LLAMAR";
        btn.disabled = false;
        btn.title = `Llamar paciente a ${RECEPCION_ACTUAL.nombre}`;
        btn.addEventListener("click", async () => {
            btn.disabled = true;
            const ok = await confirmarLlamadoRecepcion(id, paciente);
            if (!ok) {
                btn.disabled = false;
            }
        });
        actions.appendChild(btn);
        return actions;
    }

    if (estado === "llamado_recepcion" || estado === "pago_manual") {
        btn.classList.add("btn-pay");
        btn.textContent = "PAGAR";
        btn.disabled = false;
        btn.title = "Confirmar pago del paciente";
        btn.addEventListener("click", async () => {
            btn.disabled = true;
            const ok = await confirmarPago(id, paciente);
            if (!ok) {
                btn.disabled = false;
            }
        });
        actions.appendChild(btn);
        return actions;
    }

    const ok = document.createElement("span");
    ok.className = "check";
    ok.textContent = "✔";
    actions.appendChild(ok);
    return actions;
}

function crearPagoDirectoControl(id, paciente) {
    const directWrap = document.createElement("div");
    directWrap.className = "direct-wrap";

    const estado = normalizarEstado(paciente.estado);
    const esManual = esPagoManualVisual(paciente);

    const btn = document.createElement("button");
    btn.className = "btn-direct";
    btn.title = "Activar pago directo";
    btn.textContent = "";

    if (esManual || estado === "pago_manual") {
        btn.classList.add("direct-activo");
        btn.textContent = "✔";
        btn.disabled = true;
        btn.title = "Pago directo activado";
        directWrap.appendChild(btn);
        return directWrap;
    }

    if (estado === "pendiente") {
        btn.disabled = false;
        btn.addEventListener("click", async () => {
            btn.disabled = true;
            const activado = await activarPagoDirecto(id, paciente);
            if (activado) {
                btn.classList.add("direct-activo");
                btn.textContent = "✔";
            } else {
                btn.disabled = false;
                btn.textContent = "";
            }
        });
    } else {
        btn.disabled = true;
        btn.title = "Pago directo desactivado cuando el paciente ya llegó por tótem";
    }

    directWrap.appendChild(btn);
    return directWrap;
}

function crearFilaEspera(id, paciente, nombreDoctor) {
    const row = document.createElement("div");
    row.className = "row-espera";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = paciente.nombre || "SIN NOMBRE";

    const docDiv = document.createElement("div");
    docDiv.className = "doc";
    docDiv.textContent = `Dr. ${nombreDoctor}`;

    const hora = document.createElement("div");
    hora.className = "hora";
    hora.textContent = paciente.hora_consulta || "--:--";

    const recepcion = document.createElement("div");
    recepcion.className = "recepcion-col";
    recepcion.textContent = obtenerTextoRecepcion(paciente);
    if (!paciente.recepcion_nombre) {
        recepcion.classList.add("muted");
    }

    const estadoWrap = document.createElement("div");
    estadoWrap.className = "estado-wrap";
    estadoWrap.appendChild(crearBadgeEstadoDesdePaciente(paciente));

    row.appendChild(name);
    row.appendChild(docDiv);
    row.appendChild(hora);
    row.appendChild(recepcion);
    row.appendChild(estadoWrap);
    row.appendChild(crearBotonAccion(id, paciente));
    row.appendChild(crearPagoDirectoControl(id, paciente));

    return row;
}

function crearFilaHistorial(paciente, nombreDoctor) {
    const row = document.createElement("div");
    row.className = "row-historial";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = paciente.nombre || "SIN NOMBRE";

    const docDiv = document.createElement("div");
    docDiv.className = "doc";
    docDiv.textContent = `Dr. ${nombreDoctor}`;

    const hora = document.createElement("div");
    hora.className = "hora";
    hora.textContent = paciente.hora_consulta || "--:--";

    const recepcion = document.createElement("div");
    recepcion.className = "recepcion-col";
    recepcion.textContent = obtenerTextoRecepcion(paciente);
    if (!paciente.recepcion_nombre) {
        recepcion.classList.add("muted");
    }

    const estadoWrap = document.createElement("div");
    estadoWrap.className = "estado-wrap";
    estadoWrap.appendChild(crearBadgeEstadoDesdePaciente(paciente));

    const result = document.createElement("div");
    result.className = "actions";

    const ok = document.createElement("span");
    ok.className = "check";
    ok.textContent = "✔";
    result.appendChild(ok);

    row.appendChild(name);
    row.appendChild(docDiv);
    row.appendChild(hora);
    row.appendChild(recepcion);
    row.appendChild(estadoWrap);
    row.appendChild(result);

    return row;
}

mostrarFechaCabecera();
mostrarRecepcionActual();

document.getElementById("btn-cerrar-sesion").addEventListener("click", cerrarSesion);

const q = query(collection(db, "agendados"), orderBy("hora_consulta", "asc"));

onSnapshot(
    q,
    async (snapshot) => {
        const esperaDiv = document.getElementById("lista-espera");
        const atendidosDiv = document.getElementById("lista-atendidos");

        esperaDiv.innerHTML = "";
        atendidosDiv.innerHTML = "";

        let contEspera = 0;
        let contAtendidos = 0;

        const fechaHoy = getFechaChileYMD();

        for (const docSnap of snapshot.docs) {
            const paciente = docSnap.data();
            const id = docSnap.id;
            const estado = normalizarEstado(paciente.estado);
            const fechaTurno = String(paciente.fecha_turno || "").trim().replace(/\s+/g, "");

            if (fechaTurno !== fechaHoy) {
                continue;
            }

            if (!ESTADOS_ESPERA.includes(estado) && !ESTADOS_HISTORIAL.includes(estado)) {
                continue;
            }

            const nombreDoctor = await obtenerNombreDoctor(paciente.doctor_id);
            const esHistorial = ESTADOS_HISTORIAL.includes(estado);

            if (esHistorial) {
                atendidosDiv.appendChild(crearFilaHistorial(paciente, nombreDoctor));
                contAtendidos++;
            } else {
                esperaDiv.appendChild(crearFilaEspera(id, paciente, nombreDoctor));
                contEspera++;
            }
        }

        if (contEspera === 0) {
            esperaDiv.innerHTML = '<div class="empty-msg">No hay pacientes pendientes hoy.</div>';
        }

        if (contAtendidos === 0) {
            atendidosDiv.innerHTML = '<div class="empty-msg">No hay pagos o atenciones registradas hoy.</div>';
        }
    },
    (error) => {
        console.error("Error en onSnapshot:", error);
        document.getElementById("lista-espera").innerHTML =
            `<div class="empty-msg">Error cargando agenda: ${error.message}</div>`;
        document.getElementById("lista-atendidos").innerHTML =
            `<div class="empty-msg">Error cargando historial: ${error.message}</div>`;
    }
);