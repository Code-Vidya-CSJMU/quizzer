# Quizzer: Live Quiz App

A simple web app I built for hosting live quiz competitions at my college coding club. It supports real-time scoring, player interaction, and has admin controls. Uses FastAPI for the backend and React for the frontend.

## Features

### Core Functionality

- [x] **Real-time Updates**: Questions and answers update instantly for everyone
- [x] **Multiple Question Types**: Multiple-choice and free-text questions
- [x] **Timed Questions**: Set time limits for each question
- [x] **Dynamic Scoring**: Faster correct answers get more points
- [x] **Leaderboard**: See who's winning in real-time
- [x] **Admin Controls**: Easy interface for running the quiz

### Player Features

- [x] **Simple Registration**: Just need a name and email
- [x] **Lifelines**: 50:50 and hints when you're stuck
- [x] **Answer Locking**: Once you submit, no changing your mind
- [x] **Score Tracking**: See how you're doing compared to others

### Host Features

- [x] **Question Management**: Upload, save, and reuse question sets
- [x] **Quiz Controls**: Start, pause, resume, and reset as needed
- [x] **Answer Reveal**: Show everyone the right answer with stats
- [x] **Sudden Death**: Final rounds with only the top players
- [x] **Player Tracking**: See who's online and who's dropped
- [x] **Branding**: Add your club or organization's logo

### Technical Stuff

- [x] **Data Storage**: Everything saved as JSON files
- [x] **CORS Support**: Works across different domains
- [x] **WebSockets**: Fast real-time communication
- [x] **Mobile Friendly**: Works on phones and tablets

## To-Do List

- [ ] **Database**: Switch from file storage to a proper database
- [ ] **Better Auth**: Upgrade from basic token auth to something more robust
- [ ] **Team Mode**: Let people compete in teams
- [ ] **Media Questions**: Add support for images and videos in questions
- [ ] **Stats Dashboard**: More detailed statistics on how people are doing
- [ ] **Multiple Languages**: Support for non-English languages
- [ ] **Better Display Screen**: Show how many people are connected, who's answered, etc.
- [ ] **Advanced Theming Options**: More customization options for branding and UI appearance

## Setup

### What You Need

- Node.js (v16+)
- Python (v3.9+)
- npm or yarn

### Backend Setup

1. Create a Python virtual environment:

   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

2. Install the dependencies:

   ```bash
   pip install -r backend/requirements.txt
   ```

3. Start the server:

   ```bash
   uvicorn backend.app.main:asgi_app --reload
   ```

### Frontend Setup

1. Go to the frontend folder:

   ```bash
   cd frontend
   ```

2. Install the packages:

   ```bash
   npm install
   ```

3. Start the dev server:

   ```bash
   npm run dev
   ```

4. For production:

   ```bash
   npm run build
   ```

## Configuration

- `ADMIN_SECRET`: Password for admin access (default: "changeme")
- `MAX_POINTS_PER_QUESTION`: Highest possible score per question (default: 1000)
- `QUIZ_DATA_DIR`: Where to store data (default: backend/data)

## Usage Guide

### Accessing the App

- **Quiz Lobby**: `http://localhost:5173/`
- **Admin Panel**: `http://localhost:5173/admin`
- **Display View**: `http://localhost:5173/display` (for projecting to a big screen)

### API Endpoints

- REST API: `http://localhost:8000/api`
- Socket.IO: `http://localhost:8000/ws/socket.io`

### How to Run a Quiz

1. Go to the admin panel and log in with your admin token
2. Upload questions or pick a saved question set
3. Set up your quiz (lifelines, allowed participants)
4. Start the quiz and control it (next question, reveal answers, etc.)
5. Check the leaderboard to see who's winning

### How to Participate

1. Join through the lobby page
2. Sign up with your name and email
3. Answer the questions before time runs out
4. Use lifelines if you're stuck
5. Watch the leaderboard to see your score

## Contributing

Want to help make this quiz app better? Here's how:

### Development Process

1. Fork the repo
2. Create a branch for your feature (`git checkout -b cool-new-feature`)
3. Commit your changes (`git commit -m 'Added a cool new feature'`)
4. Push to your branch (`git push origin cool-new-feature`)
5. Open a Pull Request

### What You Could Work On

- Bug fixes for any issues you find
- New features from the to-do list above
- Better docs or examples
- More tests
- UI improvements

### Code Style

- For Python code, follow PEP 8
- Keep React components clean and consistent
- Add comments for any complex stuff

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- Built with [FastAPI](https://fastapi.tiangolo.com/), [Socket.IO](https://socket.io/), [React](https://reactjs.org/), and [Vite](https://vitejs.dev/)
- UI styled with [Tailwind CSS](https://tailwindcss.com/)
- Developed for educational purposes to enhance engagement in coding clubs and classrooms
