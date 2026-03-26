import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    query,
    collection,
    where,
    getDocs,
    updateDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const DEV_MODE = true;

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
const btnLogin = document.getElementById("btnLogin");
const errorMessage = document.getElementById("error-message");
const okMessage = document.getElementById("ok-message");
const togglePassword = document.getElementById("togglePassword");

const btnModoDev = document.getElementById("btnModoDev");
const devModal = document.getElementById("devModal");
const btnCerrarDev = document.getElementById("btnCerrarDev");
const devAccountButtons = document.querySelectorAll(".dev-account-btn");

const btnCrearDemo = document.getElementById("btnCrearDemo");
const btnProbarColeccion = document.getElementById("btnProbarColeccion");

if (!DEV_MODE) {
    if (btnModoDev) btnModoDev.style.display = "none";
    if (devModal) devModal.classList.add("hidden");
}

function mostrarError(msg) {
    if (okMessage) {
        okMessage.textContent = "";
        okMessage.style.display = "none";
    }

    if (errorMessage) {
        errorMessage.textContent = msg;
        errorMessage.style.display = "block";
    }
}

function mostrarOk(msg) {
    if (errorMessage) {
        errorMessage.textContent = "";
        errorMessage.style.display = "none";
    }

    if (okMessage) {
        okMessage.textContent = msg;
        okMessage.style.display = "block";
    }
}

function limpiarMensajes() {
    if (errorMessage) {
        errorMessage.textContent = "";
        errorMessage.style.display = "none";
    }

    if (okMessage) {
        okMessage.textContent = "";
        okMessage.style.display = "none";
    }
}

async function buscarRecepcionistaPorUid(uid) {
    const ref = doc(db, "recepcionistas", uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
        return { id: snap.id, ...snap.data() };
    }

    const q = query(collection(db, "recepcionistas"), where("uid", "==", uid));
    const qs = await getDocs(q);

    if (!qs.empty) {
        const d = qs.docs[0];
        return { id: d.id, ...d.data() };
    }

    return null;
}

async function actualizarUltimoLoginRecepcion(idDocumento) {
    try {
        await updateDoc(doc(db, "recepcionistas", idDocumento), {
            ultimo_login: serverTimestamp()
        });
    } catch (error) {
        console.warn("No se pudo actualizar ultimo_login:", error);
    }
}

async function validarRecepcionistaYEntrar(user) {
    try {
        const recepcionista = await buscarRecepcionistaPorUid(user.uid);

        if (!recepcionista) {
            await signOut(auth);
            mostrarError("Esta cuenta no está habilitada como recepción.");
            return;
        }

        await actualizarUltimoLoginRecepcion(recepcionista.id);

        mostrarOk("Acceso correcto. Redirigiendo...");
        window.location.href = "recepcion.html";
    } catch (error) {
        console.error("Error al validar recepción:", error);
        await signOut(auth);
        mostrarError("No se pudo validar la cuenta de recepción.");
    }
}

async function hacerLogin() {
    limpiarMensajes();

    const email = (emailInput?.value || "").trim();
    const password = (passwordInput?.value || "").trim();

    if (!email || !password) {
        mostrarError("Ingresa correo y contraseña.");
        return;
    }

    if (btnLogin) {
        btnLogin.disabled = true;
        btnLogin.textContent = "Iniciando sesión...";
    }

    try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        await validarRecepcionistaYEntrar(cred.user);
    } catch (error) {
        console.error("Error de login:", error);

        if (error.code === "auth/invalid-credential") {
            mostrarError("Correo o contraseña incorrectos.");
        } else if (error.code === "auth/user-not-found") {
            mostrarError("La cuenta no existe.");
        } else if (error.code === "auth/wrong-password") {
            mostrarError("Contraseña incorrecta.");
        } else if (error.code === "auth/invalid-email") {
            mostrarError("El correo no es válido.");
        } else {
            mostrarError("No se pudo iniciar sesión.");
        }
    } finally {
        if (btnLogin) {
            btnLogin.disabled = false;
            btnLogin.textContent = "Iniciar Sesión";
        }
    }
}

if (btnLogin) {
    btnLogin.addEventListener("click", hacerLogin);
}

if (passwordInput) {
    passwordInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            hacerLogin();
        }
    });
}

if (emailInput) {
    emailInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            hacerLogin();
        }
    });
}

if (togglePassword && passwordInput) {
    togglePassword.addEventListener("click", () => {
        const mostrando = passwordInput.type === "text";
        passwordInput.type = mostrando ? "password" : "text";
        togglePassword.textContent = mostrando ? "Mostrar" : "Ocultar";
    });
}

if (DEV_MODE && btnModoDev && devModal && btnCerrarDev) {
    btnModoDev.addEventListener("click", () => {
        limpiarMensajes();
        devModal.classList.remove("hidden");
    });

    btnCerrarDev.addEventListener("click", () => {
        devModal.classList.add("hidden");
    });

    devModal.addEventListener("click", (e) => {
        if (e.target === devModal) {
            devModal.classList.add("hidden");
        }
    });
}

if (DEV_MODE) {
    devAccountButtons.forEach((button) => {
        button.addEventListener("click", async () => {
            const email = button.dataset.email || "";
            const password = button.dataset.password || "";

            if (emailInput) emailInput.value = email;
            if (passwordInput) {
                passwordInput.type = "password";
                passwordInput.value = password;
            }
            if (togglePassword) {
                togglePassword.textContent = "Mostrar";
            }

            if (devModal) {
                devModal.classList.add("hidden");
            }

            await hacerLogin();
        });
    });
}

onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    try {
        const recepcionista = await buscarRecepcionistaPorUid(user.uid);

        if (recepcionista) {
            window.location.href = "recepcion.html";
        }
    } catch (error) {
        console.error("Error al revisar sesión actual:", error);
    }
});

/* =========================
   BOTONES DEV ANTIGUOS
========================= */

if (btnCrearDemo) {
    btnCrearDemo.addEventListener("click", async () => {
        try {
            const demoUid = "recepcion-demo-1";

            await setDoc(doc(db, "recepcionistas", demoUid), {
                uid: demoUid,
                nombre: "Recepción Demo",
                email: "recepcion1@clinica.cl",
                email_normalizado: "recepcion1@clinica.cl",
                modulo: "RECEPCIÓN 1",
                ultimo_login: null,
                creado_en: serverTimestamp()
            }, { merge: true });

            mostrarOk("Recepcionista demo creado o actualizado correctamente.");
        } catch (error) {
            console.error("Error al crear recepcionista demo:", error);
            mostrarError("No se pudo crear el recepcionista demo.");
        }
    });
}

if (btnProbarColeccion) {
    btnProbarColeccion.addEventListener("click", async () => {
        try {
            const q = query(collection(db, "recepcionistas"));
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                mostrarError("La colección recepcionistas existe, pero no tiene documentos.");
                return;
            }

            mostrarOk(`Colección recepcionistas OK. Documentos encontrados: ${snapshot.size}`);
        } catch (error) {
            console.error("Error al probar colección:", error);
            mostrarError("No se pudo leer la colección recepcionistas.");
        }
    });
}

limpiarMensajes();