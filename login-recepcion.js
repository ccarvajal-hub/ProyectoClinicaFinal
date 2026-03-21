import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    collection,
    getDocs,
    query,
    where,
    limit,
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
const auth = getAuth(app);
const db = getFirestore(app);

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const errorText = document.getElementById("error-text");
const okText = document.getElementById("ok-text");
const btnCrearDemo = document.getElementById("btnCrearDemo");
const btnProbarColeccion = document.getElementById("btnProbarColeccion");
const devTools = document.getElementById("devTools");
const togglePassword = document.getElementById("togglePassword");

function esEntornoDesarrollo() {
    const host = window.location.hostname;
    const protocol = window.location.protocol;

    return (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "" ||
        protocol === "file:"
    );
}

function configurarVistaSegunEntorno() {
    if (esEntornoDesarrollo()) {
        devTools.classList.add("visible");
    } else {
        devTools.classList.remove("visible");
    }
}

function mostrarError(mensaje) {
    okText.style.display = "none";
    okText.textContent = "";
    errorText.textContent = mensaje;
    errorText.style.display = "block";
}

function mostrarOk(mensaje) {
    errorText.style.display = "none";
    errorText.textContent = "";
    okText.textContent = mensaje;
    okText.style.display = "block";
}

function limpiarMensajes() {
    errorText.style.display = "none";
    errorText.textContent = "";
    okText.style.display = "none";
    okText.textContent = "";
}

function setLoading(loading) {
    loginBtn.disabled = loading;
    loginBtn.textContent = loading ? "Ingresando..." : "Iniciar Sesión";
}

function guardarSesionRecepcion(data) {
    localStorage.setItem("recepcionistaSesion", JSON.stringify({
        uid: data.uid || "",
        nombre: data.nombre || "",
        email: data.email || "",
        rol: data.rol || "recepcion",
        sede: data.sede || "",
        box: data.box || "",
        activo: data.activo === true
    }));
}

async function obtenerRecepcionistaPorUID(uid) {
    const ref = doc(db, "recepcionistas", uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) return null;

    return { id: snap.id, ...snap.data() };
}

async function obtenerRecepcionistaPorEmail(emailNormalizado) {
    const q = query(
        collection(db, "recepcionistas"),
        where("email_normalizado", "==", emailNormalizado),
        limit(1)
    );

    const snap = await getDocs(q);

    if (snap.empty) return null;

    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
}

async function loginRecepcion() {
    limpiarMensajes();

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    if (!email || !password) {
        mostrarError("Debes ingresar correo y contraseña.");
        return;
    }

    setLoading(true);

    try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const user = cred.user;

        let recepcionista = await obtenerRecepcionistaPorUID(user.uid);

        if (!recepcionista) {
            recepcionista = await obtenerRecepcionistaPorEmail(email);
        }

        if (!recepcionista) {
            await signOut(auth);
            mostrarError("Tu usuario existe en Auth, pero no está creado en la colección recepcionistas.");
            return;
        }

        if (recepcionista.activo !== true) {
            await signOut(auth);
            mostrarError("Tu usuario de recepción está inactivo.");
            return;
        }

        if (recepcionista.rol && recepcionista.rol !== "recepcion") {
            await signOut(auth);
            mostrarError("Este usuario no pertenece al módulo de recepción.");
            return;
        }

        await setDoc(doc(db, "recepcionistas", user.uid), {
            ...recepcionista,
            uid: user.uid,
            email: user.email || email,
            email_normalizado: email,
            ultimo_login: serverTimestamp()
        }, { merge: true });

        guardarSesionRecepcion({
            ...recepcionista,
            uid: user.uid,
            email: user.email || email
        });

        mostrarOk("Acceso correcto. Redirigiendo...");

        setTimeout(() => {
            window.location.href = "recepcion.html";
        }, 500);

    } catch (error) {
        console.error("Error login recepción:", error);

        switch (error.code) {
            case "auth/invalid-email":
                mostrarError("El correo no tiene un formato válido.");
                break;
            case "auth/user-disabled":
                mostrarError("Este usuario fue deshabilitado.");
                break;
            case "auth/user-not-found":
            case "auth/wrong-password":
            case "auth/invalid-credential":
                mostrarError("Credenciales incorrectas.");
                break;
            case "auth/too-many-requests":
                mostrarError("Demasiados intentos. Espera un momento y vuelve a probar.");
                break;
            default:
                mostrarError("No fue posible iniciar sesión.");
                break;
        }
    } finally {
        setLoading(false);
    }
}

async function crearRecepcionistaDemo() {
    try {
        const demoUid = "UID_DEMO_RECEPCION";

        await setDoc(doc(db, "recepcionistas", demoUid), {
            uid: demoUid,
            nombre: "Recepcionista Demo",
            email: "recepcion@clinica.cl",
            email_normalizado: "recepcion@clinica.cl",
            rol: "recepcion",
            activo: true,
            sede: "Principal",
            box: "Caja 1",
            creado_en: serverTimestamp(),
            ultimo_login: null
        }, { merge: true });

        alert("Documento demo creado en colección recepcionistas.\n\nOJO: esto NO crea el usuario en Authentication.");
    } catch (error) {
        console.error(error);
        alert("No se pudo crear el documento demo.");
    }
}

async function probarColeccion() {
    try {
        const snap = await getDocs(collection(db, "recepcionistas"));
        alert(`Recepcionistas encontrados: ${snap.size}`);
    } catch (error) {
        console.error(error);
        alert("No se pudo leer la colección recepcionistas.");
    }
}

function configurarMostrarOcultarPassword() {
    togglePassword.addEventListener("click", () => {
        const esPassword = passwordInput.type === "password";
        passwordInput.type = esPassword ? "text" : "password";
        togglePassword.textContent = esPassword ? "Ocultar" : "Mostrar";
    });
}

loginBtn.addEventListener("click", loginRecepcion);

[emailInput, passwordInput].forEach((input) => {
    input.addEventListener("input", limpiarMensajes);
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            loginRecepcion();
        }
    });
});

btnCrearDemo?.addEventListener("click", crearRecepcionistaDemo);
btnProbarColeccion?.addEventListener("click", probarColeccion);

onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    try {
        const recepcionista = await obtenerRecepcionistaPorUID(user.uid);

        if (recepcionista && recepcionista.activo === true) {
            guardarSesionRecepcion({
                ...recepcionista,
                uid: user.uid,
                email: user.email || recepcionista.email || ""
            });

            window.location.href = "recepcion.html";
        }
    } catch (e) {
        console.error("Error verificando sesión activa:", e);
    }
});

configurarVistaSegunEntorno();
configurarMostrarOcultarPassword();
emailInput.focus();