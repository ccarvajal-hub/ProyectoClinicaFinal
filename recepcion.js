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
    getDocs,
    where,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
    getAuth,
    signOut,
    onAuthStateChanged
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

let RECEPCION_ACTUAL = {
    numero: 1,
    nombre: "Recepción 1",
    id: "recepcion_1",
    box: "Recepción 1"
};

const cacheDoctores = {};

const CONFIG_ESTADOS = {
    pendiente: {
        visual: "Pendiente",
        sector: "agenda"
    },
    llegado: {
        visual: "En recepción",
        sector: "agenda"
    },
    llamado_recepcion: {
        visual: "Llamado en recepción",
        sector: "agenda"
    },
    pago_manual: {
        visual: "Pago manual",
        sector: "agenda"
    },
    pagado: {
        visual: "Pagado",
        sector: "historial"
    },
    llamado_doctor: {
        visual: "Llamado a consulta",
        sector: "historial"
    },
    atendido: {
        visual: "Atendido",
        sector: "historial"
    }
};

const ESTADOS_AGENDA = ["pendiente", "llegado", "llamado_recepcion", "pago_manual"];
const ESTADOS_HISTORIAL = ["pagado", "llamado_doctor", "atendido"];

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
    if (!el) return;

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
    const textoModulo = RECEPCION_ACTUAL.box || RECEPCION_ACTUAL.nombre;
    const subtitle = document.getElementById("recepcion-page-subtitle");

    if (subtitle) {
        subtitle.textContent = `MÓDULO: ${String(textoModulo).toUpperCase()}`;
    }
}

