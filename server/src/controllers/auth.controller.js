import Account from '../models/Account.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export const register = async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    const existing = await Account.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email đã tồn tại' });
    }
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const account = new Account({
      email,
      password: hashedPassword,
      name,
      role: 'user'
    });
    
    await account.save();
    
    const token = jwt.sign(
      { id: account._id, role: account.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      token,
      user: {
        id: account._id,
        email: account.email,
        name: account.name,
        role: account.role
      }
    });
    
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Đăng ký thất bại' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const account = await Account.findOne({ email });
    if (!account) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
    }
    
    const valid = await bcrypt.compare(password, account.password);
    if (!valid) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
    }
    
    const token = jwt.sign(
      { id: account._id, role: account.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      token,
      user: {
        id: account._id,
        email: account.email,
        name: account.name,
        role: account.role
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Đăng nhập thất bại' });
  }
};

export const getProfile = async (req, res) => {
  try {
    const account = await Account.findById(req.user.id).select('-password');
    res.json(account);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Lỗi lấy thông tin' });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { name } = req.body;
    const account = await Account.findByIdAndUpdate(
      req.user.id,
      { name },
      { new: true }
    ).select('-password');
    res.json(account);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Cập nhật thất bại' });
  }
};
