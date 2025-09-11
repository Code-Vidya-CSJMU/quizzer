import React from 'react'
import './index.css'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Lobby from './pages/Lobby'
import Quiz from './pages/Quiz'
import Admin from './pages/Admin'

const router = createBrowserRouter([
  { path: '/', element: <Lobby /> },
  { path: '/quiz', element: <Quiz /> },
  { path: '/admin', element: <Admin /> },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
