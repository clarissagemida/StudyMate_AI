import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDlIxjQYq7zaxb9SX4wWNJRuxuhsflaQdo",
  authDomain: "studymateai-f3092.firebaseapp.com",
  projectId: "studymateai-f3092",
  storageBucket: "studymateai-f3092.firebasestorage.app",
  messagingSenderId: "305901649265",
  appId: "1:305901649265:web:5679eeb0363d9d66200ad0",
  measurementId: "G-KRMZW35622",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
