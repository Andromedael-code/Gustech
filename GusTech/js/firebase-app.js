const firebaseConfig = {
  apiKey: 'AIzaSyDTmkw4wr8JJCTDqHcW5X9Z-sYxao4P01w',
  authDomain: 'gustavo-gaymer-loja.firebaseapp.com',
  projectId: 'gustavo-gaymer-loja',
  storageBucket: 'gustavo-gaymer-loja.appspot.com',
  messagingSenderId: '456630405984',
  appId: '1:456630405984:web:4d6e495514be8f51792c05'
};

const firebaseApp = !window.firebase.apps.length ? window.firebase.initializeApp(firebaseConfig) : window.firebase.app();
const auth = window.firebase.auth();

export { auth, firebaseApp };

export function onAuthChanged(callback) {
  return auth.onAuthStateChanged((user) => callback(user || null));
}

export function waitForAuthState() {
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user || null);
    });
  });
}
