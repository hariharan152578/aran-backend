import express from 'express';
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'Aran ERP: ORDERS module is active' });
});

export default router;
