(() => {
  const $ = (id) => document.getElementById(id);

  const refs = {
    pacienteNombre: $("paciente-nombre"),
    doctorNombre: $("doctor-nombre"),
    ubicacionTexto: $("ubicacion-texto"),
    tiempoEstimado: $("tiempo-estimado"),
    estadoChip: $("estado-chip"),
    estadoMensaje: $("estado-mensaje"),
    timelineSteps: $("timeline-steps"),
    btnActualizar: $("btn-actualizar"),
    ultimaActualizacion: $("ultima-actualizacion"),
  };

  const urlParams = new URLSearchParams(window.location.search);
  let unsubscribeFirestore = null;
  let latestData = null;

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
      message:
        "Estamos preparando tu atención. Mantente atento a los próximos llamados.",
      stepIndex: 0,
    },
    agendado: {
      label: "EN ESPERA",
      chipClass: "estado-espera",
      message:
        "Tu atención está registrada. Te avisaremos cuando avance al siguiente paso.",
      stepIndex: 0,
    },
    confirmado: {
      label: "EN ESPERA",
      chipClass: "estado-espera",
      message:
        "Tu llegada fue registrada correctamente. Ahora solo debes esperar el siguiente llamado.",
      stepIndex: 0,
    },
    llegado: {
      label: "EN ESPERA",
      chipClass: "estado-espera",
      message:
        "Tu llegada ya fue confirmada. Estamos preparando el siguiente paso de tu atención.",
      stepIndex: 0,
    },
    llamado_recepcion: {
      label: "LLAMADO RECEPCION",
      chipClass: "estado-recepcion",
      message:
        "Ya puedes dirigirte a recepción. Tu atención sigue avanzando.",
      stepIndex: 1,
    },
    pago_manual: {
      label: "LLAMADO RECEPCION",
      chipClass: "estado-recepcion",
      message:
        "Recepción está gestionando tu atención. Avanzarás pronto al siguiente paso.",
      stepIndex: 1,
    },
    pagado: {
      label: "EN ESPERA",
      chipClass: "estado-espera",
      message:
        "Tu atención administrativa ya está lista. Falta el llamado a consulta.",
      stepIndex: 0,
    },
    llamado_doctor: {
      label: "LLAMADO CONSULTA",
      chipClass: "estado-consulta",
      message:
        "Ya puedes dirigirte a tu consulta. El doctor te está esperando.",
      stepIndex: 2,
    },
    atendido: {
      label: "ATENDIDO",
      chipClass: "estado-atendido",
      message:
        "Tu atención fue finalizada correctamente. Gracias por preferirnos.",
      stepIndex: 3,
    },
  };

  function getNowTimeString() {
    try {
      return new Date().toLocaleTimeString("es-CL", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return "--:--:--";
    }
  }

  function cleanRut(value) {
    return String(value || "")
      .replace(/\./g, "")
      .replace(/-/g, "")
      .trim()
      .toUpperCase();
  }

  function titleCase(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function safeText(value, fallback = "--") {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text ? text : fallback;
  }

  function getFirstDefined(obj, keys, fallback = "") {
    for (const key of keys) {
      if (obj && obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== "") {
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
      const d = new Date();
      return d.toISOString().slice(0, 10);
    }
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
        if (n === 0) return "Sin espera estimada";
        if (n === 1) return "Aproximadamente 1 minuto";
        return `Aproximadamente ${n} minutos`;
      }
    }

    const status = normalizeStatus(getFirstDefined(data, ["estado"], "pendiente"));
    const horaConsulta = getFirstDefined(data, ["hora_consulta", "horaConsulta"]);

    if (status === "llamado_doctor") return "Pasa ahora a consulta";
    if (status === "llamado_recepcion") return "Pasa ahora a recepción";
    if (status === "atendido") return "Atención finalizada";

    if (horaConsulta) {
      const diff = minutesBetweenNowAndHour(horaConsulta);

      if (diff !== null) {
        if (diff <= 0) return "En curso";
        if (diff <= 5) return "Menos de 5 minutos";
        if (diff <= 15) return "Aproximadamente 15 minutos";
        if (diff <= 30) return "Aproximadamente 30 minutos";
        return `Cerca de ${diff} minutos`;
      }
    }

    return "Por confirmar";
  }

  function renderTimeline(statusKey) {
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

  function render(data) {
    latestData = { ...(latestData || {}), ...(data || {}) };

    const paciente = getFirstDefined(latestData, [
      "nombre_paciente",
      "nombrePaciente",
      "paciente",
      "nombre",
      "paciente_nombre",
    ]);

    const doctor = getFirstDefined(latestData, [
      "doctor_nombre",
      "doctorNombre",
      "nombre_doctor",
      "medico",
      "doctor",
    ]);

    const ubicacion = getFirstDefined(latestData, [
      "ubicacion",
      "ubicacion_texto",
      "consulta",
      "destino",
      "lugar",
    ]);

    const rawStatus = getFirstDefined(latestData, ["estado"], "pendiente");
    const statusKey = normalizeStatus(rawStatus);
    const statusData = STATUS_MAP[statusKey];

    refs.pacienteNombre.textContent = safeText(titleCase(paciente), "Paciente no disponible");
    refs.doctorNombre.textContent = safeText(titleCase(doctor), "Por asignar");
    refs.ubicacionTexto.textContent = safeText(ubicacion, "Por confirmar");
    refs.tiempoEstimado.textContent = resolveEstimatedTime(latestData);

    refs.estadoChip.textContent = statusData.label;
    refs.estadoChip.className = `estado-chip ${statusData.chipClass}`;
    refs.estadoMensaje.textContent = statusData.message;

    renderTimeline(statusKey);

    refs.ultimaActualizacion.textContent = `Última actualización: ${getNowTimeString()}`;
  }

  function readFromUrl() {
    return {
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
      estado: urlParams.get("estado") || "pendiente",
      rut: urlParams.get("rut") || "",
      fecha_turno: urlParams.get("fecha") || getChileDate(),
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
      }
    }

    return {};
  }

  function mergeInitialData() {
    const fromUrl = readFromUrl();
    const fromStorage = readFromStorage();

    return {
      ...fromStorage,
      ...fromUrl,
    };
  }

  function setupStorageSync() {
    window.addEventListener("storage", () => {
      const storageData = readFromStorage();
      render(storageData);
    });
  }

  async function startRealtimeFirestore(baseData) {
    try {
      if (!window.firebase || !firebase.firestore) return;

      const db = window.db || firebase.firestore();
      const agendadoId =
        baseData.agendadoId ||
        baseData.id ||
        urlParams.get("agendadoId") ||
        urlParams.get("id") ||
        "";

      if (unsubscribeFirestore) {
        unsubscribeFirestore();
        unsubscribeFirestore = null;
      }

      if (agendadoId) {
        unsubscribeFirestore = db
          .collection("agendados")
          .doc(agendadoId)
          .onSnapshot(
            (snap) => {
              if (!snap.exists) return;
              const docData = snap.data() || {};
              render({
                ...baseData,
                ...docData,
                agendadoId: snap.id,
                id: snap.id,
              });
            },
            (error) => {
              console.error("Error onSnapshot por id:", error);
            }
          );
        return;
      }

      const rut = getFirstDefined(baseData, ["rut"], "");
      const fechaTurno = getFirstDefined(baseData, ["fecha_turno"], getChileDate());

      if (!rut) return;

      unsubscribeFirestore = db
        .collection("agendados")
        .where("rut", "==", rut)
        .where("fecha_turno", "==", fechaTurno)
        .limit(1)
        .onSnapshot(
          (snapshot) => {
            if (snapshot.empty) return;
            const doc = snapshot.docs[0];
            const docData = doc.data() || {};
            render({
              ...baseData,
              ...docData,
              agendadoId: doc.id,
              id: doc.id,
            });
          },
          (error) => {
            console.error("Error onSnapshot por rut/fecha:", error);
          }
        );
    } catch (error) {
      console.error("No se pudo iniciar tiempo real con Firestore:", error);
    }
  }

  function refreshNow() {
    const storageData = readFromStorage();
    render(storageData);

    if (latestData) {
      startRealtimeFirestore(latestData);
    }
  }

  function bindEvents() {
    refs.btnActualizar.addEventListener("click", refreshNow);
  }

  function init() {
    const initialData = mergeInitialData();

    render(initialData);
    setupStorageSync();
    bindEvents();
    startRealtimeFirestore(initialData);

    // Refresco visual de respaldo
    setInterval(() => {
      const storageData = readFromStorage();
      if (Object.keys(storageData).length) {
        render(storageData);
      }
    }, 5000);
  }

  init();
})();