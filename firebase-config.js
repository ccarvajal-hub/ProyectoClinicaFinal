import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC6sHSNXX9b3ky32Zt5_HYvDj7GiCWCbts",
  authDomain: "llamado-cliente.firebaseapp.com",
  projectId: "llamado-cliente",
  storageBucket: "llamado-cliente.appspot.com",
  messagingSenderId: "444376711880",
  appId: "1:444376711880:web:01c32061eea040ef0f9bfd"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export { app, db };