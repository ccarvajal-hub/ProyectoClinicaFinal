import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    onSnapshot,
    doc,
    updateDoc,
    query,
    where,
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
const auth = getAuth(app);
const db = getFirestore(app);

const ESTADOS = {
    PENDIENTE: "pendiente",
    LLEGADO: "llegado",
    LLAMADO_RECEPCION: "llamado_recepcion",
    PAGO_MANUAL: "pago_manual",
    PAGADO: "pagado",
    LLAMADO_DOCTOR: "llamado_doctor",
    ATENDIDO: "atendido"
};

let nombreDoc = "";
let boxDoc = "";
let uidDoc = "";

function formatRut(rut) {
    if (!rut) return "---";
    const value = rut.toString().replace(/\./g, "").replace("-", "");
    if (value.length < 2) return value;
    const cuerpo = value.slice(0, -1);
    const dv = value.slice(-1).toUpperCase();
    return cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + dv;
}

function obtenerFechaHoyChile() {
    const partes = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Santiago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date());

    const year = partes.find(p => p.type === "year")?.value;
    const month = partes.find(p => p.type === "month")?.value;
    const day = partes.find(p => p.type === "day")?.value;

    return `${year}-${month}-${day}`;
}

function obtenerPartesFechaHoyChile() {
    const formatter = new Intl.DateTimeFormat("es-CL", {
        timeZone: "America/Santiago",
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    });

    const parts = formatter.formatToParts(new Date());

    let weekday = "";
    let day = "";
    let month = "";
    let year = "";

    for (const part of parts) {
        if (part.type === "weekday") weekday = part.value;
        if (part.type === "day") day = part.value;
        if (part.type === "month") month = part.value;
        if (part.type === "year") year = part.value;
    }

    return { weekday, day, month, year };
}

function renderAgendaDia() {
    const agendaEl = document.getElementById("agenda-dia");
    if (!agendaEl) return;

    const { weekday, day, month, year } = obtenerPartesFechaHoyChile();
    const weekdayCapitalizado = weekday.charAt(0).toUpperCase() + weekday.slice(1);

    agendaEl.innerHTML = `<span class="agenda-label">Agenda del día:</span> <span class="agenda-fecha">${weekdayCapitalizado}, ${day} de ${month} de ${year}</span>`;
}

