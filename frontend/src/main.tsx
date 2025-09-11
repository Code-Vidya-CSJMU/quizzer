import React from 'react'
import './index.css'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Lobby from './pages/Lobby'
import Quiz from './pages/Quiz'
import Admin from './pages/Admin'
import Display from './pages/Display'

const router = createBrowserRouter([
  { path: '/', element: <Lobby /> },
  { path: '/quiz', element: <Quiz /> },
  { path: '/admin', element: <Admin /> },
  { path: '/display', element: <Display /> },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
