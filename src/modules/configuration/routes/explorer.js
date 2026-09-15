import express from 'express';
import { getExplorerTree, createCategory, updateCategory, deleteCategory } from '../controllers/ExplorerController.js';

const router = express.Router();

router.get('/', getExplorerTree);
router.post('/', createCategory);
router.put('/:id', updateCategory);
router.delete('/:id', deleteCategory);

export default router;
