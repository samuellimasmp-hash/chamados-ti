const { Ticket, Comment } = require('../models');
const { validationMessages } = require('../utils/helpers');

// POST /tickets/:id/comments
exports.create = async (req, res) => {
  const ticket = await Ticket.findByPk(req.params.id);
  const permitido = ticket && (req.user.perfil !== 'user' || ticket.autorUid === req.user.uid);
  if (!permitido) return res.status(404).render('404', { title: 'Chamado não encontrado' });

  try {
    await Comment.create({
      ticketId: ticket.id,
      autor: req.user.nome, // o autor é sempre o usuário logado
      mensagem: (req.body.mensagem || '').trim(),
      tipo: 'comentario',
    });
    res.redirect(`/tickets/${ticket.id}?msg=${encodeURIComponent('Comentário adicionado.')}#comentarios`);
  } catch (err) {
    const errors = validationMessages(err);
    if (!errors) throw err;
    res.redirect(`/tickets/${ticket.id}?erro=${encodeURIComponent(errors.join(' '))}#comentarios`);
  }
};
