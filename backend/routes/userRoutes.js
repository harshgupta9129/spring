
import express from 'express';
import User from '../models/User.js';

const router = express.Router();

// Create a new user
router.post('/', async (req, res) => {
    try {
        const { anonymousID, age, bmi, name, gender, height, weight, dailyLimit, avatar, activity, onboarded } = req.body;
        const user = new User({
            anonymousID, age, bmi, name, gender, height, weight, dailyLimit, avatar, activity, onboarded
        });
        await user.save();
        res.status(201).json(user);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update user profile
router.put('/:anonymousID', async (req, res) => {
    try {
        const updates = req.body;
        const user = await User.findOneAndUpdate(
            { anonymousID: req.params.anonymousID },
            { $set: updates },
            { new: true } // Return updated document
        );
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Get user by AnonymousID
router.get('/:anonymousID', async (req, res) => {
    try {
        const user = await User.findOne({ anonymousID: req.params.anonymousID });
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

export default router;
