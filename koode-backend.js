const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(cors());
app.use(express.json());

const client = new Anthropic();

// Mock database (replace with PostgreSQL)
let jobs = [];
let users = [];
let messages = [];
let jobIdCounter = 1;
let userIdCounter = 1;
let messageIdCounter = 1;

// ==================== AUTH ====================
app.post('/api/auth/register', (req, res) => {
  const { email, name, userType, skills } = req.body; // userType: 'employer' | 'seeker'
  
  const userId = userIdCounter++;
  const user = {
    id: userId,
    email,
    name,
    userType,
    skills: userType === 'seeker' ? skills : null, // only seekers have skills
    createdAt: new Date(),
  };
  
  users.push(user);
  res.json({ success: true, userId, message: 'User registered' });
});

app.post('/api/auth/login', (req, res) => {
  const { email } = req.body;
  const user = users.find(u => u.email === email);
  
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  
  res.json({ success: true, userId: user.id, userType: user.userType });
});

// ==================== JOBS ====================
app.post('/api/jobs', (req, res) => {
  const { employerId, title, description, location, salary, requirements } = req.body;
  
  const job = {
    id: jobIdCounter++,
    employerId,
    title,
    description,
    location,
    salary,
    requirements, // array of skills
    createdAt: new Date(),
    status: 'active',
  };
  
  jobs.push(job);
  res.json({ success: true, jobId: job.id, job });
});

app.get('/api/jobs', (req, res) => {
  // Filter by location/search if needed
  res.json(jobs.filter(j => j.status === 'active'));
});

app.get('/api/jobs/:jobId', (req, res) => {
  const job = jobs.find(j => j.id === parseInt(req.params.jobId));
  res.json(job || { error: 'Not found' });
});

// ==================== PROFILES ====================
app.get('/api/users/:userId', (req, res) => {
  const user = users.find(u => u.id === parseInt(req.params.userId));
  res.json(user || { error: 'Not found' });
});

app.put('/api/users/:userId', (req, res) => {
  const user = users.find(u => u.id === parseInt(req.params.userId));
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  Object.assign(user, req.body);
  res.json({ success: true, user });
});

// ==================== MESSAGING ====================
app.post('/api/messages', (req, res) => {
  const { senderId, receiverId, jobId, message } = req.body;
  
  const msg = {
    id: messageIdCounter++,
    senderId,
    receiverId,
    jobId,
    message,
    createdAt: new Date(),
    read: false,
  };
  
  messages.push(msg);
  res.json({ success: true, messageId: msg.id });
});

app.get('/api/messages/:userId', (req, res) => {
  const userId = parseInt(req.params.userId);
  const userMessages = messages.filter(
    m => m.receiverId === userId || m.senderId === userId
  );
  res.json(userMessages);
});

// ==================== AI MATCHING ====================
app.post('/api/ai/recommend-jobs', async (req, res) => {
  const { seekerId } = req.body;
  const seeker = users.find(u => u.id === seekerId);
  
  if (!seeker || seeker.userType !== 'seeker') {
    return res.status(400).json({ error: 'Invalid seeker' });
  }
  
  const activJobs = jobs.filter(j => j.status === 'active');
  
  const prompt = `You are a job matching AI. Match the following job seeker to relevant job opportunities.

Job Seeker Profile:
- Name: ${seeker.name}
- Skills: ${seeker.skills?.join(', ') || 'Not specified'}
- Experience: ${seeker.experience || 'Not provided'}

Available Jobs:
${activJobs.map(j => `
Job ID ${j.id}: ${j.title}
- Requirements: ${j.requirements?.join(', ') || 'None specified'}
- Location: ${j.location}
- Salary: ${j.salary}
- Description: ${j.description}
`).join('\n')}

Recommend the top 3 most relevant jobs for this seeker. Return JSON format:
{
  "recommendations": [
    { "jobId": number, "matchScore": 0-100, "reason": "string" }
  ]
}

Be strict with matching - only recommend jobs where skills align significantly.`;

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-1',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    
    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const recommendations = jsonMatch ? JSON.parse(jsonMatch[0]) : { recommendations: [] };
    
    res.json({ success: true, recommendations: recommendations.recommendations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== HEALTH ====================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', jobs: jobs.length, users: users.length });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`KOODE Backend running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
