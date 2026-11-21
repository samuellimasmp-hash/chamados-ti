// Firebase Admin: valida o login e lê/grava a coleção "usuarios" no Firestore.
// A credencial vem da variável de ambiente FIREBASE_SERVICE_ACCOUNT (usada no Render)
// ou do arquivo local serviceAccountKey.json (usado no seu computador).
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function credencial() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    const json = JSON.parse(raw);
    if (json.private_key) json.private_key = json.private_key.replace(/\\n/g, '\n');
    return admin.credential.cert(json);
  }
  const arquivo = path.join(__dirname, '..', 'serviceAccountKey.json');
  if (fs.existsSync(arquivo)) return admin.credential.cert(require(arquivo));
  throw new Error(
    'Credencial do Firebase não encontrada. Defina FIREBASE_SERVICE_ACCOUNT ou salve serviceAccountKey.json na raiz do projeto.'
  );
}

if (!admin.apps.length) admin.initializeApp({ credential: credencial() });

module.exports = { admin, auth: admin.auth(), db: admin.firestore() };
