const { Op } = require('sequelize');
const { Ticket, Technician, Category, Comment } = require('../models');
const { STATUS, PRIORIDADES } = require('../config/constants');
const { validationMessages } = require('../utils/helpers');

const include = [
  { model: Category, as: 'categoria' },
  { model: Technician, as: 'tecnico' },
];

// Normaliza os dados vindos do formulário
function pickTicket(body) {
  return {
    titulo: (body.titulo || '').trim(),
    descricao: (body.descricao || '').trim(),
    solicitante: (body.solicitante || '').trim(),
    emailSolicitante: (body.emailSolicitante || '').trim() || null,
    setor: body.setor || null,
    prioridade: body.prioridade || 'media',
    status: body.status || 'aberto',
    categoryId: body.categoryId || null,
    technicianId: body.technicianId || null,
  };
}

async function formOptions() {
  const [categorias, tecnicos] = await Promise.all([
    Category.findAll({ order: [['nome', 'ASC']] }),
    Technician.findAll({ where: { ativo: true }, order: [['nome', 'ASC']] }),
  ]);
  return { categorias, tecnicos };
}

// Busca o chamado respeitando o perfil: usuário comum só enxerga os próprios chamados.
async function findOr404(req, res, opts = {}) {
  const ticket = await Ticket.findByPk(req.params.id, opts);
  const permitido = ticket && (req.user.perfil !== 'user' || ticket.autorUid === req.user.uid);
  if (!permitido) {
    res.status(404).render('404', { title: 'Chamado não encontrado' });
    return null;
  }
  return ticket;
}

// GET /tickets
exports.index = async (req, res) => {
  const { q, status, prioridade, categoria, tecnico } = req.query;
  const where = {};

  // Usuário comum: apenas os chamados abertos por ele (autorUid == user.uid)
  if (req.user.perfil === 'user') where.autorUid = req.user.uid;

  if (q) {
    const like = { [Op.like]: `%${q}%` };
    const or = [{ titulo: like }, { solicitante: like }, { descricao: like }];
    const idMatch = String(q).match(/^(?:CH-)?0*(\d+)$/i);
    if (idMatch) or.push({ id: Number(idMatch[1]) });
    where[Op.or] = or;
  }
  if (status === 'ativos') where.status = { [Op.in]: ['aberto', 'em_andamento', 'aguardando'] };
  else if (status && STATUS[status]) where.status = status;
  if (prioridade && PRIORIDADES[prioridade]) where.prioridade = prioridade;
  if (categoria) where.categoryId = categoria;
  if (tecnico === 'nenhum') where.technicianId = null;
  else if (tecnico) where.technicianId = tecnico;

  const tickets = await Ticket.findAll({ where, include, order: [['createdAt', 'DESC']] });
  const opts = await formOptions();

  res.render('tickets/index', {
    title: req.user.perfil === 'user' ? 'Meus chamados' : 'Chamados',
    tickets,
    filtros: { q: q || '', status: status || '', prioridade: prioridade || '', categoria: categoria || '', tecnico: tecnico || '' },
    ...opts,
  });
};

// GET /tickets/new
exports.new = async (req, res) => {
  res.render('tickets/form', {
    title: 'Novo chamado',
    ticket: {
      prioridade: 'media',
      status: 'aberto',
      solicitante: req.user.nome,
      emailSolicitante: req.user.email,
    },
    errors: [],
    isEdit: false,
    ...(await formOptions()),
  });
};

// POST /tickets
exports.create = async (req, res) => {
  const user = req.user;
  const data = {
    ...pickTicket(req.body),
    status: 'aberto',
    autorUid: user.uid,
    autorNome: user.nome,
    autorEmail: user.email,
    tecnicoResponsavel: null,
    tecnicoResponsavelUid: null,
  };
  if (user.perfil === 'user') {
    // Usuário comum não define técnico nem status; o solicitante é ele mesmo.
    data.technicianId = null;
    data.solicitante = user.nome;
    data.emailSolicitante = user.email || null;
  }
  if (!data.solicitante) data.solicitante = user.nome;

  try {
    const ticket = await Ticket.create(data);
    await Comment.create({
      ticketId: ticket.id,
      autor: 'Sistema',
      tipo: 'sistema',
      mensagem: `Chamado aberto por ${ticket.solicitante}.`,
    });
    res.redirect(`/tickets/${ticket.id}?msg=${encodeURIComponent(`Chamado ${ticket.protocolo} criado com sucesso!`)}`);
  } catch (err) {
    const errors = validationMessages(err);
    if (!errors) throw err;
    res.status(422).render('tickets/form', {
      title: 'Novo chamado',
      ticket: data,
      errors,
      isEdit: false,
      ...(await formOptions()),
    });
  }
};

