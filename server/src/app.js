const express = require('express');
const cors = require('cors');
const { fail } = require('./utils/response');

const authRoutes = require('./routes/auth.routes');
const notesRoutes = require('./routes/notes.routes');
const adminRoutes = require('./routes/admin.routes');
const staffRoutes = require('./routes/staff.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', mode: 'stub' }));

app.use(authRoutes);
app.use(notesRoutes);
app.use('/admin', adminRoutes);
app.use('/staff', staffRoutes);

app.use((req, res) => {
  fail(res, 'NOT_FOUND', `Không tìm thấy endpoint ${req.method} ${req.path}`, 404);
});

module.exports = app;
