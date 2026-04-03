import {
  doc,
  collection,
  query,
  where,
  limit,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase-config.js";

(() => {
  const DEBUG_MODE = false;

  const $ = (id) => document.getElementById(id);

  const refs = {
    pacienteNombre: $("paciente-nombre"),
    doctorNombre: $("doctor-nombre"),
    ubicacionTexto: $("ubicacion-texto"),
    tiempoEstimado: $("tiempo-estimado"),
    estadoChip: $("estado-chip"),
    estadoMensaje: $("estado-mensaje"),
    timelineSteps: $("timeline-steps"),
    ultimaActualizacion: $("ultima-actualizacion"),

    preTicketOverlay: $("pre-ticket-overlay"),
    btnActivarNotificaciones: $("btn-activar-notificaciones"),
    btnContinuarSinNotificaciones: $("btn-continuar-sin-notificaciones"),
    preTicketStatus: $("pre-ticket-status"),
  };

  const urlParams = new URLSearchParams(window.location.search);

  let unsubscribeFirestore = null;
  let unsubscribePassLookup = null;
  let unsubscribeDoctores = null;
  let latestData = null;

  let notificationsArmed = false;
  let lastStatusKey = null;
  let hasInitialStatus = false;

  let doctoresMap = {};

  const DEFAULT_STATUS_MESSAGE =
    "Estamos preparando tu atención. Mantente atento a los próximos llamados.";

  const STEP_ORDER = [
    "EN ESPERA",
    "LLAMADO RECEPCION",
    "LLAMADO CONSULTA",
    "ATENDIDO",
  ];

  const STATUS_MAP = {
    pendiente: {
      label: "EN ESPERA",
      chipClass: "estado-espera",
      message: DEFAULT_STATUS_MESSAGE,
      stepIndex: 0,
    },
    agendado: {
      label: "EN ESPERA",
      chipClass: "estado-espera",
      message: DEFAULT_STATUS_MESSAGE,
      stepIndex: 0,
    },
    confirmado: {
      label: "EN ESPERA",
      chipClass: "estado-espera",
      message: DEFAULT_STATUS_MESSAGE,
      stepIndex: 0,
    },
    llegado: {
      label: "EN ESPERA",
      chipClass: "estado-espera",
      message: "Tu llegada ya fue registrada. Espera el llamado de recepción.",
      stepIndex: 0,
    },
    llamado_recepcion: {
      label: "LLAMADO RECEPCION",
      chipClass: "estado-recepcion",
      message: "Acércate a recepción. Ya es tu turno.",
      stepIndex: 1,
    },
    pago_manual: {
      label: "LLAMADO RECEPCION",
      chipClass: "estado-recepcion",
      message: "Acércate a recepción para continuar con tu atención.",
      stepIndex: 1,
    },
    pagado: {
      label: "EN ESPERA",
      chipClass: "estado-espera",
      message: "Recepción completada. Espera el llamado a consulta.",
      stepIndex: 1,
    },
    llamado_doctor: {
      label: "LLAMADO CONSULTA",
      chipClass: "estado-consulta",
      message: "Ya puedes dirigirte a tu consulta.",
      stepIndex: 2,
    },
    atendido: {
      label: "ATENDIDO",
      chipClass: "estado-atendido",
      message: "Tu atención fue finalizada.",
      stepIndex: 3,
    },
  };

  function debugLog(label, value) {
    if (!DEBUG_MODE) return;

    let box = document.getElementById("debug-box");

    if (!box) {
      box = document.createElement("div");
      box.id = "debug-box";
      box.style.position = "fixed";
      box.style.left = "10px";
      box.style.right = "10px";
      box.style.top = "10px";
      box.style.bottom = "auto";
      box.style.zIndex = "99999";
      box.style.background = "rgba(0,0,0,0.88)";
      box.style.color = "#00ff88";
      box.style.fontSize = "11px";
      box.style.lineHeight = "1.35";
      box.style.padding = "10px";
      box.style.borderRadius = "12px";
      box.style.maxHeight = "30vh";
      box.style.overflow = "auto";
      box.style.whiteSpace = "pre-wrap";
      box.style.wordBreak = "break-word";
      box.style.fontFamily = "monospace";
      document.body.appendChild(box);
    }

    let textValue = "";
    try {
      textValue =
        typeof value === "object"
          ? JSON.stringify(value, null, 2)
          : String(value);
    } catch {
      textValue = String(value);
    }

    box.textContent += `${label}: ${textValue}\n\n`;
  }

  function clearDebugBox() {
    if (!DEBUG_MODE) return;
    const box = document.getElementById("debug-box");
    if (box) box.textContent = "";
  }

  function getNowTimeString() {
    try {
      return new Date().toLocaleTimeString("es-CL", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return "--:--:--";
    }
  }

  function titleCase(text) {
    const source = String(text || "").trim();
    if (!source) return "";

    return source
      .toLocaleLowerCase("es-CL")
      .replace(/\p{L}+/gu, (word) => {
        const first = word.charAt(0).toLocaleUpperCase("es-CL");
        const rest = word.slice(1);
        return `${first}${rest}`;
      });
  }

  function safeText(value, fallback = "--") {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text ? text : fallback;
  }

  function getFirstDefined(obj, keys, fallback = "") {
    for (const key of keys) {
      if (
        obj &&
        obj[key] !== undefined &&
        obj[key] !== null &&
        String(obj[key]).trim() !== ""
      ) {
        return obj[key];
      }
    }
    return fallback;
  }

  function normalizeStatus(rawStatus) {
    const status = String(rawStatus || "").trim().toLowerCase();
    return STATUS_MAP[status] ? status : "pendiente";
  }

  function getChileDate() {
    try {
      const now = new Date();
      return now.toLocaleDateString("sv-SE", {
        timeZone: "America/Santiago",
      });
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function normalizeRut(value) {
    return String(value || "")
      .replace(/\./g, "")
      .replace(/-/g, "")
      .trim()
      .toUpperCase();
  }

  function minutesBetweenNowAndHour(hora) {
    if (!hora || !/^\d{1,2}:\d{2}$/.test(hora)) return null;

    const [hh, mm] = hora.split(":").map(Number);
    const now = new Date();
    const chile = new Date(
      now.toLocaleString("en-US", { timeZone: "America/Santiago" })
    );

    const target = new Date(chile);
    target.setHours(hh, mm, 0, 0);

    const diffMs = target.getTime() - chile.getTime();
    return Math.round(diffMs / 60000);
  }

  function resolveEstimatedTime(data) {
    const explicitText = getFirstDefined(data, [
      "tiempo_estimado",
      "tiempoEstimado",
      "tiempo_espera",
      "tiempoEspera",
      "estimado",
    ]);

    if (explicitText) {
      return safeText(explicitText, "Por confirmar");
    }

    const explicitMinutes = getFirstDefined(data, [
      "minutos_estimados",
      "minutosEstimados",
      "minutos_espera",
      "minutosEspera",
    ]);

    if (explicitMinutes !== "") {
      const n = Number(explicitMinutes);
      if (!Number.isNaN(n) && n >= 0) {
        if (n === 0) return "Sin espera";
        if (n === 1) return "1 minuto";
        return `${n} minutos`;
      }
    }

    const status = normalizeStatus(getFirstDefined(data, ["estado"], "pendiente"));
    const horaConsulta = getFirstDefined(data, ["hora_consulta", "horaConsulta"]);

    if (status === "llamado_doctor") return "Pasa ahora";
    if (status === "llamado_recepcion") return "Pasa ahora";
    if (status === "atendido") return "Finalizado";

    if (horaConsulta) {
      const diff = minutesBetweenNowAndHour(horaConsulta);

      if (diff !== null) {
        if (diff <= 0) return "En curso";
        if (diff <= 5) return "< 5 min";
        if (diff <= 15) return "15 min";
        if (diff <= 30) return "30 min";
        return `${diff} min`;
      }
    }

    return "Por confirmar";
  }

  function renderTimeline(statusKey) {
    if (!refs.timelineSteps) return;

    const currentIndex = STATUS_MAP[statusKey]?.stepIndex ?? 0;
    refs.timelineSteps.innerHTML = "";

    STEP_ORDER.forEach((label, index) => {
      const step = document.createElement("div");
      step.className = "timeline-step";

      if (index < currentIndex) step.classList.add("done");
      if (index === currentIndex) step.classList.add("active");

      const text = document.createElement("div");
      text.className = "step-text";
      text.textContent = label;

      step.appendChild(text);
      refs.timelineSteps.appendChild(step);
    });
  }

  function construirUbicacionDoctor(piso, consulta) {
    const pisoTexto = String(piso ?? "").trim();
    const consultaTexto = String(consulta ?? "").trim();

    if (pisoTexto && consultaTexto) return `Piso ${pisoTexto} - Consulta ${consultaTexto}`;
    if (pisoTexto) return `Piso ${pisoTexto}`;
    if (consultaTexto) return `Consulta ${consultaTexto}`;

    return "Por confirmar";
  }

  function obtenerDoctorDesdeCache(doctorId) {
    const doctor = doctoresMap[String(doctorId || "").trim()];

    if (!doctor) {
      return {
        nombre: "Por asignar",
        ubicacion: "Por confirmar"
      };
    }

    const nombre =
      doctor.nombre ||
      doctor.nombre_doctor ||
      doctor.displayName ||
      "Por asignar";

    const ubicacion = construirUbicacionDoctor(
      doctor.piso,
      doctor.consulta
    );

    return { nombre, ubicacion };
  }

  function fireTicketNotification(statusKey, data) {
    if (!notificationsArmed) return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    try {
      const { nombre: doctor, ubicacion } = obtenerDoctorDesdeCache(data.doctor_id);

      const tagId = getFirstDefined(data, ["id", "agendadoId"], "general");

      if (statusKey === "llamado_recepcion") {
        new Notification("Recepción te está llamando", {
          body: `Dirígete a recepción. Ubicación: ${ubicacion}`,
          tag: `ticket-llamado-recepcion-${tagId}`,
        });
      }

      if (statusKey === "llamado_doctor") {
        new Notification("Ya puedes entrar a consulta", {
          body: `Doctor: ${doctor}. Ubicación: ${ubicacion}`,
          tag: `ticket-llamado-doctor-${tagId}`,
        });
      }
    } catch (error) {
      console.error("No se pudo mostrar la notificación:", error);
      debugLog("Error notificación", error?.message || error);
    }
  }

  function maybeNotifyStatusChange(statusKey, data) {
    if (!hasInitialStatus) {
      hasInitialStatus = true;
      lastStatusKey = statusKey;
      return;
    }

    if (statusKey === lastStatusKey) return;

    fireTicketNotification(statusKey, data);
    lastStatusKey = statusKey;
  }

  function render(data) {
    latestData = { ...(latestData || {}), ...(data || {}) };

    const paciente = getFirstDefined(latestData, [
      "nombre_paciente",
      "nombrePaciente",
      "paciente",
      "nombre",
      "paciente_nombre",
    ]);

    const { nombre: doctor, ubicacion } = obtenerDoctorDesdeCache(
      latestData.doctor_id
    );

    const rawStatus = getFirstDefined(latestData, ["estado"], "pendiente");
    const statusKey = normalizeStatus(rawStatus);
    const statusData = STATUS_MAP[statusKey] || STATUS_MAP.pendiente;

    if (refs.pacienteNombre) {
      refs.pacienteNombre.textContent = safeText(
        titleCase(paciente),
        "Paciente no disponible"
      );
    }

    if (refs.doctorNombre) {
      refs.doctorNombre.textContent = safeText(titleCase(doctor), "Por asignar");
    }

    if (refs.ubicacionTexto) {
      refs.ubicacionTexto.textContent = safeText(ubicacion, "Por confirmar");
    }

    if (refs.tiempoEstimado) {
      refs.tiempoEstimado.textContent = resolveEstimatedTime(latestData);
    }

    if (refs.estadoChip) {
      refs.estadoChip.textContent = statusData.label;
      refs.estadoChip.className = `estado-chip ${statusData.chipClass}`;
    }

    if (refs.estadoMensaje) {
      refs.estadoMensaje.textContent =
        safeText(statusData.message, DEFAULT_STATUS_MESSAGE);
    }

    renderTimeline(statusKey);

    if (refs.ultimaActualizacion) {
      refs.ultimaActualizacion.textContent = `Última actualización: ${getNowTimeString()}`;
    }

    maybeNotifyStatusChange(statusKey, latestData);
  }

  function readFromUrl() {
    return {
      pass: urlParams.get("pass") || "",
      id: urlParams.get("id") || urlParams.get("agendadoId") || "",
      agendadoId: urlParams.get("agendadoId") || urlParams.get("id") || "",
      nombre_paciente:
        urlParams.get("paciente") ||
        urlParams.get("nombre") ||
        urlParams.get("nombre_paciente") ||
        "",
      doctor_nombre:
        urlParams.get("doctor") ||
        urlParams.get("doctor_nombre") ||
        "",
      ubicacion:
        urlParams.get("ubicacion") ||
        urlParams.get("destino") ||
        "",
      hora_consulta:
        urlParams.get("hora") ||
        urlParams.get("hora_consulta") ||
        "",
      estado: urlParams.get("estado") || "",
      rut: urlParams.get("rut") || "",
      fecha_turno: urlParams.get("fecha") || "",
      minutos_estimados:
        urlParams.get("minutos") ||
        urlParams.get("minutos_estimados") ||
        "",
    };
  }

  function readFromStorage() {
    const keys = [
      "ticketDigitalData",
      "ticketPacienteData",
      "agendadoActual",
      "ticketData",
      "pacienteTicket",
    ];

    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;

        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      } catch (error) {
        console.warn(`No se pudo leer ${key}:`, error);
        debugLog(`Error leyendo storage ${key}`, error?.message || error);
      }
    }

    return {};
  }

  function removeEmptyFields(obj) {
    const clean = {};

    Object.keys(obj || {}).forEach((key) => {
      const value = obj[key];

      if (value === null || value === undefined) return;
      if (typeof value === "string" && value.trim() === "") return;

      clean[key] = value;
    });

    return clean;
  }

  function mergeInitialData() {
    const fromStorage = removeEmptyFields(readFromStorage());
    const fromUrl = removeEmptyFields(readFromUrl());

    return {
      ...fromStorage,
      ...fromUrl,
    };
  }

  function setupStorageSync() {
    window.addEventListener("storage", () => {
      debugLog("Evento storage", "detectado");
      const storageData = readFromStorage();
      render(storageData);
    });
  }

  function cleanupListeners() {
    if (typeof unsubscribePassLookup === "function") {
      unsubscribePassLookup();
      unsubscribePassLookup = null;
    }

    if (typeof unsubscribeFirestore === "function") {
      unsubscribeFirestore();
      unsubscribeFirestore = null;
    }

    if (typeof unsubscribeDoctores === "function") {
      unsubscribeDoctores();
      unsubscribeDoctores = null;
    }
  }

  function listenDoctores() {
    if (typeof unsubscribeDoctores === "function") {
      unsubscribeDoctores();
      unsubscribeDoctores = null;
    }

    unsubscribeDoctores = onSnapshot(
      collection(db, "doctores"),
      (snapshot) => {
        doctoresMap = {};

        snapshot.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const uid = String(data.uid || "").trim();

          if (uid) {
            doctoresMap[uid] = {
              id: docSnap.id,
              ...data
            };
          }
        });

        debugLog("DOCTORES CACHE", doctoresMap);

        if (latestData) {
          render(latestData);
        }
      },
      (error) => {
        console.error("[ticket] Error onSnapshot doctores:", error);
        debugLog("Error onSnapshot doctores", error?.message || error);
      }
    );
  }

  function listenAgendadoById(agendadoId, baseData = {}) {
    if (!agendadoId) {
      debugLog("listenAgendadoById", "agendadoId vacío");
      return;
    }

    if (typeof unsubscribeFirestore === "function") {
      unsubscribeFirestore();
      unsubscribeFirestore = null;
    }

    debugLog("Consulta Firestore por ID", agendadoId);

    const docRef = doc(db, "agendados", agendadoId);

    unsubscribeFirestore = onSnapshot(
      docRef,
      (snap) => {
        debugLog("Snapshot por ID exists", snap.exists());

        if (!snap.exists()) {
          debugLog("Documento por ID", "no existe");
          return;
        }

        const docData = snap.data() || {};
        debugLog("Doc data por ID", docData);

        render({
          ...baseData,
          ...docData,
          agendadoId: snap.id,
          id: snap.id,
        });
      },
      (error) => {
        console.error("[ticket] Error onSnapshot por ID:", error);
        debugLog("Error onSnapshot por ID", error?.message || error);
      }
    );
  }

  function startPassLookup(pass) {
    if (!pass) return false;

    debugLog("Modo PASS", pass);

    if (typeof unsubscribePassLookup === "function") {
      unsubscribePassLookup();
      unsubscribePassLookup = null;
    }

    const passQuery = query(
      collection(db, "pases_paciente"),
      where("pass_id", "==", pass),
      where("activo", "==", true),
      limit(1)
    );

    unsubscribePassLookup = onSnapshot(
      passQuery,
      (snapshot) => {
        debugLog("Snapshot pases_paciente empty", snapshot.empty);
        debugLog("Snapshot pases_paciente size", snapshot.size);

        if (snapshot.empty) {
          debugLog("PASS", "no encontrado");
          return;
        }

        const paseDoc = snapshot.docs[0];
        const paseData = paseDoc.data() || {};
        debugLog("PASE encontrado", paseData);

        const agendadoId = getFirstDefined(paseData, [
          "agendado_id",
          "agendadoId",
          "id_agendado",
        ]);

        if (!agendadoId) {
          debugLog("Error", "pase sin agendado_id");
          return;
        }

        debugLog("AgendadoId desde pase", agendadoId);

        listenAgendadoById(agendadoId, {
          pass,
          paseId: paseDoc.id,
        });
      },
      (error) => {
        console.error("[ticket] Error onSnapshot pases_paciente:", error);
        debugLog("Error onSnapshot pases_paciente", error?.message || error);
      }
    );

    return true;
  }

  function startRealtimeFirestore(baseData) {
    try {
      cleanupListeners();
      listenDoctores();

      const pass = getFirstDefined(baseData, ["pass"], urlParams.get("pass") || "");
      debugLog("Firestore", "modular OK");
      debugLog("baseData", baseData);
      debugLog("pass", pass || "(vacío)");

      if (pass) {
        const startedPassFlow = startPassLookup(pass);
        if (startedPassFlow) return;
      }

      let agendadoId =
        baseData.agendadoId ||
        baseData.id ||
        urlParams.get("agendadoId") ||
        urlParams.get("id") ||
        "";

      agendadoId = String(agendadoId || "").trim();

      debugLog("agendadoId", agendadoId || "(vacío)");

      if (agendadoId) {
        listenAgendadoById(agendadoId, baseData);
        return;
      }

      const rawRut = getFirstDefined(baseData, ["rut"], "");
      const rut = normalizeRut(rawRut);
      const fechaTurno = getFirstDefined(baseData, ["fecha_turno"], getChileDate());

      debugLog("Sin agendadoId", "buscando por rut/fecha");
      debugLog("rut original", rawRut || "(vacío)");
      debugLog("rut normalizado", rut || "(vacío)");
      debugLog("fechaTurno", fechaTurno || "(vacío)");

      if (!rut) {
        debugLog("Firestore", "no hay pass, rut ni agendadoId");
        return;
      }

      const q = query(
        collection(db, "agendados"),
        where("rut", "==", rut),
        where("fecha_turno", "==", fechaTurno),
        limit(1)
      );

      unsubscribeFirestore = onSnapshot(
        q,
        (snapshot) => {
          debugLog("Snapshot por rut/fecha empty", snapshot.empty);
          debugLog("Snapshot por rut/fecha size", snapshot.size);

          if (snapshot.empty) {
            debugLog("Resultado rut/fecha", "sin documentos");
            return;
          }

          const foundDoc = snapshot.docs[0];
          const docData = foundDoc.data() || {};
          debugLog("Doc data por rut/fecha", docData);

          render({
            ...baseData,
            ...docData,
            agendadoId: foundDoc.id,
            id: foundDoc.id,
          });
        },
        (error) => {
          console.error("[ticket] Error onSnapshot rut/fecha:", error);
          debugLog("Error onSnapshot rut/fecha", error?.message || error);
        }
      );
    } catch (error) {
      console.error("[ticket] No se pudo iniciar tiempo real con Firestore:", error);
      debugLog("Error startRealtimeFirestore", error?.message || error);
    }
  }

  function refreshFromCurrentSources() {
    const storageData = readFromStorage();

    if (Object.keys(storageData).length) {
      render(storageData);
      return;
    }

    if (latestData) {
      render(latestData);
    }
  }

  function openTicket() {
    document.body.classList.remove("pre-ticket-open");
    if (refs.preTicketOverlay) {
      refs.preTicketOverlay.classList.add("hidden");
    }
  }

  async function handleActivateNotifications() {
    if (!refs.preTicketStatus) {
      openTicket();
      return;
    }

    if (!("Notification" in window)) {
      notificationsArmed = false;
      refs.preTicketStatus.textContent =
        "Este dispositivo no admite notificaciones.";
      setTimeout(openTicket, 600);
      return;
    }

    try {
      if (Notification.permission === "granted") {
        notificationsArmed = true;
        refs.preTicketStatus.textContent = "Notificaciones activadas.";
        setTimeout(openTicket, 400);
        return;
      }

      if (Notification.permission === "denied") {
        notificationsArmed = false;
        refs.preTicketStatus.textContent =
          "Las notificaciones están bloqueadas en este navegador.";
        setTimeout(openTicket, 700);
        return;
      }

      refs.preTicketStatus.textContent = "Solicitando permiso...";
      const result = await Notification.requestPermission();

      if (result === "granted") {
        notificationsArmed = true;
        refs.preTicketStatus.textContent = "Notificaciones activadas.";
      } else {
        notificationsArmed = false;
        refs.preTicketStatus.textContent = "Entrarás sin notificaciones.";
      }

      setTimeout(openTicket, 500);
    } catch (error) {
      console.error("[ticket] No se pudo solicitar permiso de notificaciones:", error);
      debugLog("Error permiso notificaciones", error?.message || error);
      notificationsArmed = false;
      refs.preTicketStatus.textContent =
        "No se pudo activar. Entrando al ticket...";
      setTimeout(openTicket, 700);
    }
  }

  function handleContinueWithoutNotifications() {
    notificationsArmed = false;
    openTicket();
  }

  function bindEvents() {
    if (refs.btnActivarNotificaciones) {
      refs.btnActivarNotificaciones.addEventListener(
        "click",
        handleActivateNotifications
      );
    }

    if (refs.btnContinuarSinNotificaciones) {
      refs.btnContinuarSinNotificaciones.addEventListener(
        "click",
        handleContinueWithoutNotifications
      );
    }
  }

  function init() {
    clearDebugBox();

    const initialData = mergeInitialData();

    debugLog("init", "ok");
    debugLog("URL params", Object.fromEntries(urlParams.entries()));
    debugLog("initialData", initialData);

    render(initialData);
    setupStorageSync();
    bindEvents();
    startRealtimeFirestore(initialData);

    setInterval(refreshFromCurrentSources, 60000);
  }

  init();
})();