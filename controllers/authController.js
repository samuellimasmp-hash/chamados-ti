const { auth, db } = require('../config/firebase');
const { COOKIE } = require('../middlewares/auth');

const CINCO_DIAS = 5 * 24 * 60 * 60 * 1000;

// GET /login
exports.loginPage = (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('login', { title: 'Entrar' });
};

// POST /auth/session — recebe o token do Firebase, confirma o usuário e abre a sessão.
exports.createSession = async (req, res) => {
  const { idToken, nome } = req.body || {};
  if (!idToken) return res.status(400).json({ erro: 'Token ausente.' });

  try {
    const decoded = await auth.verifyIdToken(idToken);
    // Só aceita logins feitos nos últimos 5 minutos.
    if (Date.now() / 1000 - decoded.auth_time > 300) {
      return res.status(401).json({ erro: 'Faça login novamente.' });
    }

    // Regra de primeiro acesso: se o uid ainda não existe em "usuarios", cria com perfil "user".
    const ref = db.collection('usuarios').doc(decoded.uid);
    const snap = await ref.get();
    if (!snap.exists) {
      const email = decoded.email || '';
      const nomeFinal = String(nome || decoded.name || email.split('@')[0] || 'Usuário')
        .trim()
        .slice(0, 100);
      await ref.set({ uid: decoded.uid, nome: nomeFinal, email, perfil: 'user' });
    }

    const cookie = await auth.createSessionCookie(idToken, { expiresIn: CINCO_DIAS });
    res.cookie(COOKIE, cookie, {
      maxAge: CINCO_DIAS,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Falha ao criar sessão:', err);
    res.status(401).json({ erro: 'Não foi possível validar o login.' });
  }
};

// POST /auth/logout
exports.logout = (req, res) => {
  res.clearCookie(COOKIE);
  res.redirect('/login');
};
