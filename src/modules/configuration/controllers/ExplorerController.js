import Category from '../models/Category.js';
import Template from '../models/Template.js';
import ProfileDescription from '../../sales/models/ProfileDescription.js';

export const getExplorerTree = async (req, res) => {
  try {
    const categories = await Category.find().lean();
    
    // Fetch all templates to count them per category
    const templates = await Template.find({}, 'categoryId').lean();
    const templateCounts = {};
    templates.forEach(t => {
      if (t.categoryId) {
        const idStr = t.categoryId.toString();
        templateCounts[idStr] = (templateCounts[idStr] || 0) + 1;
      }
    });

    // Group children by parent ID
    const nodesMap = {};
    categories.forEach(n => {
      const pId = n.parentId ? n.parentId.toString() : 'root';
      if (!nodesMap[pId]) nodesMap[pId] = [];
      nodesMap[pId].push({ 
        ...n, 
        children: [], 
        templateCount: templateCounts[n._id.toString()] || 0 
      });
    });

    const buildTree = (parentIdStr) => {
      const list = nodesMap[parentIdStr] || [];
      list.forEach(node => {
        node.children = buildTree(node._id.toString());
      });
      return list;
    };

    // Find roots
    const rootNodes = categories.filter(n => !n.parentId);
    const tree = rootNodes.map(rn => ({
      ...rn,
      children: buildTree(rn._id.toString())
    }));

    res.json(tree);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createCategory = async (req, res) => {
  try {
    const { name, parentId, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: 'Name is required' });
    const trimmed = name.trim();

    const newCategory = new Category({ name: trimmed, parentId: parentId || null, description });
    await newCategory.save();

    // If root category (Profile), sync with ProfileDescription
    if (!parentId) {
      try {
        await ProfileDescription.findOneAndUpdate(
          { name: { $regex: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
          { name: trimmed },
          { upsert: true }
        );
      } catch (e) {}
    }

    res.status(201).json(newCategory);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, parentId, description } = req.body;
    const category = await Category.findById(id);
    if (!category) return res.status(404).json({ message: 'Category not found' });

    const oldName = category.name;
    const isRoot = !category.parentId;

    if (name) category.name = name.trim();
    if (parentId !== undefined) category.parentId = parentId || null;
    if (description !== undefined) category.description = description;

    await category.save();

    // If root, update ProfileDescription as well
    if (isRoot && name && name.trim() !== oldName) {
      try {
        await ProfileDescription.findOneAndUpdate(
          { name: { $regex: new RegExp(`^${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
          { name: name.trim() }
        );
      } catch (e) {}
    }

    res.json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    
    const isRoot = !category.parentId;
    const categoryName = category.name;
    const deletedCategoryIds = [category._id];

    // Recursively delete all children
    const deleteRecursively = async (parentId) => {
      const children = await Category.find({ parentId });
      for (const child of children) {
        deletedCategoryIds.push(child._id);
        await deleteRecursively(child._id);
        await Category.findByIdAndDelete(child._id);
      }
    };
    
    await deleteRecursively(id);
    await Category.findByIdAndDelete(id);

    // Clean up all templates that were inside the deleted category or any of its subfolders
    await Template.deleteMany({ categoryId: { $in: deletedCategoryIds } });

    // If this was a root category, remove from ProfileDescription
    if (isRoot) {
      try {
        await ProfileDescription.deleteOne({ 
          name: { $regex: new RegExp(`^${categoryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } 
        });
      } catch (e) {}
    }

    res.json({ success: true, message: 'Folder, subfolders, and associated templates deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
