import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    updateDoc,
    doc
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

/* =========================================================
   MODO DEV
   true  = muestra botones dev y login rápido
   false = oculta todo lo dev
========================================================= */
const MODO_DEV = true;

/* =========================================================
   CREDENCIALES DEV
   CAMBIA ESTO POR TU USUARIO REAL DE PRUEBA
========================================================= */
const DEV_EMAIL = "doctor@clinica.cl";
const DEV_PASSWORD = "123456";

/* =========================================================
   ELEMENTOS
========================================================= */
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const btnLoginDev = document.getElementById("btnLoginDev");
const togglePassword = document.getElementById("togglePassword");
const errorText = document.getElementById("error-text");
const okText = document.getElementById("ok-text");
const btnCrearPacientes = document.getElementById("btnCrearPacientes");
const btnResetear = document.getElementById("btnResetear");
const devTools = document.getElementById("devTools");

/* =========================================================
   UI
========================================================= */
function mostrarError(mensaje = "Credenciales incorrectas.") {
    errorText.textContent = mensaje;
    errorText.style.display = "block";
    okText.style.display = "none";
}

function mostrarOk(mensaje = "") {
    okText.textContent = mensaje;
    okText.style.display = mensaje ? "block" : "none";
    errorText.style.display = "none";
}

function limpiarMensajes() {
    errorText.style.display = "none";
    okText.style.display = "none";
}

function setLoading(loading, texto = "Iniciar Sesión") {
    loginBtn.disabled = loading;
    loginBtn.textContent = loading ? "Ingresando..." : texto;

    if (btnLoginDev) {
        btnLoginDev.disabled = loading;
        btnLoginDev.textContent = loading ? "Ingresando..." : "Entrar modo dev";
    }
}

function aplicarModoDev() {
    if (MODO_DEV) {
        if (devTools) devTools.classList.add("visible");
        if (btnLoginDev) btnLoginDev.style.display = "block";
        return;
    }

    if (devTools) devTools.classList.remove("visible");
    if (btnLoginDev) btnLoginDev.style.display = "none";
}

/* =========================================================
   SESIÓN YA ACTIVA
========================================================= */
onAuthStateChanged(auth, (user) => {
    if (user) {
        window.location.href = "doctor.html";
    }
});

/* =========================================================
   LOGIN NORMAL
========================================================= */
async function iniciarSesionDoctor() {
    if (loginBtn.disabled) return;

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    limpiarMensajes();

    if (!email || !password) {
        mostrarError("Ingresa correo y contraseña.");
        return;
    }

    try {
        setLoading(true);
        await signInWithEmailAndPassword(auth, email, password);
        mostrarOk("Ingreso correcto.");
        window.location.href = "doctor.html";
    } catch (e) {
        console.error("Error de login:", e);
        mostrarError("Correo o contraseña incorrectos.");
    } finally {
        setLoading(false);
    }
}

/* =========================================================
   LOGIN RÁPIDO DEV
========================================================= */
async function iniciarSesionDoctorDev() {
    if (!MODO_DEV) return;
    if (loginBtn.disabled) return;

    limpiarMensajes();

    try {
        emailInput.value = DEV_EMAIL;
        passwordInput.value = DEV_PASSWORD;

        setLoading(true);
        await signInWithEmailAndPassword(auth, DEV_EMAIL, DEV_PASSWORD);
        mostrarOk("Ingreso dev correcto.");
        window.location.href = "doctor.html";
    } catch (e) {
        console.error("Error en login dev:", e);
        mostrarError("No se pudo ingresar con el modo dev.");
    } finally {
        setLoading(false);
    }
}

/* =========================================================
   MOSTRAR / OCULTAR CONTRASEÑA
========================================================= */
function togglePasswordVisibility() {
    const isPassword = passwordInput.type === "password";
    passwordInput.type = isPassword ? "text" : "password";
    togglePassword.textContent = isPassword ? "Ocultar" : "Mostrar";
}

/* =========================================================
   EVENTOS LOGIN
========================================================= */
loginBtn.addEventListener("click", iniciarSesionDoctor);

emailInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") iniciarSesionDoctor();
});

passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") iniciarSesionDoctor();
});

if (btnLoginDev) {
    btnLoginDev.addEventListener("click", iniciarSesionDoctorDev);
}

if (togglePassword) {
    togglePassword.addEventListener("click", togglePasswordVisibility);
}

/* =========================================================
   BOTÓN DEV: CREAR PACIENTES TEST
========================================================= */
if (btnCrearPacientes) {
    btnCrearPacientes.addEventListener("click", async () => {
        if (!MODO_DEV) return;

        const pacientes = [
            {
                nombre: "JUAN PEREZ",
                rut: "12345678K",
                hora_consulta: "09:00",
                estado: "pendiente",
                doctor_id: "doctor@clinica.cl",
                consulta: "101",
                piso: "Piso 1"
            },
            {
                nombre: "MARIA GONZALEZ",
                rut: "112223334",
                hora_consulta: "09:30",
                estado: "pendiente",
                doctor_id: "doctor@clinica.cl",
                consulta: "101",
                piso: "Piso 1"
            },
            {
                nombre: "RICARDO SOTO",
                rut: "156667778",
                hora_consulta: "10:00",
                estado: "pendiente",
                doctor_id: "doctor@clinica.cl",
                consulta: "101",
                piso: "Piso 1"
            }
        ];

        try {
            for (const p of pacientes) {
                await addDoc(collection(db, "agendados"), p);
            }

            alert("Se han creado 3 pacientes de prueba para doctor.");
        } catch (e) {
            console.error("Error al crear pacientes de prueba:", e);
            alert("Error al crear pacientes de prueba.");
        }
    });
}

/* =========================================================
   BOTÓN DEV: REINICIAR JORNADA
========================================================= */
if (btnResetear) {
    btnResetear.addEventListener("click", async () => {
        if (!MODO_DEV) return;

        const confirmado = confirm("¿Reiniciar todos los pacientes a 'Pendiente' y limpiar datos de recepción/pago?");
        if (!confirmado) return;

        try {
            const snap = await getDocs(collection(db, "agendados"));

            for (const d of snap.docs) {
                await updateDoc(doc(db, "agendados", d.id), {
                    estado: "pendiente",
                    hora_llegada: "",
                    hora_pago: "",
                    hora_llamado_recepcion: "",
                    hora_pago_manual_activado: "",
                    registro_manual_recepcion: false,
                    tipo_pago: null,
                    recepcion_id: null,
                    recepcion_numero: null,
                    recepcion_nombre: null
                });
            }

            alert("Jornada reiniciada correctamente.");
        } catch (error) {
            console.error("Error al reiniciar jornada:", error);
            alert("Error al reiniciar jornada.");
        }
    });
}

/* =========================================================
   INICIO
========================================================= */
aplicarModoDev();
limpiarMensajes();