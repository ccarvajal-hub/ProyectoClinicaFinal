import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
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

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const errorText = document.getElementById("error-text");
const btnCrearPacientes = document.getElementById("btnCrearPacientes");
const btnResetear = document.getElementById("btnResetear");

async function iniciarSesionDoctor() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    errorText.style.display = "none";

    try {
        await signInWithEmailAndPassword(auth, email, password);
        window.location.href = "doctor.html";
    } catch (e) {
        console.error("Error de login:", e);
        errorText.style.display = "block";
    }
}

loginBtn.addEventListener("click", iniciarSesionDoctor);

emailInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        iniciarSesionDoctor();
    }
});

passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        iniciarSesionDoctor();
    }
});

btnCrearPacientes.addEventListener("click", async () => {
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

        alert("Se han creado 3 pacientes de prueba para doctor@clinica.cl");
    } catch (e) {
        console.error("Error al crear pacientes de prueba:", e);
        alert("Error al crear pacientes de prueba.");
    }
});

btnResetear.addEventListener("click", async () => {
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