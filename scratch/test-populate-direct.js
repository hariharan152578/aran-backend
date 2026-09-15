import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ProductionCard from '../src/modules/production/models/ProductionCard.js';
import Order from '../src/modules/sales/models/Order.js';
import Template from '../src/modules/configuration/models/Template.js';

dotenv.config({ path: '../.env' });

const extractIdString = (id) => {
  if (!id) return '';
  if (typeof id === 'object') {
    return extractIdString(id._id || id.id || '');
  }
  const str = String(id);
  return str === '[object Object]' ? '' : str;
};

const populateCard = async (card) => {
  const cardObj = card.toObject();
  
  if (card.orderId) {
    if (typeof card.orderId === 'object' && card.orderId !== null) {
      cardObj.orderId = {
        _id: extractIdString(card.orderId),
        customerName: card.orderId.customerName || card.customerName || 'Local/Custom Customer',
        projectName: card.orderId.projectName || card.projectName || 'Custom Project',
        status: card.orderId.status || 'Active',
        createdAt: card.orderId.createdAt || card.createdAt
      };
    } else if (mongoose.Types.ObjectId.isValid(card.orderId)) {
      try {
        const orderDoc = await Order.findById(card.orderId);
        if (orderDoc) {
          cardObj.orderId = orderDoc;
        } else {
          cardObj.orderId = {
            _id: extractIdString(card.orderId),
            customerName: card.customerName || 'Local/Custom Customer',
            projectName: card.projectName || 'Custom Project'
          };
        }
      } catch (err) {
        cardObj.orderId = {
          _id: extractIdString(card.orderId),
          customerName: card.customerName || 'Local/Custom Customer',
          projectName: card.projectName || 'Custom Project'
        };
      }
    } else {
      cardObj.orderId = {
        _id: extractIdString(card.orderId),
        customerName: card.customerName || 'Local/Custom Customer',
        projectName: card.projectName || 'Custom Project'
      };
    }
  }

  if (card.templateId) {
    if (typeof card.templateId === 'object' && card.templateId !== null) {
      cardObj.templateId = {
        _id: extractIdString(card.templateId),
        name: card.templateId.name || card.templateName || 'Local Template',
        code: String(card.templateId.code || card.templateId.name || extractIdString(card.templateId) || 'STD-TWIN')
      };
    } else if (mongoose.Types.ObjectId.isValid(card.templateId)) {
      try {
        const templateDoc = await Template.findById(card.templateId);
        if (templateDoc) {
          cardObj.templateId = templateDoc;
        } else {
          cardObj.templateId = {
            _id: extractIdString(card.templateId),
            name: card.templateName || 'Local Template',
            code: String(card.templateId)
          };
        }
      } catch (err) {
        cardObj.templateId = {
          _id: extractIdString(card.templateId),
          name: card.templateName || 'Local Template',
          code: String(card.templateId)
        };
      }
    } else {
      cardObj.templateId = {
        _id: extractIdString(card.templateId),
        name: card.templateName || 'Local Template',
        code: String(card.templateId)
      };
    }
  }

  return cardObj;
};

async function test() {
  try {
    await mongoose.connect('mongodb://localhost:27017/aran_erp');
    console.log("Connected to DB");
    const cards = await ProductionCard.find();
    console.log("Fetched", cards.length, "cards");
    
    const populated = await Promise.all(cards.map(async (card) => {
      return await populateCard(card);
    }));
    console.log("Populated successfully! First card:", populated[0]);
  } catch (err) {
    console.error("CRITICAL ERROR IN POPULATE:", err);
  } finally {
    await mongoose.disconnect();
  }
}

test();
