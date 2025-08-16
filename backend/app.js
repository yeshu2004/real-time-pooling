const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/pollingDB')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error(err));

// Schemas
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, enum: ['student', 'teacher'], required: true }
});

const answerSchema = new mongoose.Schema({
  pollId: { type: mongoose.Schema.Types.ObjectId, ref: 'Poll' },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  selectedOption: Number
});

const optionSubSchema = new mongoose.Schema({
  content: { type: String, required: true },
  isCorrect: { type: Boolean, default: false }
});

const pollSchema = new mongoose.Schema({
  question: String,
  options: [optionSubSchema],
  timeLimit: Number,
  active: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Answer = mongoose.model('Answer', answerSchema);
const Poll = mongoose.model('Poll', pollSchema);

// API to create user
app.post('/api/create-user', async (req, res) => {
  const { name, role } = req.body;
  try {
    let user = await User.findOne({ name, role });
    if (!user) {
      user = new User({ name, role });
      await user.save();
    }
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API to create poll (for teacher)
app.post('/api/create-poll', async (req, res) => {
  const { question, options, correctOption, timeLimit, createdBy } = req.body; // createdBy is teacherId
  try {
    const teacher = await User.findById(createdBy);
    if (!teacher || teacher.role !== 'teacher') {
      return res.status(403).json({ error: 'Invalid teacher' });
    }
    await Poll.deleteMany({ active: true }); // Clear active polls (single poll assumption)
    const newPoll = new Poll({ question, options, correctOption, timeLimit, createdBy });
    await newPoll.save();

    const pollToEmit = {
      ...newPoll.toObject(),
      options: newPoll.options.map(opt => ({ content: opt.content }))
    };
    io.emit('new-poll', pollToEmit); // Broadcast to students without isCorrect

    startTimer(newPoll._id, timeLimit);
    res.status(201).json(newPoll);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Function to start timer and handle expiration
function startTimer(pollId, timeLimit) {
  let remaining = timeLimit;
  const interval = setInterval(async () => {
    remaining--;
    io.emit('timer-update', remaining);
    if (remaining <= 0) {
      clearInterval(interval);
      const poll = await Poll.findById(pollId);
      if (poll) {
        poll.active = false;
        await poll.save();
        const results = await calculateResults(pollId);
        io.emit('poll-ended', { results, correctOption: poll.correctOption });
      }
    }
  }, 1000);
}

// Calculate percentage results
async function calculateResults(pollId) {
  const totalAnswers = await Answer.countDocuments({ pollId });
  if (totalAnswers === 0) {
    const poll = await Poll.findById(pollId);
    return poll.options.map(() => 0);
  }
  const aggregates = await Answer.aggregate([
    { $match: { pollId: new mongoose.Types.ObjectId(pollId) } },
    { $group: { _id: '$selectedOption', count: { $sum: 1 } } }
  ]);
  const poll = await Poll.findById(pollId);
  const counts = poll.options.map((_, idx) => {
    const agg = aggregates.find(a => a._id === idx);
    return agg ? agg.count : 0;
  });
  return counts.map(count => ((count / totalAnswers) * 100).toFixed(2));
}

// Socket.io connections
io.on('connection', socket => {
  console.log('User connected');

  // Student submits answer
  socket.on('submit-answer', async ({ pollId, studentId, selectedOption }) => {
    try {
      const poll = await Poll.findById(pollId);
      if (poll && poll.active) {
        const existingAnswer = await Answer.findOne({ pollId, studentId });
        if (!existingAnswer) { // Prevent multiple answers per student
          const newAnswer = new Answer({ pollId, studentId, selectedOption });
          await newAnswer.save();
          // Optionally broadcast live updates
        }
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Fetch current poll on connect (for late joiners)
  socket.on('get-current-poll', async () => {
   const currentPoll = await Poll.findOne({ active: true }).populate('createdBy', 'name');
    if (currentPoll) {
      const pollToEmit = {
        ...currentPoll.toObject(),
        options: currentPoll.options.map(opt => ({ content: opt.content }))
      };
      socket.emit('new-poll', pollToEmit);
    }
  });

  socket.on('disconnect', () => console.log('User disconnected'));
});

server.listen(5000, () => console.log('Server running on port 5000'));