async function cargarRecepcionDesdeFirestore(user) {
    try {
        const qRecepcion = query(
            collection(db, "recepcionistas"),
            where("uid", "==", user.uid),
            where("rol", "==", "recepcion")
        );

        const snap = await getDocs(qRecepcion);

        if (snap.empty) {
            console.warn("No se encontró el recepcionista en Firestore.");
            mostrarRecepcionActual();
            return;
        }

        const data = snap.docs[0].data();
        const box = data.box || data.nombre || "Recepción 1";

        const numeroDetectado = parseInt(String(box).replace(/\D/g, ""), 10);
        const numeroFinal = Number.isNaN(numeroDetectado) ? 1 : numeroDetectado;

        RECEPCION_ACTUAL = {
            numero: numeroFinal,
            nombre: box,
            id: `recepcion_${numeroFinal}`,
            box
        };

        mostrarRecepcionActual();
    } catch (error) {
        console.error("Error cargando recepción desde Firestore:", error);
        mostrarRecepcionActual();
    }
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
    return String(estado || "pendiente")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

function obtenerEstadoVisual(paciente) {
    const estado = normalizarEstado(paciente?.estado);
    const fueManual = paciente?.registro_manual_recepcion === true;

    if (fueManual && ["pagado", "llamado_doctor", "atendido", "pago_manual"].includes(estado)) {
        return "Pago manual";
    }

    return CONFIG_ESTADOS[estado]?.visual || String(estado || "pendiente");
}

function getClaseBadge(paciente) {
    const estado = normalizarEstado(paciente?.estado);
    const fueManual = paciente?.registro_manual_recepcion === true;

    if (fueManual && ["pagado", "llamado_doctor", "atendido", "pago_manual"].includes(estado)) {
        return "badge-pago_manual";
    }

    return `badge-${estado}`;
}

function crearBadgeEstado(paciente) {
    const span = document.createElement("span");
    span.className = `badge ${getClaseBadge(paciente)}`;
    span.textContent = obtenerEstadoVisual(paciente);
    return span;
}

function obtenerTextoRecepcion(paciente) {
    if (paciente.recepcion_nombre) {
        return String(paciente.recepcion_nombre).toUpperCase();
    }
    return "SIN LLAMAR";
}

async function obtenerNombreDoctor(doctorRef) {
    if (!doctorRef) return "DOCTOR";

    const valor = String(doctorRef).trim();
    const cacheKey = valor.toLowerCase();

    if (cacheDoctores[cacheKey]) {
        return cacheDoctores[cacheKey];
    }

    try {
        const valorLower = valor.toLowerCase();

        if (valor.includes("@")) {
            const porDoc = await getDoc(doc(db, "doctores", valorLower));
            if (porDoc.exists()) {
                const data = porDoc.data();
                const nombre =
                    data.nombre_completo ||
                    data.nombre ||
                    data.displayName ||
                    data.nombres ||
                    valor.split("@")[0].toUpperCase();

                cacheDoctores[cacheKey] = nombre;
                return nombre;
            }
        }

        const qUid = query(
            collection(db, "doctores"),
            where("uid", "==", valor)
        );
        const snapUid = await getDocs(qUid);

        if (!snapUid.empty) {
            const data = snapUid.docs[0].data();
            const nombre =
                data.nombre_completo ||
                data.nombre ||
                data.displayName ||
                data.nombres ||
                "DOCTOR";

            cacheDoctores[cacheKey] = nombre;
            return nombre;
        }

        const qEmail = query(
            collection(db, "doctores"),
            where("email", "==", valorLower)
        );
        const snapEmail = await getDocs(qEmail);

        if (!snapEmail.empty) {
            const data = snapEmail.docs[0].data();
            const nombre =
                data.nombre_completo ||
                data.nombre ||
                data.displayName ||
                data.nombres ||
                valor.split("@")[0].toUpperCase();

            cacheDoctores[cacheKey] = nombre;
            return nombre;
        }

        const qEmailNorm = query(
            collection(db, "doctores"),
            where("email_normalizado", "==", valorLower)
        );
        const snapEmailNorm = await getDocs(qEmailNorm);

        if (!snapEmailNorm.empty) {
            const data = snapEmailNorm.docs[0].data();
            const nombre =
                data.nombre_completo ||
                data.nombre ||
                data.displayName ||
                data.nombres ||
                valor.split("@")[0].toUpperCase();

            cacheDoctores[cacheKey] = nombre;
            return nombre;
        }
    } catch (e) {
        console.error("Error obteniendo doctor:", e);
    }

    cacheDoctores[cacheKey] = "DOCTOR";
    return "DOCTOR";
}

async function actualizarEstadoPaciente(id, payload) {
    try {
        await updateDoc(doc(db, "agendados", id), payload);
        return true;
    } catch (e) {
        console.error("Error actualizando estado:", e);
        alert("Error al actualizar el estado: " + e.message);
        return false;
    }
}

async function confirmarLlamadoRecepcion(id, paciente) {
    const nombrePaciente = paciente.nombre || "SIN NOMBRE";
    const modulo = RECEPCION_ACTUAL.box || RECEPCION_ACTUAL.nombre;

    const ok = confirm(`¿Confirmar llamado de ${nombrePaciente} a ${modulo}?`);
    if (!ok) return false;

    return await actualizarEstadoPaciente(id, {
        estado: "llamado_recepcion",
        recepcion_id: RECEPCION_ACTUAL.id,
        recepcion_numero: RECEPCION_ACTUAL.numero,
        recepcion_nombre: modulo,
        hora_llamado_recepcion: serverTimestamp()
    });
}

async function activarPagoManual(id, paciente) {
    const nombrePaciente = paciente.nombre || "SIN NOMBRE";
    const modulo = RECEPCION_ACTUAL.box || RECEPCION_ACTUAL.nombre;

    const ok = confirm(
        `¿Activar pago manual para ${nombrePaciente}?\n\nEl paciente pasará a estado "Pago manual".`
    );
    if (!ok) return false;

    return await actualizarEstadoPaciente(id, {
        estado: "pago_manual",
        recepcion_id: RECEPCION_ACTUAL.id,
        recepcion_numero: RECEPCION_ACTUAL.numero,
        recepcion_nombre: modulo,
        registro_manual_recepcion: true,
        tipo_pago: "manual",
        hora_pago_manual_activado: serverTimestamp()
    });
}

async function confirmarPago(id, paciente) {
    const nombrePaciente = paciente.nombre || "SIN NOMBRE";
    const estado = normalizarEstado(paciente.estado);
    const esManual = paciente?.registro_manual_recepcion === true || estado === "pago_manual";

    const ok = confirm(
        esManual
            ? `¿Confirmar pago manual de ${nombrePaciente}?`
            : `¿Confirmar que ${nombrePaciente} realizó el pago?`
    );
    if (!ok) return false;

    const payload = {
        estado: "pagado",
        hora_pago: serverTimestamp(),
        recepcion_id: paciente.recepcion_id || RECEPCION_ACTUAL.id,
        recepcion_numero: paciente.recepcion_numero || RECEPCION_ACTUAL.numero,
        recepcion_nombre: paciente.recepcion_nombre || RECEPCION_ACTUAL.box || RECEPCION_ACTUAL.nombre
    };

    if (esManual) {
        payload.registro_manual_recepcion = true;
        payload.tipo_pago = "manual";
    } else {
        payload.registro_manual_recepcion = false;
        payload.tipo_pago = null;
    }

    return await actualizarEstadoPaciente(id, payload);
}

function crearControlAccion(id, paciente) {
    const wrap = document.createElement("div");
    wrap.className = "actions";

    const estado = normalizarEstado(paciente.estado);
    const btn = document.createElement("button");
    btn.className = "btn-action";

    if (estado === "pendiente") {
        btn.classList.add("btn-call");
        btn.textContent = "LLAMAR";
        btn.disabled = true;
        wrap.appendChild(btn);
        return wrap;
    }

    if (estado === "llegado") {
        btn.classList.add("btn-call");
        btn.textContent = "LLAMAR";
        btn.disabled = false;
        btn.addEventListener("click", async () => {
            btn.disabled = true;
            const ok = await confirmarLlamadoRecepcion(id, paciente);
            if (!ok) btn.disabled = false;
        });
        wrap.appendChild(btn);
        return wrap;
    }

    if (estado === "llamado_recepcion" || estado === "pago_manual") {
        btn.classList.add("btn-pay");
        btn.textContent = "PAGAR";
        btn.disabled = false;
        btn.addEventListener("click", async () => {
            btn.disabled = true;
            const ok = await confirmarPago(id, paciente);
            if (!ok) btn.disabled = false;
        });
        wrap.appendChild(btn);
        return wrap;
    }

    return wrap;
}

function crearCheckboxPagoManual(id, paciente) {
    const wrap = document.createElement("div");
    wrap.className = "direct-wrap";

    const estado = normalizarEstado(paciente.estado);
    const btnCheck = document.createElement("button");
    btnCheck.type = "button";
    btnCheck.className = "btn-direct";
    btnCheck.title = "Pago manual";

    if (estado === "pago_manual") {
        btnCheck.classList.add("direct-activo");
        btnCheck.textContent = "✓";
        btnCheck.disabled = true;
        wrap.appendChild(btnCheck);
        return wrap;
    }

    if (paciente?.registro_manual_recepcion === true) {
        btnCheck.classList.add("direct-activo");
        btnCheck.textContent = "✓";
        btnCheck.disabled = true;
        wrap.appendChild(btnCheck);
        return wrap;
    }

    btnCheck.textContent = "";
    btnCheck.disabled = true;

    if (estado === "pendiente") {
        btnCheck.disabled = false;
        btnCheck.addEventListener("click", async () => {
            btnCheck.disabled = true;
            const ok = await activarPagoManual(id, paciente);
            if (!ok) btnCheck.disabled = false;
        });
    }

    wrap.appendChild(btnCheck);
    return wrap;
}

function crearResultadoHistorial(paciente) {
    const wrap = document.createElement("div");
    wrap.className = "actions";

    const texto = document.createElement("span");
    texto.className = "check";
    texto.textContent = "✔";

    const estadoNormalizado = normalizarEstado(paciente.estado);

    if (paciente?.registro_manual_recepcion === true) {
        texto.title = "Paciente registrado con pago manual";
    } else if (estadoNormalizado === "pagado") {
        texto.title = "Paciente pagado";
    } else if (estadoNormalizado === "llamado_doctor") {
        texto.title = "Paciente llamado por doctor";
    } else if (estadoNormalizado === "atendido") {
        texto.title = "Atención finalizada";
    } else {
        texto.title = "Movimiento registrado";
    }

    wrap.appendChild(texto);
    return wrap;
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
    if (!paciente.recepcion_nombre) recepcion.classList.add("muted");

    const estadoWrap = document.createElement("div");
    estadoWrap.className = "estado-wrap";
    estadoWrap.appendChild(crearBadgeEstado(paciente));

    row.appendChild(name);
    row.appendChild(docDiv);
    row.appendChild(hora);
    row.appendChild(recepcion);
    row.appendChild(estadoWrap);
    row.appendChild(crearControlAccion(id, paciente));
    row.appendChild(crearCheckboxPagoManual(id, paciente));

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
    if (!paciente.recepcion_nombre) recepcion.classList.add("muted");

    const estadoWrap = document.createElement("div");
    estadoWrap.className = "estado-wrap";
    estadoWrap.appendChild(crearBadgeEstado(paciente));

    row.appendChild(name);
    row.appendChild(docDiv);
    row.appendChild(hora);
    row.appendChild(recepcion);
    row.appendChild(estadoWrap);
    row.appendChild(crearResultadoHistorial(paciente));

    return row;
}

function iniciarListenerAgendados() {
    const qAgendados = query(collection(db, "agendados"), orderBy("hora_consulta", "asc"));

    onSnapshot(
        qAgendados,
        async (snapshot) => {
            const esperaDiv = document.getElementById("lista-espera");
            const atendidosDiv = document.getElementById("lista-atendidos");

            if (!esperaDiv || !atendidosDiv) return;

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

                if (fechaTurno !== fechaHoy) continue;
                if (!ESTADOS_AGENDA.includes(estado) && !ESTADOS_HISTORIAL.includes(estado)) continue;

                const nombreDoctor = await obtenerNombreDoctor(paciente.doctor_id);

                if (ESTADOS_HISTORIAL.includes(estado)) {
                    atendidosDiv.appendChild(crearFilaHistorial(paciente, nombreDoctor));
                    contAtendidos++;
                } else {
                    esperaDiv.appendChild(crearFilaEspera(id, paciente, nombreDoctor));
                    contEspera++;
                }
            }

            if (contEspera === 0) {
                esperaDiv.innerHTML = '<div class="empty-msg">No hay pacientes en recepción hoy.</div>';
            }

            if (contAtendidos === 0) {
                atendidosDiv.innerHTML = '<div class="empty-msg">No hay movimientos registrados hoy.</div>';
            }
        },
        (error) => {
            console.error("Error en onSnapshot:", error);

            const esperaDiv = document.getElementById("lista-espera");
            const atendidosDiv = document.getElementById("lista-atendidos");

            if (esperaDiv) {
                esperaDiv.innerHTML = `<div class="empty-msg">Error cargando agenda: ${error.message}</div>`;
            }

            if (atendidosDiv) {
                atendidosDiv.innerHTML = `<div class="empty-msg">Error cargando historial: ${error.message}</div>`;
            }
        }
    );
}

mostrarFechaCabecera();

const btnCerrarSesion = document.getElementById("btn-cerrar-sesion");
if (btnCerrarSesion) {
    btnCerrarSesion.addEventListener("click", cerrarSesion);
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login-recepcion.html";
        return;
    }

    await cargarRecepcionDesdeFirestore(user);
    iniciarListenerAgendados();
});