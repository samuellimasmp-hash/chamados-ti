const { db } = require('../config/firebase');
const { PERFIS } = require('../config/constants');
const { limparCache } = require('../middlewares/auth');

// GET /admin/users
exports.users = async (req, res) => {
  const snap = await db.collection('usuarios').get();
  const usuarios = snap.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
  res.render('admin/users', { title: 'Gestão de usuários', usuarios });
};

// POST /admin/users/:uid/perfil
exports.updatePerfil = async (req, res) => {
  const { uid } = req.params;
  const perfil = req.body.perfil;

  if (!PERFIS[perfil]) {
    return res.redirect(`/admin/users?erro=${encodeURIComponent('Perfil inválido.')}`);
  }
  if (uid === req.user.uid) {
    return res.redirect(`/admin/users?erro=${encodeURIComponent('Você não pode alterar o seu próprio perfil.')}`);
  }

  const ref = db.collection('usuarios').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    return res.redirect(`/admin/users?erro=${encodeURIComponent('Usuário não encontrado.')}`);
  }

  await ref.update({ perfil });
  limparCache(uid);
  res.redirect(`/admin/users?msg=${encodeURIComponent(`Perfil de ${snap.data().nome} alterado para ${PERFIS[perfil].label}.`)}`);
};
