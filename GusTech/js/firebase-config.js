// =================================================================================
// Arquivo Central de Configuração e Autenticação do Firebase
// =================================================================================

// 1. Configuração do seu projeto Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDTmkw4wr8JJCTDqHcW5X9Z-sYxao4P01w",
  authDomain: "gustavo-gaymer-loja.firebaseapp.com",
  projectId: "gustavo-gaymer-loja",
  storageBucket: "gustavo-gaymer-loja.appspot.com",
  messagingSenderId: "456630405984",
  appId: "1:456630405984:web:4d6e495514be8f51792c05"
};

// 2. Inicialização do Firebase (evita reinicialização)
const app = !firebase.apps.length ? firebase.initializeApp(firebaseConfig) : firebase.app();

// 3. Exportação dos serviços do Firebase
export const db = firebase.firestore();
export const auth = firebase.auth();
export const firestore = firebase.firestore; // Para usar FieldValue, etc.

// 4. Coleções Padronizadas
export const productsCollection = db.collection("products");
export const getCartCollection = (userId) => db.collection("users").doc(userId).collection("cart");

// 5. LISTA DE ADMINISTRADORES
// Adicione aqui o UID dos usuários que devem ter acesso ao painel de admin.
// Você pode encontrar o UID no Console do Firebase > Authentication.
const ADMIN_UIDS = [
    "TDqyPQXT41eTWBD5ywMnIodHuD32", // SUBSTITUA ESTA LINHA
    "OutroAdminUIDSeTiver"
];

/**
 * Verifica se o usuário logado é um administrador.
 * @param {firebase.User} user - O objeto do usuário do Firebase.
 * @returns {boolean} - Retorna true se o usuário for admin.
 */
export function isUserAdmin(user) {
    return user && ADMIN_UIDS.includes(user.uid);
}


// 6. Função de Autenticação
// Garante que o usuário esteja autenticado (anonimamente) antes de prosseguir.
export const ensureAuthenticated = () => {
  return new Promise((resolve, reject) => {
    // Se já estiver logado, resolve imediatamente.
    if (auth.currentUser) {
      return resolve(auth.currentUser);
    }
    
    // Se não, escuta por uma mudança de estado (que acontecerá após o login)
    const unsubscribe = auth.onAuthStateChanged(user => {
      unsubscribe(); // Para de escutar para não ser chamado de novo
      if (user) {
        resolve(user);
      } else {
        // Se não houver usuário, tenta o login anônimo
        auth.signInAnonymously().then(userCredential => {
          resolve(userCredential.user);
        }).catch(error => {
          console.error("Erro no login anônimo:", error);
          reject(error);
        });
      }
    });
  });
};