// GET /tickets/:id
exports.show = async (req, res) => {
  const ticket = await findOr404(req, res, {
    include: [...include, { model: Comment, as: 'comentarios' }],
    order: [[{ model: Comment, as: 'comentarios' }, 'createdAt', 'ASC']],
  });
  if (!ticket) return;
  const { tecnicos } = await formOptions();
  res.render('tickets/show', { title: ticket.protocolo, ticket, tecnicos, errors: [] });
};

// GET /tickets/:id/edit (somente admin)
exports.edit = async (req, res) => {
  const ticket = await findOr404(req, res);
  if (!ticket) return;
  res.render('tickets/form', {
    title: `Editar ${ticket.protocolo}`,
    ticket,
    errors: [],
    isEdit: true,
    ...(await formOptions()),
  });
};

// PUT /tickets/:id (somente admin)
exports.update = async (req, res) => {
  const ticket = await findOr404(req, res);
  if (!ticket) return;
  const data = pickTicket(req.body);
  try {
    await ticket.update(data);
    res.redirect(`/tickets/${ticket.id}?msg=${encodeURIComponent('Chamado atualizado.')}`);
  } catch (err) {
    const errors = validationMessages(err);
    if (!errors) throw err;
    res.status(422).render('tickets/form', {
      title: `Editar ${ticket.protocolo}`,
      ticket: { ...data, id: ticket.id, protocolo: ticket.protocolo },
      errors,
      isEdit: true,
      ...(await formOptions()),
    });
  }
};

// PATCH /tickets/:id/quick — atualização rápida (técnico ou admin), com histórico
exports.quickUpdate = async (req, res) => {
  const ticket = await findOr404(req, res, { include });
  if (!ticket) return;

  const historico = [];
  const { status, prioridade } = req.body;
  const technicianId = req.body.technicianId ? Number(req.body.technicianId) : null;

  if (status && STATUS[status] && status !== ticket.status) {
    historico.push(`Status alterado de "${STATUS[ticket.status].label}" para "${STATUS[status].label}".`);
    ticket.status = status;
  }
  if (prioridade && PRIORIDADES[prioridade] && prioridade !== ticket.prioridade) {
    historico.push(`Prioridade alterada de "${PRIORIDADES[ticket.prioridade].label}" para "${PRIORIDADES[prioridade].label}".`);
    ticket.prioridade = prioridade;
  }
  if (technicianId !== ticket.technicianId) {
    const novo = technicianId ? await Technician.findByPk(technicianId) : null;
    historico.push(novo ? `Chamado atribuído a ${novo.nome}.` : 'Técnico responsável removido.');
    ticket.technicianId = novo ? novo.id : null;
  }

  if (!historico.length) {
    return res.redirect(`/tickets/${ticket.id}?erro=${encodeURIComponent('Nenhuma alteração realizada.')}`);
  }

  // Quem atualiza um chamado sem responsável passa a ser o responsável.
  if (!ticket.tecnicoResponsavelUid) {
    ticket.tecnicoResponsavel = req.user.nome;
    ticket.tecnicoResponsavelUid = req.user.uid;
    historico.push(`Chamado assumido por ${req.user.nome}.`);
  }

  await ticket.save();
  await Comment.bulkCreate(
    historico.map((mensagem) => ({ ticketId: ticket.id, autor: 'Sistema', tipo: 'sistema', mensagem }))
  );
  res.redirect(`/tickets/${ticket.id}?msg=${encodeURIComponent('Chamado atualizado.')}`);
};

// POST /tickets/:id/assume — técnico ou admin assume o chamado
exports.assume = async (req, res) => {
  const ticket = await findOr404(req, res);
  if (!ticket) return;

  const historico = [`Chamado assumido por ${req.user.nome}.`];
  ticket.tecnicoResponsavel = req.user.nome;
  ticket.tecnicoResponsavelUid = req.user.uid;
  if (ticket.status === 'aberto') {
    ticket.status = 'em_andamento';
    historico.push('Status alterado de "Aberto" para "Em andamento".');
  }

  await ticket.save();
  await Comment.bulkCreate(
    historico.map((mensagem) => ({ ticketId: ticket.id, autor: 'Sistema', tipo: 'sistema', mensagem }))
  );
  res.redirect(`/tickets/${ticket.id}?msg=${encodeURIComponent('Você assumiu este chamado.')}`);
};

// DELETE /tickets/:id (somente admin)
exports.destroy = async (req, res) => {
  const ticket = await findOr404(req, res);
  if (!ticket) return;
  const protocolo = ticket.protocolo;
  await ticket.destroy();
  res.redirect(`/tickets?msg=${encodeURIComponent(`Chamado ${protocolo} excluído.`)}`);
};
