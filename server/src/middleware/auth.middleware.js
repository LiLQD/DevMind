import jwt from 'jsonwebtoken';
import Account from '../models/Account.js';
import dotenv from 'dotenv';

dotenv.config();

export const protect = async (req, res, next) => {
  let token;
  
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  
  if (!token) {
    return res.status(401).json({ message: 'Không có token xác thực' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const account = await Account.findById(decoded.id).select('-password');
    
    if (!account) {
      return res.status(401).json({ message: 'Token không hợp lệ' });
    }
    
    req.user = {
      id: account._id,
      email: account.email,
      role: account.role
    };
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ message: 'Token không hợp lệ' });
  }
};

export const admin = async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Yêu cầu quyền Admin' });
  }
  next();
};

export const staff = async (req, res, next) => {
  if (req.user.role !== 'staff' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Yêu cầu quyền Staff' });
  }
  next();
};
