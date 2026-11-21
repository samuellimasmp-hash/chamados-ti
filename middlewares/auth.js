const { auth, db } = require('../config/firebase');
const { PERFIS } = require('../config/constants');

const COOKIE = 'session';

// Cache curto do documento do usuário (evita ler o Firestore a cada clique).
const cache = new Map();
const TTL_MS = 15000;

async function getUsuario(uid) {
  const hit = cache.get(uid);
  if (hit && hit.exp > Date.now()) return hit.data;
  const snap = await db.collection('usuarios').doc(uid).get();
  const data = snap.exists ? snap.data() : null;
  if (data) cache.set(uid, { data, exp: Date.now() + TTL_MS });
  return data;
}

function limparCache(uid) {
  cache.delete(uid);
}

function lerCookie(req, nome) {
  const header = req.headers.cookie || '';
  for (const parte of header.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

// Preenche req.user e res.locals.currentUser (ou null, se não estiver logado).
async function attachUser(req, res, next) {
  req.user = null;
  res.locals.currentUser = null;
  const cookie = lerCookie(req, COOKIE);
  if (cookie) {
    try {
      const decoded = await auth.verifySessionCookie(cookie);
      const u = await getUsuario(decoded.uid);
      if (u) {
        req.user = {
          uid: decoded.uid,
          nome: u.nome || decoded.email || 'Usuário',
          email: u.email || decoded.email || '',
          perfil: PERFIS[u.perfil] ? u.perfil : 'user',
        };
        res.locals.currentUser = req.user;
      }
    } catch (err) {
      // sessão inválida ou expirada: segue como visitante
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/login');
  next();
}

function requireRole(...perfis) {
  return (req, res, next) => {
    if (!req.user) return res.redirect('/login');
    if (!perfis.includes(req.user.perfil)) {
      return res.status(403).render('error', {
        title: 'Acesso negado',
        error: new Error('Você não tem permissão para acessar esta página.'),
      });
    }
    next();
  };
}

module.exports = { COOKIE, getUsuario, limparCache, attachUser, requireAuth, requireRole };