function obtenerHoraChile24() {
    return new Intl.DateTimeFormat("es-CL", {
        timeZone: "America/Santiago",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).format(new Date());
}

function horaATotalMinutos(hora) {
    if (!hora || typeof hora !== "string") return 999999;
    const [hh, mm] = hora.split(":").map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return 999999;
    return (hh * 60) + mm;
}

function normalizarEstado(estado) {
    return String(estado || ESTADOS.PENDIENTE)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

function textoEstado(estado) {
    const e = normalizarEstado(estado);

    if (e === ESTADOS.PENDIENTE) return "PENDIENTE";
    if (e === ESTADOS.LLEGADO) return "EN RECEPCIÓN";
    if (e === ESTADOS.LLAMADO_RECEPCION) return "LLAMADO A<br>RECEPCIÓN";
    if (e === ESTADOS.PAGO_MANUAL) return "PAGO MANUAL";
    if (e === ESTADOS.PAGADO) return "PAGADO";
    if (e === ESTADOS.LLAMADO_DOCTOR) return "LLAMADO A<br>CONSULTA";
    if (e === ESTADOS.ATENDIDO) return "ATENDIDO";

    return "PENDIENTE";
}

function claseBadge(estado) {
    const e = normalizarEstado(estado);

    if (e === ESTADOS.PENDIENTE) return "badge-pendiente";
    if (e === ESTADOS.LLEGADO) return "badge-llegado";
    if (e === ESTADOS.LLAMADO_RECEPCION) return "badge-llamado_recepcion";
    if (e === ESTADOS.PAGO_MANUAL) return "badge-pago_manual";
    if (e === ESTADOS.PAGADO) return "badge-pagado";
    if (e === ESTADOS.LLAMADO_DOCTOR) return "badge-llamado_doctor";
    if (e === ESTADOS.ATENDIDO) return "badge-atendido";

    return "badge-pendiente";
}

function construirBotonAccion(p) {
    const estado = normalizarEstado(p.estado);
    const nombreSeguro = (p.nombre || "").replace(/'/g, "\\'");

    if (estado === ESTADOS.PAGADO) {
        return `<button class="btn-action btn-call" onclick="confirmarLlamado('${p.id}','${nombreSeguro}')">Llamar</button>`;
    }

    if (estado === ESTADOS.LLAMADO_DOCTOR) {
        return `<button class="btn-action btn-finish" onclick="confirmarFinalizar('${p.id}','${nombreSeguro}')">Finalizar</button>`;
    }

    return `<button class="btn-action" disabled>Llamar</button>`;
}

window.cambiarEstado = async (id, nuevo, nombre = "") => {
    try {
        const updateData = { estado: nuevo };

        if (nuevo === ESTADOS.LLAMADO_DOCTOR) {
            const ahora = Date.now();
            const horaActual = obtenerHoraChile24();

            updateData.ultimo_llamado = ahora;
            updateData.tv_origen = "DOCTOR";
            updateData.tv_destino = boxDoc || "";
            updateData.tv_hora_llamado = horaActual;
            updateData.tv_doctor = nombreDoc ? `DR. ${nombreDoc}` : "";
            updateData.tv_paciente = nombre || "";
        }

        if (nuevo === ESTADOS.ATENDIDO) {
            updateData.tv_origen = "";
            updateData.tv_destino = "";
            updateData.tv_hora_llamado = "";
        }

        await updateDoc(doc(db, "agendados", id), updateData);
    } catch (e) {
        console.error("Error al cambiar estado:", e);
        alert("No se pudo actualizar el estado del paciente.");
    }
};

window.confirmarLlamado = async (id, nombre) => {
    const ok = confirm(`¿Llamar ahora a ${nombre}?`);
    if (!ok) return;
    await window.cambiarEstado(id, ESTADOS.LLAMADO_DOCTOR, nombre);
};

window.confirmarFinalizar = async (id, nombre) => {
    const ok = confirm(`¿Finalizar atención de ${nombre}?`);
    if (!ok) return;
    await window.cambiarEstado(id, ESTADOS.ATENDIDO, nombre);
};

const btnLogout = document.getElementById("btnLogout");
if (btnLogout) {
    btnLogout.onclick = async () => {
        await signOut(auth);
        location.href = "login.html";
    };
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        location.href = "login.html";
        return;
    }

    const fechaHoy = obtenerFechaHoyChile();
    renderAgendaDia();

    try {
        uidDoc = user.uid;

        const dSnap = await getDoc(doc(db, "doctores", uidDoc));

        if (!dSnap.exists()) {
            alert("Este usuario no pertenece al módulo doctor.");
            await signOut(auth);
            location.href = "login.html";
            return;
        }

        const data = dSnap.data();
        nombreDoc = data.nombre || "";
        boxDoc = `PISO ${data.piso} - CONSULTA ${data.consulta}`;

        const displayName = document.getElementById("display-name");
        if (displayName) {
            displayName.innerText = `DR. ${nombreDoc}`;
        }

        const q = query(
            collection(db, "agendados"),
            where("doctor_id", "==", uidDoc),
            where("fecha_turno", "==", fechaHoy)
        );

        onSnapshot(q, (snapshot) => {
            const esperaDiv = document.getElementById("lista-espera");
            const historialDiv = document.getElementById("lista-historial");

            if (!esperaDiv || !historialDiv) return;

            esperaDiv.innerHTML = "";
            historialDiv.innerHTML = "";

            const pacientes = snapshot.docs.map((docSnap) => ({
                id: docSnap.id,
                ...docSnap.data()
            }));

            const espera = pacientes
                .filter((p) => normalizarEstado(p.estado) !== ESTADOS.ATENDIDO)
                .sort((a, b) => {
                    const ordenEstados = {
                        [ESTADOS.PENDIENTE]: 0,
                        [ESTADOS.LLEGADO]: 1,
                        [ESTADOS.LLAMADO_RECEPCION]: 2,
                        [ESTADOS.PAGO_MANUAL]: 3,
                        [ESTADOS.PAGADO]: 4,
                        [ESTADOS.LLAMADO_DOCTOR]: 5
                    };

                    const ordenA = ordenEstados[normalizarEstado(a.estado)] ?? 99;
                    const ordenB = ordenEstados[normalizarEstado(b.estado)] ?? 99;

                    if (ordenA !== ordenB) return ordenA - ordenB;
                    return horaATotalMinutos(a.hora_consulta) - horaATotalMinutos(b.hora_consulta);
                });

            const historial = pacientes
                .filter((p) => normalizarEstado(p.estado) === ESTADOS.ATENDIDO)
                .sort((a, b) => horaATotalMinutos(a.hora_consulta) - horaATotalMinutos(b.hora_consulta));

            espera.forEach((p) => {
                const row = document.createElement("div");
                row.className = "row-espera";

                row.innerHTML = `
                    <div class="name">${p.nombre || ""}</div>
                    <div class="rut-col">${formatRut(p.rut)}</div>
                    <div class="hora">${p.hora_consulta || "--:--"}</div>
                    <div class="llegada-col ${p.hora_llegada ? "" : "muted"}">${p.hora_llegada || "--:--"}</div>
                    <div class="estado-wrap">
                        <span class="badge ${claseBadge(p.estado)}">${textoEstado(p.estado)}</span>
                    </div>
                    <div class="actions">
                        ${construirBotonAccion(p)}
                    </div>
                `;

                esperaDiv.appendChild(row);
            });

            historial.forEach((p) => {
                const row = document.createElement("div");
                row.className = "row-historial";

                row.innerHTML = `
                    <div class="name">${p.nombre || ""}</div>
                    <div class="rut-col">${formatRut(p.rut)}</div>
                    <div class="hora">${p.hora_consulta || "--:--"}</div>
                    <div class="llegada-col ${p.hora_llegada ? "" : "muted"}">${p.hora_llegada || "--:--"}</div>
                    <div class="estado-wrap">
                        <span class="badge ${claseBadge(p.estado)}">${textoEstado(p.estado)}</span>
                    </div>
                    <div class="resultado-wrap">
                        <span class="check">✓</span>
                    </div>
                `;

                historialDiv.appendChild(row);
            });

            if (espera.length === 0) {
                esperaDiv.innerHTML = `<div class="empty-msg">No hay pacientes por atender hoy.</div>`;
            }

            if (historial.length === 0) {
                historialDiv.innerHTML = `<div class="empty-msg">No hay historial hoy.</div>`;
            }
        }, (error) => {
            console.error("Error al escuchar agenda del doctor:", error);
            document.getElementById("lista-espera").innerHTML = `<div class="empty-msg">Error al cargar la agenda.</div>`;
            document.getElementById("lista-historial").innerHTML = `<div class="empty-msg">No se pudo cargar el historial.</div>`;
        });

    } catch (error) {
        console.error("Error al validar doctor:", error);
        alert("No se pudo validar el acceso del doctor.");
        await signOut(auth);
        location.href = "login.html";
    }
});