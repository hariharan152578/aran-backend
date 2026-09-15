import express from 'express';
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'Aran ERP: WARRANTY module is active' });
});

export default router;
