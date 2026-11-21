const express = require('express');
const dashboard = require('../controllers/dashboardController');
const tickets = require('../controllers/ticketController');
const comments = require('../controllers/commentController');
const technicians = require('../controllers/technicianController');
const categories = require('../controllers/categoryController');
const admin = require('../controllers/adminController');
const { requireRole } = require('../middlewares/auth');

const router = express.Router();

const tecnicoOuAdmin = requireRole('tecnico', 'admin');
const soAdmin = requireRole('admin');

// Dashboard (usuário comum vai direto para os próprios chamados)
router.get('/', (req, res, next) => {
  if (req.user.perfil === 'user') return res.redirect('/tickets');
  return dashboard.index(req, res, next);
});

// Chamados
router.get('/tickets', tickets.index);
router.get('/tickets/new', tickets.new);
router.post('/tickets', tickets.create);
router.get('/tickets/:id', tickets.show);
router.get('/tickets/:id/edit', soAdmin, tickets.edit);
router.put('/tickets/:id', soAdmin, tickets.update);
router.patch('/tickets/:id/quick', tecnicoOuAdmin, tickets.quickUpdate);
router.post('/tickets/:id/assume', tecnicoOuAdmin, tickets.assume);
router.delete('/tickets/:id', soAdmin, tickets.destroy);
router.post('/tickets/:id/comments', comments.create);

// Técnicos (somente admin)
router.get('/technicians', soAdmin, technicians.index);
router.get('/technicians/new', soAdmin, technicians.new);
router.post('/technicians', soAdmin, technicians.create);
router.get('/technicians/:id/edit', soAdmin, technicians.edit);
router.put('/technicians/:id', soAdmin, technicians.update);
router.delete('/technicians/:id', soAdmin, technicians.destroy);

// Categorias (somente admin)
router.get('/categories', soAdmin, categories.index);
router.get('/categories/new', soAdmin, categories.new);
router.post('/categories', soAdmin, categories.create);
router.get('/categories/:id/edit', soAdmin, categories.edit);
router.put('/categories/:id', soAdmin, categories.update);
router.delete('/categories/:id', soAdmin, categories.destroy);

// Gestão de usuários (somente admin)
router.get('/admin/users', soAdmin, admin.users);
router.post('/admin/users/:uid/perfil', soAdmin, admin.updatePerfil);

module.exports = router;
